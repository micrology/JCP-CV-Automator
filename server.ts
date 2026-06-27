import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import AdmZip from 'adm-zip';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { simpleParser } from 'mailparser';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazy AI Client Initialization
function getAiClient(customApiKey?: string): GoogleGenAI | null {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
}

// In-memory application storage for session preview
interface StoredApp {
  id: string;
  applicantName: string;
  jobTitle?: string;
  emailSubject: string;
  rawEmailContent: string;
  coverLetterText: string;
  cvPortalUrl: string;
  extractedViaAI: boolean;
  status: 'idle' | 'parsing' | 'portal_navigating' | 'downloading_pdf' | 'success' | 'error';
  statusMessage: string;
  logs: { timestamp: string; step: string; level: 'info' | 'success' | 'warning' | 'error'; message: string }[];
  folderName: string;
  pdfBufferBase64?: string;
  pdfFileName?: string;
  pdfSizeKb?: number;
  createdAt: string;
}

const sessionStore = new Map<string, StoredApp>();

// Helper to sanitize folder names
function sanitizeFolderName(name: string, index: number): string {
  const clean = name.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/__+/g, '_');
  const padIndex = String(index).padStart(2, '0');
  return `${padIndex}_${clean || 'Applicant'}`;
}

// Helper: Extract original URL from wrappers like Outlook Safelinks or Proofpoint Urldefense
function unwrapUrl(urlStr: string): string {
  if (!urlStr) return '';
  let cleaned = urlStr.trim().replace(/&amp;/gi, '&');
  
  // Clean trailing punctuation first
  cleaned = cleaned.replace(/[.,;><\)\]"]+$/, '');

  try {
    // Handle Safelinks
    if (cleaned.toLowerCase().includes('safelinks.protection.outlook.com')) {
      const url = new URL(cleaned);
      const targetUrl = url.searchParams.get('url');
      if (targetUrl) {
        cleaned = targetUrl;
      }
    }
    // Handle Proofpoint
    if (cleaned.toLowerCase().includes('urldefense.proofpoint.com')) {
      const url = new URL(cleaned);
      const targetUrl = url.searchParams.get('u');
      if (targetUrl) {
        let u = targetUrl;
        u = u.replace(/_/g, '/').replace(/--/g, '-');
        if (u.startsWith('http-3A__')) u = u.replace('http-3A__', 'http://');
        if (u.startsWith('https-3A__')) u = u.replace('https-3A__', 'https://');
        cleaned = u;
      }
    }
  } catch (err) {
    // Ignore
  }

  // Final decode if it's percent-encoded
  try {
    if (cleaned.includes('%')) {
      cleaned = decodeURIComponent(cleaned);
    }
  } catch (e) {}

  return cleaned.trim();
}

// Clean and unwrap a candidate URL
function cleanAndUnwrapUrl(urlStr: string): string {
  if (!urlStr) return '';
  
  let cleaned = urlStr.trim();
  
  // Clean trailing punctuation and HTML entities/wrappers
  cleaned = cleaned.replace(/&amp;/gi, '&');
  cleaned = cleaned.replace(/[.,;><\)\]"\s']+$/, '');
  
  // Decode any percent-encoded characters (like %3D, %2F)
  try {
    if (cleaned.includes('%')) {
      cleaned = decodeURIComponent(cleaned);
    }
  } catch (e) {}

  cleaned = unwrapUrl(cleaned);
  
  // Unwrap again in case of nested wrappers
  cleaned = unwrapUrl(cleaned);

  // Clean trailing punctuation again on the unwrapped URL
  cleaned = cleaned.replace(/[.,;><\)\]"\s']+$/, '');

  return cleaned;
}

// Extract URLs from raw email text, supporting soft-wrapped and hard-wrapped line breaks
function extractUrlsFromText(text: string): string[] {
  const urls: string[] = [];
  if (!text) return urls;
  
  // First, normalize soft line breaks with/without spaces
  let normalized = text.replace(/=\s*\r?\n\s*/g, '');
  
  // Handle "=3D" which is a common quoted-printable artifact
  normalized = normalized.replace(/=3D/gi, '=');

  // Find all standard URLs
  const regex = /https?:\/\/[^\s<)"]+/gi;
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    urls.push(match[0]);
  }

  // Also handle hard wrapping where a URL is split across lines WITHOUT an equals sign
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('http://') || line.includes('https://')) {
      const startIdx = line.indexOf('http');
      let urlPart = line.slice(startIdx);
      
      if (i + 1 < lines.length) {
        const nextLine = lines[i+1].trim();
        // A continuation has no spaces, does not start with http, and only has URL-safe characters
        if (nextLine && !nextLine.includes(' ') && !nextLine.includes('http') && /^[a-zA-Z0-9_\-\.\?=\/&%#\+:]+$/.test(nextLine)) {
          if (urlPart.endsWith('=')) {
            urlPart = urlPart.slice(0, -1);
          }
          const reconstructed = urlPart + nextLine;
          urls.push(reconstructed);
        }
      }
    }
  }

  return urls;
}

