import React, { useState, useEffect, useRef } from 'react';
import { ApplicantApplication, AutomatorConfig, AutomationLog } from './types';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { ApplicationTable } from './components/ApplicationTable';
import { TerminalConsole } from './components/TerminalConsole';
import { StatusBar } from './components/StatusBar';
import { ApplicationDetailModal } from './components/ApplicationDetailModal';

// 80 Realistic UK candidate names for Job Centre Plus notifications
const JCP_CANDIDATE_POOL = [
  'Arthur Pendelton', 'Clara Oswald', 'Marcus Vance', 'Priyanka Sharma', 'David Tennant',
  'Sarah J. Miller', 'James Whittaker', 'Elena Rostova', 'Mark Thompson', 'Linda Greyson',
  'Thomas Shelby', 'Anabelle Lee', 'Richard Dawkins', 'Florence Welch', 'Harrison Ford',
  'Amira Patel', 'Benjamin Hughes', 'Chloe Bennett', 'Daniel Craig', 'Emily Blunt',
  'Fiona Gallagher', 'George MacKay', 'Hannah Abbott', 'Ian McKellen', 'Jasmine Kaur',
  'Kevin Bridges', 'Laura Carmichael', 'Michael Sheen', 'Nina Simone', 'Oliver Twist',
  'Penelope Cruz', 'Quentin Blake', 'Rose Tyler', 'Simon Pegg', 'Tamsin Greig',
  'Uma Thurman', 'Victor Hugo', 'Wendy Darling', 'Xavier Charles', 'Yusuf Islam',
  'Zoe Wanamaker', 'Adam Peaty', 'Beatrice Webb', 'Callum Turner', 'Daisy Ridley',
  'Edgar Wright', 'Freya Allan', 'Gareth Southgate', 'Hollie Doyle', 'Ivor Novello',
  'Jude Law', 'Kiri Pritchard', 'Liam Gallagher', 'Miriam Margolyes', 'Ncuti Gatwa',
  'Olivia Colman', 'Paddy Considine', 'Queen Latifah', 'Riz Ahmed', 'Saoirse Ronan',
  'Tom Hiddleston', 'Ursula LeGuin', 'Vera Stanhope', 'Winston Churchill', 'Xena Warrior',
  'Yolanda Adams', 'Zayn Malik', 'Alistair Brownlee', 'Bethany Shriever', 'Chris Hoy',
  'Dina Asher-Smith', 'Eilish McColgan', 'Mo Farah', 'Geraint Thomas', 'Helen Glover',
  'Idris Elba', 'Jessica Ennis', 'Katarina Johnson', 'Lando Norris', 'Max Whitlock'
];

