import React, { useEffect, useRef } from 'react';
import { AutomationLog } from '../types';
import { Terminal, ShieldCheck, Cpu } from 'lucide-react';

interface TerminalConsoleProps {
  logs: AutomationLog[];
  isProcessing: boolean;
}

export const TerminalConsole: React.FC<TerminalConsoleProps> = ({ logs, isProcessing }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="h-52 border-t border-[#2D2D2D] bg-black p-4 font-mono text-xs overflow-hidden flex flex-col shrink-0 select-text">
      <div className="text-[#666] mb-2 font-bold flex items-center justify-between border-b border-[#2D2D2D]/60 pb-1.5 shrink-0 select-none">
        <div className="flex items-center gap-2 text-[#888]">
          <Terminal className="w-3.5 h-3.5 text-blue-400" />
          <span>PORTAL DEBUG CONSOLE & SYSTEM FS LOGS</span>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1 text-green-500">
            <ShieldCheck className="w-3 h-3" /> JCP GATE BYPASS OK
          </span>
          <span className="flex items-center gap-1 text-[#666]">
            <Cpu className="w-3 h-3" /> STREAMING I/O
          </span>
        </div>
      </div>

      <div ref={containerRef} className="space-y-1 overflow-y-auto flex-1 pr-2 scrollbar-thin scrollbar-thumb-[#2D2D2D]">
        {logs.length === 0 ? (
          <div className="text-[#444] italic pt-4 text-center">
            Ready to automate Job Centre Plus applicant emails. Load examples and click Start Batch Automation...
          </div>
        ) : (
          logs.map((log, idx) => {
            let badgeClass = 'text-blue-400';
            let badgeText = 'INFO';
            if (log.level === 'success') {
              badgeClass = 'text-green-400';
              badgeText = 'DONE';
            } else if (log.level === 'warning') {
              badgeClass = 'text-yellow-400';
              badgeText = 'WARN';
            } else if (log.level === 'error') {
              badgeClass = 'text-red-400';
              badgeText = 'FAIL';
            } else if (log.step.toLowerCase().includes('exec') || log.step.toLowerCase().includes('folder') || log.step.toLowerCase().includes('file')) {
              badgeClass = 'text-purple-400';
              badgeText = 'EXEC';
            }

            return (
              <div key={idx} className="text-[#AAA] leading-relaxed break-all hover:bg-[#111] px-1 rounded transition-colors">
                <span className="text-[#666]">[{log.timestamp}]</span>{' '}
                <span className={`inline-block w-10 font-bold ${badgeClass}`}>{badgeText}</span>{' '}
                <span className="text-[#888] mr-1.5 font-semibold">[{log.step}]</span>
                <span className={log.level === 'error' ? 'text-red-300' : 'text-[#DDD]'}>{log.message}</span>
              </div>
            );
          })
        )}
        {isProcessing && (
          <div className="text-[#888] flex items-center gap-1 pt-1">
            <span className="text-blue-400">EXEC</span>
            <span>Awaiting portal response...</span>
            <span className="animate-pulse font-bold text-white">_</span>
          </div>
        )}
      </div>
    </div>
  );
};
