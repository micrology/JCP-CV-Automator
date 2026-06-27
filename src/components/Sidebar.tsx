import React, { useState } from 'react';
import { AutomatorConfig } from '../types';
import { FolderGit2, Mail, Bot, Play, Download, RefreshCw, StopCircle, CheckCircle2, FolderUp, FileUp, Trash2 } from 'lucide-react';
import { DirectoryBrowserModal } from './DirectoryBrowserModal';

interface SidebarProps {
  config: AutomatorConfig;
  onConfigChange: (newConfig: AutomatorConfig) => void;
  onUploadFiles: (files: FileList) => void;
  onStartBatch: () => void;
  onStopBatch: () => void;
  onExportZip: () => void;
  onClearAll: () => void;
  isProcessing: boolean;
  totalCount: number;
  successCount: number;
  hasApplications: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  config,
  onConfigChange,
  onUploadFiles,
  onStartBatch,
  onStopBatch,
  onExportZip,
  onClearAll,
  isProcessing,
  totalCount,
  successCount,
  hasApplications
}) => {
  const percent = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;
  const [isBrowseModalOpen, setIsBrowseModalOpen] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const handleClearClick = () => {
    if (!showConfirmClear) {
      setShowConfirmClear(true);
      setTimeout(() => setShowConfirmClear(false), 3000);
    } else {
      onClearAll();
      setShowConfirmClear(false);
    }
  };

  return (
    <aside className="w-80 border-r border-[#2D2D2D] bg-[#121315] p-5 flex flex-col gap-6 shrink-0 overflow-y-auto select-none">
      {/* Source Configuration */}
      <section>
        <h2 className="text-[10px] font-bold text-[#666] uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Mail className="w-3 h-3 text-blue-400" />
          Source Configuration
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-[#888] mb-1.5">Registered Employer Email</label>
            <input
              type="email"
              value={config.employerEmail}
              onChange={(e) => onConfigChange({ ...config, employerEmail: e.target.value })}
              placeholder="e.g. employer@company.com"
              className="w-full bg-[#1C1D1F] border border-[#333] rounded px-3 py-2 text-xs text-[#E0E0E0] focus:outline-none focus:border-blue-500 font-mono transition-colors"
            />
            <span className="text-[10px] text-[#666] mt-1 block">Entered into portal verification gates</span>
          </div>

          <div>
            <label className="block text-[11px] text-[#888] mb-1.5">Gemini API Key (Optional)</label>
            <input
              type="password"
              value={config.geminiApiKey || ''}
              onChange={(e) => onConfigChange({ ...config, geminiApiKey: e.target.value })}
              placeholder="AI Studio API key (defaults to server key)"
              className="w-full bg-[#1C1D1F] border border-[#333] rounded px-3 py-2 text-xs text-[#E0E0E0] focus:outline-none focus:border-blue-500 font-mono transition-colors"
            />
            <span className="text-[10px] text-[#666] mt-1 block">Used for parsing CVs via Gemini Flash</span>
          </div>

          <div>
            <label className="flex items-center justify-between text-[11px] text-[#888] mb-1.5 font-medium">
              <span>Output Root Directory</span>
              <span className="text-[10px] text-purple-400 font-mono">Parsed PDFs & Letters</span>
            </label>
            <div className="bg-[#1C1D1F] border border-[#333] focus-within:border-purple-500 rounded px-2.5 py-1.5 text-xs text-[#BBB] font-mono flex items-center justify-between transition-colors">
              <span className="text-[#666] select-none mr-1">/</span>
              <input
                type="text"
                value={config.batchDirectoryName}
                onChange={(e) => onConfigChange({ ...config, batchDirectoryName: e.target.value })}
                placeholder="documents/parsed_applications"
                className="bg-transparent text-[#E0E0E0] w-full focus:outline-none font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setIsBrowseModalOpen(true)}
                className="text-purple-300 hover:text-white bg-[#2A2B30] hover:bg-purple-600 font-sans text-[11px] font-semibold px-2.5 py-1 rounded ml-2 shrink-0 cursor-pointer transition-colors shadow-sm"
              >
                Browse
              </button>
            </div>
            <span className="text-[10px] text-[#666] mt-1.5 block leading-tight">
              Click <strong className="text-[#888]">Browse</strong> to pick a local folder or type your desired directory path.
            </span>
          </div>

          <div className="pt-1">
            <label className="flex items-center justify-between cursor-pointer group bg-[#1A1B1E] p-2.5 rounded border border-[#2D2D2D] hover:border-[#3D3D3D] transition-colors">
              <div className="flex items-center gap-2">
                <Bot className={`w-4 h-4 ${config.useGeminiAiParsing ? 'text-blue-400' : 'text-[#666]'}`} />
                <div>
                  <div className="text-xs font-medium text-[#CCC]">Gemini AI Parsing</div>
                  <div className="text-[10px] text-[#666]">Smart cover letter extraction</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.useGeminiAiParsing}
                onChange={(e) => onConfigChange({ ...config, useGeminiAiParsing: e.target.checked })}
                className="accent-blue-600 rounded cursor-pointer"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Process Control */}
      <section>
        <h2 className="text-[10px] font-bold text-[#666] uppercase tracking-widest mb-3">Process Control</h2>
        
        {/* Real EML Upload Controls */}
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          <label className="bg-[#1A1B1E] border border-purple-500/50 hover:bg-purple-500/10 text-purple-300 py-2 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 font-mono transition-colors text-center px-1">
            <FolderUp className="w-3.5 h-3.5 shrink-0 text-purple-400" />
            <span className="truncate">LOAD FOLDER</span>
            <input
              type="file"
              /* @ts-ignore */
              webkitdirectory=""
              multiple
              onChange={(e) => e.target.files && e.target.files.length > 0 && onUploadFiles(e.target.files)}
              className="hidden"
            />
          </label>

          <label className="bg-[#1A1B1E] border border-purple-500/50 hover:bg-purple-500/10 text-purple-300 py-2 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 font-mono transition-colors text-center px-1">
            <FileUp className="w-3.5 h-3.5 shrink-0 text-purple-400" />
            <span className="truncate">LOAD FILES</span>
            <input
              type="file"
              multiple
              accept=".eml,.txt,message/rfc822,*/*"
              onChange={(e) => e.target.files && e.target.files.length > 0 && onUploadFiles(e.target.files)}
              className="hidden"
            />
          </label>
        </div>



        {!isProcessing ? (
          <button
            onClick={onStartBatch}
            disabled={!hasApplications}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded shadow-sm shadow-blue-600/30 transition-colors text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-wider"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Start Batch Automation
          </button>
        ) : (
          <button
            onClick={onStopBatch}
            className="w-full bg-red-600/20 border border-red-600/60 text-red-400 hover:bg-red-600/30 py-2.5 rounded transition-colors text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider animate-pulse"
          >
            <StopCircle className="w-3.5 h-3.5" />
            Stop Automation
          </button>
        )}

        {successCount > 0 && (
          <button
            onClick={onExportZip}
            disabled={isProcessing}
            className="w-full mt-2.5 bg-[#1C1D1F] border border-green-500/50 text-green-400 hover:bg-green-500/10 py-2.5 rounded transition-colors text-xs font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 font-mono"
          >
            <Download className="w-3.5 h-3.5" />
            DOWNLOAD ALL AS ZIP ARCHIVE
          </button>
        )}

        {hasApplications && (
          <button
            type="button"
            onClick={handleClearClick}
            disabled={isProcessing}
            className={`w-full mt-2.5 border py-2.5 rounded transition-all text-xs font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 font-mono ${
              showConfirmClear
                ? 'bg-red-600/30 border-red-500 text-white animate-pulse'
                : 'bg-[#1C1D1F] border-red-500/30 text-red-400 hover:bg-red-500/10'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {showConfirmClear ? 'CONFIRM CLEAR ALL?' : 'RESET QUEUE & CLEAR CACHE'}
          </button>
        )}
      </section>

      {/* Progress Card */}
      <section className="mt-auto">
        <div className="bg-[#1A1B1E] p-4 rounded-lg border border-[#2D2D2D]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] text-[#888] flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-green-400" />
              Successful Folders
            </span>
            <span className="text-xs font-mono font-bold text-green-400">
              {successCount} / {totalCount}
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#2D2D2D] rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-[10px] text-[#666] font-mono mt-2">
            <span>Workflow: (a) Text + (b) PDF</span>
            <span>{percent}%</span>
          </div>
        </div>
      </section>

      <DirectoryBrowserModal
        isOpen={isBrowseModalOpen}
        onClose={() => setIsBrowseModalOpen(false)}
        currentPath={config.batchDirectoryName}
        onSelectPath={(newPath) => onConfigChange({ ...config, batchDirectoryName: newPath })}
      />
    </aside>
  );
};