// Extract URLs from email HTML part, including href and originalsrc attributes
function extractUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  if (!html) return urls;
  
  try {
    const $ = cheerio.load(html);
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href) urls.push(href);
      
      const originalSrc = $(el).attr('originalsrc');
      if (originalSrc) urls.push(originalSrc);
    });
    
    // Also extract text nodes in case plain URLs are written without anchor tags
    const text = $.text();
    const textUrls = extractUrlsFromText(text);
    urls.push(...textUrls);
  } catch (err) {
    // Ignore cheerio error
  }
  
  return urls;
}

// Select the absolute best candidate URL representing the CV portal download link
function selectBestPortalUrl(urls: string[]): string {
  const cleanedUrls = urls.map(u => cleanAndUnwrapUrl(u)).filter(Boolean);
  
  // Rank 1: documents.service.gov.uk portal links
  const govLink = cleanedUrls.find(u => u.toLowerCase().includes('documents.service.gov.uk'));
  if (govLink) return govLink;
  
  // Rank 2: mock-cv link
  const mockLink = cleanedUrls.find(u => u.toLowerCase().includes('mock-cv'));
  if (mockLink) return mockLink;

  // Rank 3: any service.gov.uk link
  const anyGov = cleanedUrls.find(u => u.toLowerCase().includes('service.gov.uk'));
  if (anyGov) return anyGov;

  // Rank 4: Return first non-generic URL
  const genericDomains = ['microsoft.com', 'office365.com', 'outlook.com', 'google.com', 'gov.uk/government', 'static.notifications.service.gov.uk'];
  const nonGeneric = cleanedUrls.find(u => {
    const lower = u.toLowerCase();
    return !genericDomains.some(domain => lower.includes(domain));
  });
  if (nonGeneric) return nonGeneric;

  return cleanedUrls[0] || '';
}

// Minimal valid PDF Generator for realistic test portal downloads
function createSamplePdfBuffer(applicantName: string, jobRef: string = 'JCP-88412'): Buffer {
  const content = `Job Centre Plus Verified CV\n\nApplicant Name: ${applicantName}\nReference: ${jobRef}\nDate: ${new Date().toLocaleDateString('en-GB')}\n\nExperience Summary:\n- Dedicated professional with strong background in operations and customer service.\n- Experienced in standard office software and collaborative workflows.\n- References available upon request from Job Centre Plus local branch.`;
  
  // Create a minimal uncompressed PDF structure
  const cleanText = content.replace(/\n/g, ') Tj T* (').replace(/[()\\]/g, '\\$&');
  const pdfStr = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length 200 >> stream
BT /F1 12 Tf 50 720 Td 16 TL (${cleanText}) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000239 00000 n 
0000000308 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
560
%%EOF`;
  return Buffer.from(pdfStr, 'utf8');
}

// --- API ROUTES ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 1. Get Example Emails (realistic Job Centre Plus emails)
app.get('/api/example-emails', (req, res) => {
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const hostUrl = req.headers.host ? `${proto}://${req.headers.host}` : 'http://localhost:3000';
  const sampleApps = [
    {
      id: 'app_101',
      name: 'Arthur Pendelton',
      subject: 'Application for Office Administrator (Ref: JCP-9021)',
      body: `Dear Employer,\n\nPlease find details of an applicant who has applied for your job vacancy posted at Job Centre Plus (Branch: High Street Central).\n\nApplicant Name: Arthur Pendelton\nVacancy Ref: JCP-9021\n\nCover Letter Submitted:\n------------------------------------------------\nDear Hiring Manager,\n\nI am writing to express my enthusiastic interest in the Office Administrator position advertised at the local Job Centre. With over six years of administrative experience in busy municipal offices, I am adept at managing records, coordinating schedules, and ensuring smooth daily operations. I pride myself on punctuality, attention to detail, and friendly communication.\n\nThank you for considering my application. I look forward to the opportunity to discuss my skills.\n\nYours sincerely,\nArthur Pendelton\n------------------------------------------------\n\nTo download Arthur Pendelton's CV, please click the secure portal link below:\n${hostUrl}/api/portal/mock-cv/app_101\n\nNote: You will be prompted to verify your registered employer email address before downloading.`
    },
    {
      id: 'app_102',
      name: 'Clara Oswald',
      subject: 'Application for Customer Service Assistant (Ref: JCP-9021)',
      body: `Job Centre Plus Notification\n\nNew Application Received!\n\nApplicant: Clara Oswald\nApplied For: Customer Service Assistant\n\nCovering Note:\nDear Sir/Madam,\nI would like to submit my application for the vacancy. I have extensive customer support background in retail and telephone enquiries. I am available for immediate start and am fully trained in data protection compliance.\nBest regards,\nClara Oswald\n\nAccess Applicant CV Document:\n=> ${hostUrl}/api/portal/mock-cv/app_102\n\nJob Centre Plus Automation Services.`
    },
    {
      id: 'app_103',
      name: 'Marcus Vance',
      subject: 'Job Centre Plus Applicant: Marcus Vance',
      body: `Dear Employer,\n\nWe have forwarded a candidate for your review.\n\nName: Marcus Vance\n\nCover Letter:\nI am applying for the advertised vacancy. As an organized worker with 4 years in warehouse inventory and dispatch logistics, I bring reliability and strong problem-solving skills to every team. I hold a clean driving license and am comfortable with computer inventory databases.\n\nDownload Candidate CV (PDF):\n${hostUrl}/api/portal/mock-cv/app_103`
    },
    {
      id: 'app_104',
      name: 'Priyanka Sharma',
      subject: 'Application: Priyanka Sharma - Office Support',
      body: `Job Centre Plus Automated Delivery\n\nCandidate details:\nPriyanka Sharma\n\nCovering Letter:\nTo whom it may concern,\nPlease accept this letter as my application for the role. Having recently completed an NVQ Level 3 in Business Administration, I am eager to apply my skills in document management, bookkeeping assistance, and client reception.\n\nCV Link:\n${hostUrl}/api/portal/mock-cv/app_104`
    },
    {
      id: 'app_105',
      name: 'David Tennant',
      subject: 'JCP Applicant Notification #88419',
      body: `Hello,\n\nAn applicant has responded to your job advertisement.\n\nCandidate: David Tennant\n\nCover Letter:\nDear Nigel,\nI am writing regarding the position advertised at Job Centre Plus. My career spans multiple customer-facing and project coordination roles. I possess excellent communication abilities and a calm demeanor under pressure.\n\nSecure CV Download Link:\n${hostUrl}/api/portal/mock-cv/app_105`
    }
  ];

  res.json({ samples: sampleApps });
});