export default function App() {
  const [config, setConfig] = useState<AutomatorConfig>({
    employerEmail: 'nigel@cecan.co.uk',
    batchDirectoryName: 'job_centre_applications_2026',
    useGeminiAiParsing: true,
    requestDelayMs: 250
  });

  const [applications, setApplications] = useState<ApplicantApplication[]>([]);
  const [selectedApp, setSelectedApp] = useState<ApplicantApplication | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [systemLogs, setSystemLogs] = useState<AutomationLog[]>([
    { timestamp: new Date().toLocaleTimeString(), step: 'SYSTEM', level: 'info', message: 'RecruitFlow JCP Automator v1.0.7 initialized.' },
    { timestamp: new Date().toLocaleTimeString(), step: 'BROWSER', level: 'info', message: 'Chromium / Playwright engine mounted on localhost:3000.' }
  ]);

  const stopSignalRef = useRef(false);

  const addLog = (step: string, level: 'info' | 'success' | 'warning' | 'error', message: string) => {
    setSystemLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), step, level, message }]);
  };

  // Helper to sanitize folder name
  const getCleanFolderName = (name: string, index: number) => {
    const clean = name.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/__+/g, '_');
    return `${String(index + 1).padStart(2, '0')}_${clean || 'Candidate'}`;
  };

  // Load 80 Example Emails
  const handleLoadExamples = async () => {
    addLog('QUEUE', 'info', 'Loading Job Centre Plus applicant notification batch (80 emails)...');
    try {
      const res = await fetch('/api/example-emails');
      const data = await res.json();
      const baseSamples = data.samples || [];

      const batch: ApplicantApplication[] = [];
      const nowStr = new Date().toLocaleTimeString();

      for (let i = 0; i < 80; i++) {
        const sample = baseSamples[i % baseSamples.length];
        const name = JCP_CANDIDATE_POOL[i] || `Candidate ${i + 1}`;
        const refNum = `JCP-${88000 + i}`;
        const portalUrl = `${window.location.origin}/api/portal/mock-cv/app_${101 + (i % 5)}`;

        const rawContent = `Job Centre Plus Automated Notification\n\nBranch: High Street Central #412\nApplicant Name: ${name}\nVacancy Ref: ${refNum}\n\nCover Letter Submitted:\nDear Employer,\nI am writing to formally apply for the advertised role (Ref: ${refNum}). I have relevant customer support and office administration experience. I am reliable, punctual, and fully proficient in standard office software and records management.\nThank you for considering my application.\nYours sincerely,\n${name}\n\nSecure Candidate CV Portal Link:\n${portalUrl}\n\nNote: You will be required to verify registered employer email address before downloading CV.`;

        batch.push({
          id: `app_${String(i + 1).padStart(3, '0')}`,
          applicantName: name,
          jobTitle: `Vacancy Ref: ${refNum}`,
          referenceNumber: refNum,
          emailSubject: `Job Centre Plus Application: ${name} (${refNum})`,
          rawEmailContent: rawContent,
          coverLetterText: `Dear Employer,\nI am writing to formally apply for the advertised role (Ref: ${refNum}). I have relevant customer support and office administration experience. I am reliable, punctual, and fully proficient in standard office software and records management.\nThank you for considering my application.\nYours sincerely,\n${name}`,
          cvPortalUrl: portalUrl,
          extractedViaAI: false,
          status: 'idle',
          statusMessage: 'Ready to process',
          logs: [],
          folderName: getCleanFolderName(name, i),
          createdAt: nowStr
        });
      }

      setApplications(batch);
      addLog('QUEUE', 'success', `Loaded exactly 80 candidate applications into processing queue.`);
    } catch (err: any) {
      addLog('QUEUE', 'error', `Failed to load example batch: ${err.message}`);
    }
  };

  // Upload local .eml directory or files
  const handleUploadFiles = async (fileList: FileList) => {
    addLog('UPLOAD', 'info', `Reading ${fileList.length} files from local filesystem...`);
    const newApps: ApplicantApplication[] = [];
    const nowStr = new Date().toLocaleTimeString();

    let count = 0;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.name.startsWith('.')) continue; // ignore .DS_Store or hidden system files
      
      try {
        const text = await file.text();
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[_]/g, ' ');
        const cleanName = baseName || `Candidate ${count + 1}`;

        newApps.push({
          id: `app_eml_${Date.now()}_${count}`,
          applicantName: cleanName,
          jobTitle: `File: ${file.name}`,
          referenceNumber: `EML-${count + 1}`,
          emailSubject: file.name,
          rawEmailContent: text,
          coverLetterText: text.slice(0, 400), // Initial preview before AI extraction
          cvPortalUrl: '', // Will be extracted during batch run
          extractedViaAI: false,
          status: 'idle',
          statusMessage: 'Uploaded EML ready',
          logs: [],
          folderName: getCleanFolderName(cleanName, count),
          createdAt: nowStr
        });
        count++;
      } catch (err: any) {
        console.warn(`Failed reading file ${file.name}:`, err);
      }
    }

    if (newApps.length > 0) {
      setApplications(newApps);
      addLog('UPLOAD', 'success', `Successfully loaded ${newApps.length} local .eml files into processing queue.`);
    } else {
      addLog('UPLOAD', 'warning', `No readable email files detected in selection.`);
    }
  };

  // Run single application automation
  const runSingleAutomation = async (app: ApplicantApplication, index: number) => {
    // Update status to parsing
    setApplications(prev => prev.map(item => item.id === app.id ? { ...item, status: 'parsing' } : item));
    addLog(`ID:${app.id.replace('app_', '')}`, 'info', `Processing application for ${app.applicantName}...`);

    try {
      // Step A: Parse email text
      let applicantName = app.applicantName;
      let coverLetterText = app.coverLetterText;
      let cvPortalUrl = app.cvPortalUrl;

      const parseRes = await fetch('/api/parse-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: app.rawEmailContent, useAI: config.useGeminiAiParsing })
      });
      const parseData = await parseRes.json();

      if (parseData) {
        if (parseData.applicantName && parseData.applicantName !== 'Unknown Applicant') applicantName = parseData.applicantName;
        if (parseData.coverLetter) coverLetterText = parseData.coverLetter;
        if (parseData.cvUrl) cvPortalUrl = parseData.cvUrl;
      }

      setApplications(prev => prev.map(item => item.id === app.id ? {
        ...item,
        applicantName,
        coverLetterText,
        cvPortalUrl: cvPortalUrl || item.cvPortalUrl,
        extractedViaAI: parseData.extractedViaAI || false,
        status: 'portal_navigating'
      } : item));

      addLog(`ID:${app.id.replace('app_', '')}`, 'info', `(a) Extracted cover letter (${coverLetterText.length} chars). (b) Visiting verification web page...`);

      // Step B: Portal Navigation & Email Gate Submission
      setApplications(prev => prev.map(item => item.id === app.id ? { ...item, status: 'downloading_pdf' } : item));

      const autoRes = await fetch('/api/run-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: app.id,
          employerEmail: config.employerEmail,
          cvPortalUrl: cvPortalUrl || app.cvPortalUrl,
          applicantName
        })
      });

      const autoData = await autoRes.json();

      if (!autoRes.ok || !autoData.success) {
        throw new Error(autoData.error || 'Portal navigation failed to download PDF');
      }

      const folderName = getCleanFolderName(applicantName, index);
      const finalFileName = autoData.pdfFileName || `${applicantName.replace(/\s+/g, '_')}_CV.pdf`;

      // Step C: Folder Structure Created
      setApplications(prev => prev.map(item => item.id === app.id ? {
        ...item,
        status: 'success',
        statusMessage: 'Downloaded & filed',
        folderName,
        pdfBufferBase64: autoData.pdfBase64,
        pdfSizeKb: autoData.pdfSizeKb,
        pdfFileName: finalFileName,
        logs: autoData.logs || []
      } : item));

      addLog('FS_EXEC', 'info', `fs.mkdirSync('/${config.batchDirectoryName}/${folderName}')`);
      addLog('FS_EXEC', 'info', `fs.writeFileSync('/${config.batchDirectoryName}/${folderName}/cover_letter.txt')`);
      addLog('FS_EXEC', 'info', `fs.writeFileSync('/${config.batchDirectoryName}/${folderName}/${finalFileName}')`);
      addLog(`ID:${app.id.replace('app_', '')}`, 'success', `✓ Completed workflow for ${applicantName}`);

      return true;
    } catch (err: any) {
      setApplications(prev => prev.map(item => item.id === app.id ? {
        ...item,
        status: 'error',
        statusMessage: err.message || 'Automation failed'
      } : item));
      addLog(`ID:${app.id.replace('app_', '')}`, 'error', `✕ Failed ${app.applicantName}: ${err.message}`);
      return false;
    }
  };

  // Start Batch for all 80
  const handleStartBatch = async () => {
    if (applications.length === 0) return;
    setIsProcessing(true);
    stopSignalRef.current = false;
    addLog('BATCH', 'info', `Starting batch automation for ${applications.length} applications...`);

    const pendingApps = applications.map((app, idx) => ({ app, idx })).filter(item => item.app.status !== 'success');

    for (let i = 0; i < pendingApps.length; i++) {
      if (stopSignalRef.current) {
        addLog('BATCH', 'warning', 'Batch automation stopped by user.');
        break;
      }

      const { app, idx } = pendingApps[i];
      await runSingleAutomation(app, idx);

      // Polite delay
      if (i < pendingApps.length - 1 && !stopSignalRef.current) {
        await new Promise(r => setTimeout(r, config.requestDelayMs || 200));
      }
    }

    setIsProcessing(false);
    addLog('BATCH', 'success', 'Batch automation execution finished.');
  };

  const handleStopBatch = () => {
    stopSignalRef.current = true;
    setIsProcessing(false);
    addLog('BATCH', 'warning', 'Sending stop signal to browser threads...');
  };

  // Export ZIP
  const handleExportZip = async () => {
    const successApps = applications.filter(app => app.status === 'success' && app.pdfBufferBase64);
    if (successApps.length === 0) {
      addLog('ARCHIVE', 'warning', 'No successfully downloaded applications to export yet. Run automation first.');
      return;
    }

    addLog('ARCHIVE', 'info', `Generating ZIP archive containing ${successApps.length} folders...`);
    try {
      const res = await fetch('/api/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applications: successApps,
          batchName: config.batchDirectoryName
        })
      });

      if (!res.ok) throw new Error('ZIP generation failed on server');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.batchDirectoryName}_export.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      addLog('ARCHIVE', 'success', `✓ Successfully downloaded ZIP archive (${Math.round(blob.size / 1024)} KB)`);
    } catch (err: any) {
      addLog('ARCHIVE', 'error', `ZIP export error: ${err.message}`);
    }
  };

  const successCount = applications.filter(a => a.status === 'success').length;
  const failedCount = applications.filter(a => a.status === 'error').length;
  const remainingCount = applications.filter(a => ['idle', 'parsing', 'portal_navigating', 'downloading_pdf'].includes(a.status)).length;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0C0D0E] text-[#E0E0E0] font-sans overflow-hidden border border-[#2D2D2D]">
      {/* Top Navbar */}
      <Navbar />

      {/* Main Workspace Body */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar
          config={config}
          onConfigChange={setConfig}
          onLoadExamples={handleLoadExamples}
          onUploadFiles={handleUploadFiles}
          onStartBatch={handleStartBatch}
          onStopBatch={handleStopBatch}
          onExportZip={handleExportZip}
          isProcessing={isProcessing}
          totalCount={applications.length}
          successCount={successCount}
          hasApplications={applications.length > 0}
        />

        {/* Center / Right Content: Table + Terminal */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#0C0D0E]">
          <ApplicationTable
            applications={applications}
            onSelectApp={setSelectedApp}
            onExportLogs={() => {
              const text = systemLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.step}] ${l.message}`).join('\n');
              const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'automation_console.log';
              a.click();
            }}
            totalCount={applications.length}
          />

          <TerminalConsole
            logs={systemLogs}
            isProcessing={isProcessing}
          />
        </main>
      </div>

      {/* Footer Status Bar */}
      <StatusBar
        total={applications.length}
        successCount={successCount}
        failedCount={failedCount}
        remainingCount={remainingCount}
        isProcessing={isProcessing}
      />

      {/* Application Inspector Modal */}
      <ApplicationDetailModal
        application={selectedApp}
        onClose={() => setSelectedApp(null)}
        onRunSingle={(app) => {
          const idx = applications.findIndex(a => a.id === app.id);
          runSingleAutomation(app, idx >= 0 ? idx : 0);
        }}
        isProcessing={isProcessing}
      />
    </div>
  );
}

