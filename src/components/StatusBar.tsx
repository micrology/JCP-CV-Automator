import React from 'react';

interface StatusBarProps {
  total: number;
  successCount: number;
  failedCount: number;
  remainingCount: number;
  isProcessing: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  total,
  successCount,
  failedCount,
  remainingCount,
  isProcessing
}) => {
  return (
    <footer className="px-4 py-2 bg-[#121315] border-t border-[#2D2D2D] flex items-center justify-between text-[11px] text-[#666] font-medium shrink-0 font-mono select-none">
      <div className="flex items-center gap-4 sm:gap-6">
        <span className="text-[#BBB] font-bold">{total} APPLICANTS</span>
        <span className="text-green-500 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"></span>
          {successCount} SUCCESS
        </span>
        {failedCount > 0 && (
          <span className="text-red-500 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500"></span>
            {failedCount} FAILED
          </span>
        )}
        <span className="text-blue-500 uppercase flex items-center gap-1">
          {isProcessing ? (
            <span className="inline-block w-2 h-2 border border-blue-400 border-t-transparent rounded-full animate-spin"></span>
          ) : null}
          {remainingCount} REMAINING
        </span>
      </div>
      <div className="flex items-center gap-4 hidden md:flex">
        <span>WORKFLOW: JCP_AUTOGATE</span>
        <span>THREAD: {isProcessing ? 'ACTIVE_BATCH' : 'IDLE'}</span>
        <span className="text-[#AAA] bg-[#1A1B1E] px-2 py-0.5 rounded border border-[#2D2D2D]">v1.0.7-STABLE</span>
      </div>
    </footer>
  );
};