// 2. Parse Raw Email (Regex + AI fallback)
app.post('/api/parse-email', async (req, res) => {
  const { rawText, useAI = true, geminiApiKey } = req.body;
  if (!rawText) return res.status(400).json({ error: 'Missing rawText parameter' });

  // Try parsing .eml headers if it looks like standard MIME email
  let textToParse = rawText;
  let parsedSubject = '';
  let emailHtml = '';
  if (rawText.includes('Subject:') || rawText.includes('Content-Type:') || rawText.includes('Received:') || rawText.includes('From:')) {
    try {
      const parsed = await simpleParser(rawText);
      if (parsed.text) textToParse = parsed.text;
      if (parsed.html) emailHtml = typeof parsed.html === 'string' ? parsed.html : '';
      if (parsed.subject) parsedSubject = parsed.subject;
    } catch (e) {
      // Ignore parser error and use raw string
    }
  }

  // Clean up any quoted-printable MIME artifacts (like =\r\n line wraps or =3D)
  const cleanedText = textToParse.replace(/=\r?\n/g, '').replace(/=3D/g, '=');

  // Perform robust URL extraction
  const textUrls = extractUrlsFromText(textToParse);
  const htmlUrls = emailHtml ? extractUrlsFromHtml(emailHtml) : [];
  const allCandidateUrls = [...textUrls, ...htmlUrls];
  const selectedPortalUrl = selectBestPortalUrl(allCandidateUrls);

  // AI Parsing
  const ai = getAiClient(geminiApiKey);
  if (useAI && ai) {
    try {
      const prompt = `You are an expert email parser helping an employer process job applications from "Job Centre Plus" or GOV.UK Notify.
Analyze the following email text and extract:
1. applicantName: Full name of the job applicant.
2. coverLetter: The exact cover letter text written by the applicant. Remove generic email headers/disclaimers/footers, keeping just the candidate's letter.
3. cvUrl: The web link / URL inside the email that points to downloading or viewing the CV.
4. jobTitle: The job title or reference number if mentioned.

Return strict JSON matching this schema:
{
  "applicantName": string,
  "coverLetter": string,
  "cvUrl": string,
  "jobTitle": string
}

Email Text:
${cleanedText}`;

      let aiRes;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          aiRes = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
          });
          break;
        } catch (retryErr: any) {
          if (attempt === 2) throw retryErr;
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      if (aiRes && aiRes.text) {
        const data = JSON.parse(aiRes.text.trim());
        let cleanedCvUrl = data.cvUrl ? String(data.cvUrl) : '';
        cleanedCvUrl = cleanAndUnwrapUrl(cleanedCvUrl);

        // Safeguard: ALWAYS prefer our highly robust, deterministic selectedPortalUrl if available
        if (selectedPortalUrl) {
          cleanedCvUrl = selectedPortalUrl;
        } else if (!cleanedCvUrl) {
          cleanedCvUrl = '';
        }

        return res.json({
          applicantName: data.applicantName || 'Unknown Applicant',
          coverLetter: data.coverLetter || cleanedText.slice(0, 1000),
          cvUrl: cleanedCvUrl,
          jobTitle: data.jobTitle || parsedSubject || 'Job Application',
          extractedViaAI: true
        });
      }
    } catch (err: any) {
      console.log('Notice: Gemini AI busy or unavailable (503/429). Advancing with local regex parser.');
    }
  }

  // Fallback Regex Parser
  const nameMatch = cleanedText.match(/(?:Applicant Name|Applicant|Candidate|Name):\s*([^\r\n]+)/i);
  
  // Simple heuristic for cover letter: extract text between markers or body
  let coverLetter = cleanedText;
  const letterMatch = cleanedText.match(/(?:Cover Letter|Covering Note|Covering Letter|Letter)[:\r\n]+([\s\S]+?)(?:\r?\n\r?\n(?:To download|Access|Download|CV Link)|$)/i);
  if (letterMatch && letterMatch[1]) {
    coverLetter = letterMatch[1].trim();
  }

  res.json({
    applicantName: nameMatch ? nameMatch[1].trim() : 'Applicant',
    coverLetter: coverLetter.trim(),
    cvUrl: selectedPortalUrl,
    jobTitle: parsedSubject || 'Job Application',
    extractedViaAI: false
  });
});

