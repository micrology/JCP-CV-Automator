import React from 'react';
import { ApplicantApplication } from '../types';
import { X, FileText, FileDown, FolderOpen, Mail, ExternalLink, CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface ApplicationDetailModalProps {
  application: ApplicantApplication | null;
  onClose: () => void;
  onRunSingle: (app: ApplicantApplication) => void;
  isProcessing: boolean;
}

export const ApplicationDetailModal: React.FC<ApplicationDetailModalProps> = ({
  application,
  onClose,
  onRunSingle,
  isProcessing
}) => {
  if (!application) return null;

  const downloadSinglePdf = () => {
    if (!application.pdfBufferBase64) return;
    const byteCharacters = atob(application.pdfBufferBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = application.pdfFileName || `${application.applicantName.replace(/\s+/g, '_')}_CV.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadCoverLetterTxt = () => {
    const blob = new Blob([application.coverLetterText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cover_letter.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-text">
      <div className="bg-[#121315] border border-[#333] rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans text-[#E0E0E0]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#161719] border-b border-[#2D2D2D] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/10 border border-blue-500/30 rounded-lg text-blue-400">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
                {application.applicantName}
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-[#2D2D2D] text-[#AAA]">
                  ID: {application.id}
                </span>
              </h3>
              <p className="text-xs text-[#888] font-mono truncate max-w-lg">
                Folder: <span className="text-blue-400">/{application.folderName}/</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#888] hover:text-white hover:bg-[#2D2D2D] rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
          {/* Left Column: Cover Letter Extraction (Task A) */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#2D2D2D] pb-2">
              <span className="font-bold text-[#AAA] flex items-center gap-2 font-sans">
                <FileText className="w-4 h-4 text-green-400" />
                (a) Extracted Cover Letter (.txt)
              </span>
              <button
                onClick={downloadCoverLetterTxt}
                className="text-[11px] bg-[#1A1B1E] border border-[#333] hover:border-[#555] px-2.5 py-1 rounded text-[#CCC] flex items-center gap-1 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" /> Save .txt
              </button>
            </div>

            <div className="bg-[#0C0D0E] border border-[#2D2D2D] rounded p-4 text-[#DDD] whitespace-pre-wrap flex-1 max-h-80 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {application.coverLetterText || 'No cover letter extracted yet.'}
            </div>

            {/* Email Metadata */}
            <div className="bg-[#161719] border border-[#2D2D2D] rounded p-3 text-[11px] space-y-1.5 text-[#888]">
              <div className="flex justify-between">
                <span>Subject:</span> <span className="text-[#CCC] truncate max-w-[220px]">{application.emailSubject}</span>
              </div>
              <div className="flex justify-between">
                <span>Parsing Method:</span>{' '}
                <span className={application.extractedViaAI ? 'text-blue-400 font-bold' : 'text-purple-400 font-bold'}>
                  {application.extractedViaAI ? '✨ Gemini AI' : '⚡ Fast Regex'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Portal Download (Task B) & Folder Target (Task C) */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#2D2D2D] pb-2">
              <span className="font-bold text-[#AAA] flex items-center gap-2 font-sans">
                <FileDown className="w-4 h-4 text-blue-400" />
                (b) Portal Downloaded CV
              </span>
              {application.pdfBufferBase64 ? (
                <button
                  onClick={downloadSinglePdf}
                  className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded font-semibold flex items-center gap-1 cursor-pointer shadow-sm"
                >
                  <FileDown className="w-3.5 h-3.5" /> Download File
                </button>
              ) : (
                <span className="text-[10px] text-yellow-500 italic">Pending automation</span>
              )}
            </div>

            {/* Preview Card */}
            <div className="bg-[#0C0D0E] border border-[#2D2D2D] rounded p-5 flex flex-col items-center justify-center gap-3 flex-1 min-h-[180px]">
              {application.status === 'success' && application.pdfBufferBase64 ? (
                <>
                  <div className={`w-16 h-20 ${application.pdfFileName?.match(/\.docx?$/i) ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' : 'bg-red-500/10 border-red-500/40 text-red-400'} border-2 rounded flex flex-col items-center justify-center shadow-lg`}>
                    <span className="text-lg font-bold">{application.pdfFileName?.match(/\.docx?$/i) ? 'DOC' : 'PDF'}</span>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-white text-sm">{application.pdfFileName || 'Candidate_CV.pdf'}</div>
                    <div className="text-[#888] text-[11px] mt-0.5">Verified Binary Size: {application.pdfSizeKb || '~140'} KB</div>
                  </div>
                  <div className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 px-3 py-1 rounded-full flex items-center gap-1.5">
                    <CheckCircle className="w-3 h-3" /> Successfully downloaded via employer verification gate
                  </div>
                </>
              ) : application.status === 'error' ? (
                <div className="text-center text-red-400 space-y-2">
                  <AlertCircle className="w-8 h-8 mx-auto opacity-80" />
                  <div className="font-bold">Portal Automation Failed</div>
                  <div className="text-[11px] text-[#888] max-w-xs">{application.statusMessage}</div>
                  <button
                    onClick={() => onRunSingle(application)}
                    disabled={isProcessing}
                    className="mt-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs cursor-pointer"
                  >
                    Retry Portal Automation
                  </button>
                </div>
              ) : (
                <div className="text-center text-[#888] space-y-2">
                  <Clock className="w-8 h-8 mx-auto opacity-50 animate-pulse" />
                  <div className="font-semibold text-[#CCC]">Awaiting Execution</div>
                  <p className="text-[11px] max-w-xs">
                    Portal link: <span className="text-blue-400 underline break-all">{application.cvPortalUrl}</span>
                  </p>
                  <button
                    onClick={() => onRunSingle(application)}
                    disabled={isProcessing}
                    className="mt-1 bg-[#1A1B1E] border border-blue-500/50 text-blue-400 hover:bg-blue-500/10 px-3 py-1.5 rounded text-xs cursor-pointer"
                  >
                    Run Automation for {application.applicantName}
                  </button>
                </div>
              )}
            </div>

            {/* Folder Target (Task C) */}
            <div className="bg-[#1A1B1E] border border-[#2D2D2D] rounded p-3 text-[11px]">
              <div className="font-bold text-[#AAA] mb-2 font-sans flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-yellow-400" />
                (c) Folder Assignment Schema
              </div>
              <div className="bg-[#0C0D0E] p-2.5 rounded border border-[#333] space-y-1 font-mono text-[10px] text-[#BBB]">
                <div className="text-blue-400">📁 /{application.folderName}/</div>
                <div className="pl-4 flex items-center gap-1.5 text-green-400">
                  <span>📄 cover_letter.txt</span>
                  <span className="text-[#666]">({application.coverLetterText.length} chars)</span>
                </div>
                <div className="pl-4 flex items-center gap-1.5 text-red-400">
                  <span>📑 {application.pdfFileName || `${application.applicantName.replace(/\s+/g, '_')}_CV.pdf`}</span>
                  <span className="text-[#666]">({application.pdfSizeKb ? `${application.pdfSizeKb} KB` : 'Pending'})</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#161719] border-t border-[#2D2D2D] flex items-center justify-between shrink-0">
          <div className="text-xs text-[#666] font-mono">
            Automator Portal Navigation Log: {application.logs.length} steps recorded
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#2D2D2D] hover:bg-[#3D3D3D] text-white rounded text-xs font-semibold cursor-pointer transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
