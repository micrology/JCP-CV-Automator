import React from 'react';

export const Navbar: React.FC = () => {
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-[#161719] border-b border-[#2D2D2D] shadow-sm shrink-0 select-none">
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center font-bold text-white text-lg italic shadow-md shadow-blue-600/20">
          R
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[#E0E0E0] flex items-center gap-2.5">
            RecruitFlow <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#2D2D2D] text-[#AAA]">JCP Automator v1.0.7</span>
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-6 text-xs font-mono text-[#888]">
        <div className="flex items-center gap-2 bg-[#1C1D1F] px-3 py-1.5 rounded border border-[#2D2D2D]">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span className="text-[#CCC]">PORTAL ENGINE: READY</span>
        </div>
        <div className="flex items-center gap-2 bg-[#1C1D1F] px-3 py-1.5 rounded border border-[#2D2D2D] hidden sm:flex">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          <span className="text-[#CCC]">PDF PARSER: ACTIVE</span>
        </div>
      </div>
    </header>
  );
};