// Helper: Validate document buffer magic bytes to reject HTML web pages and identify correct extension
function validateDownloadedDocument(buffer: Buffer, urlStr: string, candidateName?: string) {
  const headStr = buffer.slice(0, 500).toString('utf-8').trim().toLowerCase();
  // Reject HTML web pages (e.g. login gate, cookie notice, confirm prompt, error page)
  if (headStr.startsWith('<!doctype') || headStr.startsWith('<html') || headStr.includes('<body') || headStr.includes('<form') || headStr.includes('govuk-') || headStr.includes('<head')) {
    return null;
  }

  // Identify binary format via file header magic signatures
  let ext = '.pdf';
  if (buffer.slice(0, 4).toString() === '%PDF' || buffer.slice(0, 5).toString() === '%PDF-') {
    ext = '.pdf';
  } else if (buffer[0] === 0x50 && buffer[1] === 0x4B) { // PK zip signature (.docx)
    ext = '.docx';
  } else if (buffer.slice(0, 8).toString('hex') === 'd0cf11e0a1b11ae1') {
    ext = '.doc';
  } else if (headStr.startsWith('{\\rtf')) {
    ext = '.rtf';
  }

  let nameStem = candidateName ? candidateName.replace(/\s+/g, '_') : 'Candidate';
  if (!nameStem || nameStem === 'Candidate' || nameStem === 'Applicant') {
    const urlStem = path.basename(urlStr.split('?')[0]);
    if (urlStem && urlStem !== 'download' && urlStem.length > 2) {
      nameStem = urlStem.replace(/\.(pdf|docx?|rtf|txt)$/i, '');
    }
  }

  return {
    pdfBase64: buffer.toString('base64'),
    pdfSizeKb: Math.round(buffer.length / 1024),
    pdfFileName: `${nameStem}_CV${ext}`
  };
}

// Helper: Copy all cookies in the jar to the target domain, bypassing domain/path isolation
function syncCookiesToDomain(jar: any, targetUrlStr: string) {
  try {
    const targetUrl = new URL(targetUrlStr);
    const targetHost = targetUrl.hostname;
    const serialized = jar.toJSON();
    if (serialized && Array.isArray(serialized.cookies)) {
      for (const c of serialized.cookies) {
        const cookieStr = `${c.key}=${c.value}; Path=/`;
        jar.setCookieSync(cookieStr, targetUrlStr, { ignoreError: true });
      }
    }
  } catch (err) {
    // Ignore
  }
}

