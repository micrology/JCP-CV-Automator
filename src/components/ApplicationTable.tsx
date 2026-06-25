import React, { useState } from 'react';
import { ApplicantApplication } from '../types';
import { Filter, FileDown, ExternalLink } from 'lucide-react';

interface ApplicationTableProps {
  applications: ApplicantApplication[];
  onSelectApp: (app: ApplicantApplication) => void;
  onExportLogs: () => void;
  totalCount: number;
}

type FilterType = 'all' | 'success' | 'processing' | 'error' | 'idle';

export const ApplicationTable: React.FC<ApplicationTableProps> = ({
  applications,
  onSelectApp,
  onExportLogs,
  totalCount
}) => {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredApps = applications.filter(app => {
    if (filter === 'all') return true;
    if (filter === 'success') return app.status === 'success';
    if (filter === 'error') return app.status === 'error';
    if (filter === 'idle') return app.status === 'idle';
    if (filter === 'processing') return ['parsing', 'portal_navigating', 'downloading_pdf'].includes(app.status);
    return true;
  });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0C0D0E] overflow-hidden select-none">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-[#2D2D2D] flex items-center justify-between shrink-0 bg-[#0E0F11]">
        <div className="flex gap-4 items-center">
          <span className="text-sm font-medium text-[#E0E0E0]">Processing Queue</span>
          <span className="px-2 py-0.5 bg-[#1A1B1E] border border-[#333] rounded text-[10px] text-[#888] font-mono">
            {totalCount} APPLICANTS DETECTED
          </span>
        </div>
        <div className="flex gap-2 items-center font-mono text-[11px]">
          <div className="flex bg-[#121315] border border-[#333] rounded overflow-hidden p-0.5">
            {(['all', 'success', 'error', 'idle'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded capitalize transition-colors cursor-pointer ${
                  filter === f ? 'bg-[#25272B] text-white font-bold' : 'text-[#888] hover:text-[#CCC]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={onExportLogs}
            disabled={applications.length === 0}
            className="px-3 py-1 bg-[#1A1B1E] border border-[#333] rounded hover:border-[#555] text-[#CCC] cursor-pointer disabled:opacity-40"
          >
            Export Log
          </button>
        </div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto font-mono text-[12px] scrollbar-thin scrollbar-thumb-[#2D2D2D]">
        {applications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-[#666] font-sans">
            <div className="w-12 h-12 rounded-full bg-[#161719] border border-[#2D2D2D] flex items-center justify-center mb-3 text-2xl">
              📬
            </div>
            <p className="text-sm font-medium text-[#AAA]">No applicant emails loaded in queue</p>
            <p className="text-xs text-[#888] mt-2 max-w-md leading-relaxed font-mono">
              To load your actual <span className="text-purple-400 font-bold">.eml</span> directory from your computer, click <span className="text-purple-400 border border-purple-500/40 bg-purple-500/10 px-1.5 py-0.5 rounded font-bold">LOAD FOLDER</span> or <span className="text-purple-400 border border-purple-500/40 bg-purple-500/10 px-1.5 py-0.5 rounded font-bold">LOAD FILES</span> on the sidebar.<br /><br />
              Or click <span className="text-blue-400 font-bold">LOAD JCP EXAMPLE EMAILS</span> to test with 80 simulated notifications.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse select-text">
            <thead className="sticky top-0 z-10 select-none">
              <tr className="text-left text-[#666] border-b border-[#2D2D2D] bg-[#121315]">
                <th className="py-2.5 px-4 font-normal w-16">ID</th>
                <th className="py-2.5 px-4 font-normal">Applicant Name</th>
                <th className="py-2.5 px-4 font-normal">Email Status</th>
                <th className="py-2.5 px-4 font-normal">CV Download</th>
                <th className="py-2.5 px-4 font-normal">Filesystem</th>
                <th className="py-2.5 px-4 font-normal text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2D2D2D]">
              {filteredApps.map((app) => {
                let rowBg = 'hover:bg-[#161719]/60 text-[#888]';
                let cvStatusEl = <span className="italic">Queued</span>;
                let fsStatusEl = <span className="italic">Queued</span>;

                if (app.status === 'success') {
                  rowBg = 'bg-[#161719]/30 text-green-400/90 hover:bg-[#1C1E22]/50';
                  cvStatusEl = <span>✓ Downloaded ({app.pdfSizeKb || '~140'} KB)</span>;
                  fsStatusEl = <span>✓ Created /{app.folderName}/</span>;
                } else if (app.status === 'error') {
                  rowBg = 'text-red-400 bg-red-400/5 hover:bg-red-400/10';
                  cvStatusEl = <span>✕ Failed</span>;
                  fsStatusEl = <span className="text-[#888]">⚠ Folder Incomplete</span>;
                } else if (['parsing', 'portal_navigating', 'downloading_pdf'].includes(app.status)) {
                  rowBg = 'bg-blue-500/5 text-blue-400 hover:bg-blue-500/10';
                  cvStatusEl = <span className="italic animate-pulse">⟳ Navigating Gate...</span>;
                  fsStatusEl = <span className="text-[#666]">Writing...</span>;
                }

                return (
                  <tr
                    key={app.id}
                    onClick={() => onSelectApp(app)}
                    className={`${rowBg} transition-colors cursor-pointer select-none group`}
                  >
                    <td className="py-2.5 px-4 font-bold text-[#666] group-hover:text-[#BBB]">
                      {app.id.replace('app_', '').padStart(3, '0')}
                    </td>
                    <td className="py-2.5 px-4 font-sans font-medium text-[#DDD] group-hover:text-white flex items-center gap-2">
                      <span>{app.applicantName}</span>
                      {app.jobTitle && (
                        <span className="text-[10px] font-mono text-[#666] hidden lg:inline">({app.jobTitle})</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {app.status === 'idle' ? (
                        <span className="italic text-[#666]">Waiting...</span>
                      ) : app.status === 'parsing' ? (
                        <span className="text-purple-400 animate-pulse">⟳ Parsing EML</span>
                      ) : (
                        <span>✓ Parsed</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">{cvStatusEl}</td>
                    <td className="py-2.5 px-4 truncate max-w-[200px]">{fsStatusEl}</td>
                    <td className="py-2.5 px-4 text-right text-[#666]">
                      {app.createdAt || '--:--:--'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
