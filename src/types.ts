/**
 * Shared types for Job Centre Plus CV Automator
 */

export interface ApplicantApplication {
  id: string;
  applicantName: string;
  jobTitle?: string;
  referenceNumber?: string;
  emailSubject: string;
  rawEmailContent: string;
  coverLetterText: string;
  cvPortalUrl: string;
  extractedViaAI: boolean;
  status: 'idle' | 'parsing' | 'portal_navigating' | 'downloading_pdf' | 'success' | 'error';
  statusMessage: string;
  logs: AutomationLog[];
  folderName: string;
  pdfBufferBase64?: string; // Stored temporarily in memory so user can preview or export ZIP
  pdfFileName?: string;
  pdfSizeKb?: number;
  createdAt: string;
}

export interface AutomationLog {
  timestamp: string;
  step: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface AutomatorConfig {
  employerEmail: string;
  batchDirectoryName: string;
  useGeminiAiParsing: boolean;
  requestDelayMs: number; // Polite delay between portal hits
  geminiApiKey?: string;
}

export interface ParseEmailResponse {
  applicantName: string;
  coverLetter: string;
  cvUrl: string;
  jobTitle?: string;
  referenceNumber?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface BatchProcessRequest {
  config: AutomatorConfig;
  applications: {
    id: string;
    rawText?: string;
    fileName?: string;
  }[];
}