// 3. Run Portal Automation (Multi-step sequential crawler: Landing -> Gate -> Download -> PDF)
app.post('/api/run-automation', async (req, res) => {
  let { appId, employerEmail, cvPortalUrl, applicantName } = req.body;
  if (!cvPortalUrl) return res.status(400).json({ error: 'No CV Portal URL provided' });

  cvPortalUrl = unwrapUrl(cvPortalUrl);

  const logs: { timestamp: string; step: string; level: 'info' | 'success' | 'warning' | 'error'; message: string }[] = [];
  const log = (step: string, level: 'info' | 'success' | 'warning' | 'error', message: string) => {
    logs.push({ timestamp: new Date().toLocaleTimeString(), step, level, message });
  };

  log('Initialization', 'info', `Starting multi-step automation session for portal URL: ${cvPortalUrl.split('?')[0]}...`);

  try {
    // Setup Axios with CookieJar support for multi-step navigation across domains
    // Disable public suffix rejection so cookies can be set on domains like service.gov.uk
    const jar = new CookieJar(undefined, { rejectPublicSuffixes: false });
    const client = wrapper(axios.create({
      jar,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9'
      },
      timeout: 15000,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    }));

    let currentUrl = cvPortalUrl;
    let currentHtml = '';

    // Allow up to 30 sequential stage hops (e.g., GOV.UK Notify Landing -> Confirm Email Form -> Download Link -> Binary PDF/DOCX)
    const MAX_HOPS = 30;
    const visitedHistory: { hop: number; url: string; htmlLength: number; title: string }[] = [];

    for (let hop = 1; hop <= MAX_HOPS; hop++) {
      log(`Workflow Hop ${hop}`, 'info', `Inspecting portal stage at: ${currentUrl.split('?')[0]}...`);
      try {
        const jarJson = jar.toJSON();
        const cookieCount = jarJson.cookies ? jarJson.cookies.length : 0;
        log('Cookies info', 'info', `Cookie Jar contains ${cookieCount} cookie(s).`);
      } catch (err) {
        log('Cookies error', 'warning', `Could not serialize cookies.`);
      }

      // 1. Fetch current URL if we don't have HTML from a previous action yet
      let resp;
      if (hop === 1 || !currentHtml) {
        syncCookiesToDomain(jar, currentUrl);
        resp = await client.get(currentUrl, { responseType: 'arraybuffer' });
      } else {
        resp = {
          status: 200,
          data: Buffer.from(currentHtml, 'utf-8'),
          headers: { 'content-type': 'text/html' },
          request: { res: { responseUrl: currentUrl } }
        };
      }

      // Handle HTTP redirects (3xx)
      if (resp.status && resp.status >= 300 && resp.status < 400) {
        const location = resp.headers?.location;
        if (location) {
          const redirectUrl = new URL(location, currentUrl).toString();
          log('Redirect', 'info', `Redirected (${resp.status}) to: ${redirectUrl.split('?')[0]}...`);
          currentUrl = redirectUrl;
          currentHtml = '';
          continue;
        }
      }

      const contentType = String(resp.headers?.['content-type'] || '').toLowerCase();
      const buffer = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data);

      // Check if response is directly a binary document
      const docResult = validateDownloadedDocument(buffer, currentUrl, applicantName);
      if (docResult) {
        log('Document Acquired', 'success', `Successfully downloaded candidate CV document! (${docResult.pdfSizeKb} KB - ${docResult.pdfFileName})`);
        return res.json({
          success: true,
          logs,
          pdfBase64: docResult.pdfBase64,
          pdfSizeKb: docResult.pdfSizeKb,
          pdfFileName: docResult.pdfFileName
        });
      }

      currentHtml = buffer.toString('utf-8');
      currentUrl = resp.request?.res?.responseUrl || currentUrl;
      const $ = cheerio.load(currentHtml);

      const pageTitle = $('title').text().trim() || 'No Title';
      const pageH1 = $('h1').first().text().trim() || 'No Heading';
      const htmlLength = currentHtml.length;

      log(`Page Visited`, 'info', `Title: "${pageTitle}" | Header: "${pageH1}" | Bytes: ${htmlLength}`);

      // Check if we have seen this page content or URL before in this session
      const duplicateHopIndex = visitedHistory.findIndex(h => 
        (h.url === currentUrl && h.htmlLength === htmlLength) ||
        (h.title === pageTitle && h.htmlLength === htmlLength && htmlLength > 0)
      );

      if (duplicateHopIndex !== -1) {
        const dupHop = visitedHistory[duplicateHopIndex];
        log('Loop Detected', 'error', `Infinite loop detected! Page was already processed in Hop ${dupHop.hop} ("${dupHop.title}") with the same URL and content.`);
        return res.status(422).json({
          success: false,
          logs,
          error: `Exceeded maximum portal navigation hops due to infinite loop. Loop detected between Hop ${dupHop.hop} and Hop ${hop}.`
        });
      }

      visitedHistory.push({
        hop,
        url: currentUrl,
        htmlLength,
        title: pageTitle
      });

      // --- PRIORITY 1: Check for direct PDF download button or link on this page ---
      let directDownloadHref = '';
      $('a').each((_, el) => {
        if (directDownloadHref) return;
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim().toLowerCase();
        const hasDownloadAttr = $(el).attr('download') !== undefined;

        if (href && !href.startsWith('#') && !href.includes('contact-us') && !href.includes('www.gov.uk')) {
          if (href.toLowerCase().includes('.pdf') || href.toLowerCase().includes('.doc') || href.toLowerCase().includes('.docx') || href.toLowerCase().includes('.rtf') || href.toLowerCase().includes('download.documents.service.gov.uk') || hasDownloadAttr || (text.includes('download') && (text.includes('pdf') || text.includes('cv') || text.includes('word') || text.includes('doc') || text.includes('device')))) {
            directDownloadHref = href;
          }
        }
      });

      if (directDownloadHref) {
        const pdfTargetUrl = new URL(directDownloadHref, currentUrl).toString();
        log('Stage: Download Link', 'success', `Located document download button. Fetching document file...`);
        syncCookiesToDomain(jar, pdfTargetUrl);
        const pdfResp = await client.get(pdfTargetUrl, {
          headers: { 'Referer': currentUrl },
          responseType: 'arraybuffer'
        });

        if (pdfResp.status && pdfResp.status >= 300 && pdfResp.status < 400) {
          const location = pdfResp.headers?.location;
          if (location) {
            const redirectUrl = new URL(location, pdfTargetUrl).toString();
            log('Redirect', 'info', `Download link redirected (${pdfResp.status}) to: ${redirectUrl.split('?')[0]}...`);
            currentUrl = redirectUrl;
            currentHtml = '';
            continue;
          }
        }

        const pdfBuf = Buffer.from(pdfResp.data);
        const linkDocResult = validateDownloadedDocument(pdfBuf, pdfTargetUrl, applicantName);

        if (linkDocResult) {
          log('Workflow Complete', 'success', `Candidate CV downloaded successfully (${linkDocResult.pdfSizeKb} KB - ${linkDocResult.pdfFileName})`);
          return res.json({
            success: true,
            logs,
            pdfBase64: linkDocResult.pdfBase64,
            pdfSizeKb: linkDocResult.pdfSizeKb,
            pdfFileName: linkDocResult.pdfFileName
          });
        }

        log('Stage: Security Challenge', 'info', `Download link returned HTML verification page. Inspecting identity gate...`);
        currentHtml = pdfBuf.toString('utf-8');
        currentUrl = pdfResp.request?.res?.responseUrl || pdfTargetUrl;
        continue;
      }

      // --- PRIORITY 2: Check for Email Challenge / Security Verification Form ---
      const emailInput = $('input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i]').first();
      if (emailInput.length > 0) {
        const form = emailInput.closest('form');
        const inputName = emailInput.attr('name') || 'email';
        log('Stage: Security Challenge', 'info', `Detected identity gate [name="${inputName}"]. Preparing verification...`);

        const action = form.attr('action') || '';
        const method = (form.attr('method') || 'POST').toUpperCase();
        const submitUrl = action ? new URL(action, currentUrl).toString() : currentUrl;

        // Collect all form inputs (including hidden CSRF tokens)
        const formPayload = new URLSearchParams();
        form.find('input').each((_, el) => {
          const name = $(el).attr('name');
          const val = $(el).attr('value') || '';
          const type = $(el).attr('type') || 'text';
          if (name && type !== 'submit') {
            formPayload.append(name, val);
          }
        });

        // Set employer email to satisfy challenge
        const targetEmail = employerEmail || 'nigel@cecan.co.uk';
        formPayload.set(inputName, targetEmail);

        log('Submit Verification', 'info', `Submitting verification address (${targetEmail}) via ${method}...`);

        let gateResp;
        syncCookiesToDomain(jar, submitUrl);
        if (method === 'GET') {
          gateResp = await client.get(`${submitUrl}?${formPayload.toString()}`, { responseType: 'arraybuffer' });
        } else {
          gateResp = await client.post(submitUrl, formPayload.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': currentUrl },
            responseType: 'arraybuffer'
          });
        }

        if (gateResp.status && gateResp.status >= 300 && gateResp.status < 400) {
          const location = gateResp.headers?.location;
          if (location) {
            const redirectUrl = new URL(location, submitUrl).toString();
            log('Redirect', 'info', `Form post redirected (${gateResp.status}) to: ${redirectUrl.split('?')[0]}...`);
            currentUrl = redirectUrl;
            currentHtml = '';
            continue;
          }
        }

        const gateBuf = Buffer.from(gateResp.data);
        const gateDocResult = validateDownloadedDocument(gateBuf, submitUrl, applicantName);
        if (gateDocResult) {
          log('Workflow Complete', 'success', `Security challenge accepted. Document retrieved! (${gateDocResult.pdfFileName})`);
          return res.json({
            success: true,
            logs,
            pdfBase64: gateDocResult.pdfBase64,
            pdfSizeKb: gateDocResult.pdfSizeKb,
            pdfFileName: gateDocResult.pdfFileName
          });
        }

        currentHtml = gateBuf.toString('utf-8');
        currentUrl = gateResp.request?.res?.responseUrl || submitUrl;
        log('Verification Accepted', 'success', `Identity confirmed. Advancing workflow to next stage...`);
        continue;
      }

      // --- PRIORITY 3: Check for intermediary "Continue" / "Proceed" / "View File" button ---
      let stageAdvanceHref = '';
      let actionLabel = '';
      $('a, button').each((_, el) => {
        if (stageAdvanceHref) return;
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim().toLowerCase();
        const role = $(el).attr('role') || '';
        const className = $(el).attr('class') || '';

        if (role === 'button' || className.includes('button') || className.includes('btn') || className.includes('govuk-button')) {
          if (text === 'continue' || text === 'next' || text === 'proceed' || text.includes('view') || text.includes('access') || text.includes('download')) {
            if (href && !href.startsWith('#') && !href.includes('contact-us') && !href.includes('www.gov.uk')) {
              stageAdvanceHref = href;
              actionLabel = $(el).text().trim();
            }
          }
        }
      });

      if (stageAdvanceHref) {
        const nextUrl = new URL(stageAdvanceHref, currentUrl).toString();
        log('Stage: Intermediary Landing', 'info', `Clicking "${actionLabel}" button -> navigating to next stage...`);
        syncCookiesToDomain(jar, nextUrl);
        const nextResp = await client.get(nextUrl, {
          headers: { 'Referer': currentUrl },
          responseType: 'arraybuffer'
        });

        if (nextResp.status && nextResp.status >= 300 && nextResp.status < 400) {
          const location = nextResp.headers?.location;
          if (location) {
            const redirectUrl = new URL(location, nextUrl).toString();
            log('Redirect', 'info', `Button click redirected (${nextResp.status}) to: ${redirectUrl.split('?')[0]}...`);
            currentUrl = redirectUrl;
            currentHtml = '';
            continue;
          }
        }

        const nextBuf = Buffer.from(nextResp.data);
        const nextDocResult = validateDownloadedDocument(nextBuf, nextUrl, applicantName);

        if (nextDocResult) {
          log('Workflow Complete', 'success', `Navigation directly downloaded candidate CV! (${nextDocResult.pdfFileName})`);
          return res.json({
            success: true,
            logs,
            pdfBase64: nextDocResult.pdfBase64,
            pdfSizeKb: nextDocResult.pdfSizeKb,
            pdfFileName: nextDocResult.pdfFileName
          });
        }

        currentHtml = nextBuf.toString('utf-8');
        currentUrl = nextResp.request?.res?.responseUrl || nextUrl;
        continue;
      }

      log('Stage Unrecognized', 'error', `Could not identify a clear download link, email challenge form, or continue button on page.`);
      return res.status(422).json({ success: false, logs, error: 'Workflow halted: unknown portal page structure.' });
    }

    return res.status(422).json({ success: false, logs, error: 'Exceeded maximum portal navigation hops.' });
  } catch (err: any) {
    log('Fatal Error', 'error', err.message || 'Automation failed');
    res.status(500).json({ success: false, logs, error: err.message });
  }
});

// 4. Export All as Single ZIP Archive
app.post('/api/export-zip', (req, res) => {
  const { applications, batchName = 'JobCentre_Applications' } = req.body;
  if (!applications || !Array.isArray(applications) || applications.length === 0) {
    return res.status(400).json({ error: 'No applications provided to zip' });
  }

  try {
    const zip = new AdmZip();
    let count = 0;

    for (let i = 0; i < applications.length; i++) {
      const app = applications[i];
      const folderName = app.folderName || sanitizeFolderName(app.applicantName || 'Applicant', i + 1);

      // (a) Extract cover letter as plain text file
      const coverText = app.coverLetterText || 'No cover letter extracted.';
      zip.addFile(`${folderName}/cover_letter.txt`, Buffer.from(coverText, 'utf8'));

      // (b) Put CV document file
      if (app.pdfBufferBase64) {
        const pdfBuffer = Buffer.from(app.pdfBufferBase64, 'base64');
        let fileName = app.pdfFileName || `${app.applicantName ? app.applicantName.replace(/\s+/g, '_') : 'Applicant'}_CV.pdf`;

        // Safeguard: verify magic file header signatures to reject HTML and enforce matching extension
        const headStr = pdfBuffer.slice(0, 500).toString('utf8').trim().toLowerCase();
        if (!headStr.startsWith('<!doctype') && !headStr.startsWith('<html') && !headStr.includes('<body')) {
          if (pdfBuffer.slice(0, 5).toString() === '%PDF-' && !fileName.toLowerCase().endsWith('.pdf')) {
            fileName = fileName.replace(/\.[^/.]+$/, '') + '.pdf';
          } else if (pdfBuffer.slice(0, 4).toString() === 'PK\x03\x04' && !fileName.toLowerCase().endsWith('.docx')) {
            fileName = fileName.replace(/\.[^/.]+$/, '') + '.docx';
          }
          zip.addFile(`${folderName}/${fileName}`, pdfBuffer);
        }
      }
      count++;
    }

    const zipBuffer = zip.toBuffer();
    const cleanBatchName = batchName.replace(/[^a-zA-Z0-9_\-]/g, '_');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanBatchName}_${Date.now()}.zip"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);

  } catch (err: any) {
    console.error('ZIP creation failed:', err);
    res.status(500).json({ error: 'Failed to generate ZIP archive' });
  }
});


// --- SIMULATED JOB CENTRE PLUS PORTAL (For immediate 1-click testing) ---

app.get('/api/portal/mock-cv/:appId', (req, res) => {
  const { appId } = req.params;
  const applicantNames: Record<string, string> = {
    'app_101': 'Arthur Pendelton',
    'app_102': 'Clara Oswald',
    'app_103': 'Marcus Vance',
    'app_104': 'Priyanka Sharma',
    'app_105': 'David Tennant'
  };
  const name = applicantNames[appId] || 'Job Applicant';

  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Job Centre Plus - Secure CV Access</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f0f4f8; margin: 0; padding: 40px 20px; color: #1e293b; }
    .card { max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); padding: 32px; border-top: 6px solid #0284c7; }
    .logo { font-size: 20px; font-weight: 700; color: #0284c7; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
    h1 { font-size: 18px; margin: 0 0 12px 0; }
    p { color: #64748b; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
    label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    input[type="email"] { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; margin-bottom: 20px; }
    button { background: #0284c7; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; width: 100%; transition: background 0.2s; }
    button:hover { background: #0369a1; }
    .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🏛️ Job Centre Plus | Employer Portal</div>
    <h1>Secure Candidate CV Portal</h1>
    <p>You are accessing the confidential curriculum vitae for <strong>${name}</strong> (Job Centre Plus Applicant ID: ${appId}). To comply with UK Data Protection regulations, please verify your registered employer email address.</p>
    <form action="/api/portal/mock-cv/${appId}/verify" method="POST">
      <label for="emp_email">Registered Employer Email Address</label>
      <input type="email" id="emp_email" name="employer_email" required placeholder="e.g. nigel@cecan.co.uk" />
      <input type="hidden" name="session_token" value="sec_tok_8912441" />
      <button type="submit">Verify & Access Candidate CV</button>
    </form>
    <div class="footer">Department for Work and Pensions &copy; 2026</div>
  </div>
</body>
</html>`);
});

app.post('/api/portal/mock-cv/:appId/verify', (req, res) => {
  const { appId } = req.params;
  const email = req.body.employer_email || 'Verified Employer';
  const applicantNames: Record<string, string> = {
    'app_101': 'Arthur Pendelton',
    'app_102': 'Clara Oswald',
    'app_103': 'Marcus Vance',
    'app_104': 'Priyanka Sharma',
    'app_105': 'David Tennant'
  };
  const name = applicantNames[appId] || 'Job Applicant';

  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Job Centre Plus - Download CV</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f0f4f8; margin: 0; padding: 40px 20px; color: #1e293b; }
    .card { max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); padding: 32px; border-top: 6px solid #10b981; text-align: center; }
    .badge { display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; margin-bottom: 16px; }
    h1 { font-size: 20px; margin: 0 0 12px 0; }
    p { color: #64748b; font-size: 14px; line-height: 1.5; margin-bottom: 28px; }
    .btn-download { display: inline-block; background: #10b981; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 700; font-size: 15px; box-shadow: 0 2px 6px rgba(16,185,129,0.3); }
    .btn-download:hover { background: #059669; }
    .meta { font-size: 12px; color: #94a3b8; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓ EMAIL VERIFIED: ${email}</div>
    <h1>Candidate CV Ready</h1>
    <p>Authentication complete. You may now download the verified PDF Curriculum Vitae for candidate <strong>${name}</strong>.</p>
    <a href="/api/portal/mock-cv/${appId}/download.pdf?candidate=${encodeURIComponent(name)}" class="btn-download">📥 Download ${name} CV (PDF)</a>
    <div class="meta">Document Format: Adobe PDF | Size: ~140 KB</div>
  </div>
</body>
</html>`);
});

app.get('/api/portal/mock-cv/:appId/download.pdf', (req, res) => {
  const { appId } = req.params;
  const candidateName = (req.query.candidate as string) || 'Applicant';
  const pdfBuffer = createSamplePdfBuffer(candidateName, `REF-${appId}`);

  const cleanFileName = `${candidateName.replace(/\s+/g, '_')}_CV.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${cleanFileName}"`);
  res.send(pdfBuffer);
});


// --- VITE MIDDLEWARE FOR SPA ---

if (process.env.NODE_ENV !== 'production') {
  createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  }).then((vite) => {
    app.use(vite.middlewares);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Job Centre Plus CV Automator Server running on http://0.0.0.0:${PORT}`);
    });
  });
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Production Server running on port ${PORT}`);
  });
}
