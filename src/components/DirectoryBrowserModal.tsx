import React, { useState } from 'react';
import { Folder, FolderOpen, HardDrive, Check, X, AlertCircle, ExternalLink, CornerDownRight, Laptop } from 'lucide-react';

interface DirectoryBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  onSelectPath: (newPath: string) => void;
}

const DIRECTORY_PRESETS = [
  {
    category: 'Standard Outputs',
    icon: FolderOpen,
    items: [
      { name: 'job_centre_applications_2026', path: 'documents/job_centre_applications_2026', desc: 'Default annual recruitment batch' },
      { name: 'recruitflow_parsed_cvs', path: 'documents/recruitflow_parsed_cvs', desc: 'Organized PDF & text archives' },
      { name: 'candidate_letters_batch_1', path: 'downloads/candidate_letters_batch_1', desc: 'Downloads root directory' },
    ]
  },
  {
    category: 'Local Workspaces & Drives',
    icon: HardDrive,
    items: [
      { name: 'RecruitFlow_Outputs (Documents)', path: 'C:/Users/Nigel/Documents/RecruitFlow_Outputs', desc: 'Local Windows Documents folder' },
      { name: 'Desktop Exports', path: 'desktop/candidate_exports', desc: 'Quick desktop staging folder' },
      { name: 'HR_Central_Share', path: '/var/recruitment/shared_network_drive/2026', desc: 'Linux / Server mount path' },
    ]
  }
];

export const DirectoryBrowserModal: React.FC<DirectoryBrowserModalProps> = ({
  isOpen,
  onClose,
  currentPath,
  onSelectPath,
}) => {
  const [selectedOrTypedPath, setSelectedOrTypedPath] = useState(currentPath);
  const [sandboxNotice, setSandboxNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (selectedOrTypedPath.trim()) {
      onSelectPath(selectedOrTypedPath.trim());
      onClose();
    }
  };

  const handleTryNativeOSPicker = async () => {
    setSandboxNotice(null);
    try {
      if ('showDirectoryPicker' in window) {
        /* @ts-ignore */
        const handle = await window.showDirectoryPicker();
        if (handle && handle.name) {
          setSelectedOrTypedPath(handle.name);
          onSelectPath(handle.name);
          onClose();
        }
      } else {
        setSandboxNotice('Your current browser does not support the native OS folder picker API. You can select a preset below or type any directory path.');
      }
    } catch (err: any) {
      if (err.name === 'SecurityError') {
        setSandboxNotice('Native OS directory picking is restricted inside embedded preview sandboxes (iframes). You can safely choose any folder preset below or type your destination path directly!');
      } else if (err.name !== 'AbortError') {
        setSandboxNotice(`Folder selection notice: ${err.message || 'Restricted by sandbox'}`);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#121315] border border-[#2D2D2D] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-5 py-4 bg-[#18191C] border-b border-[#2D2D2D] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-400">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Select Output Root Directory</h3>
              <p className="text-[11px] text-[#888]">Choose where parsed letters & candidate PDFs will be exported</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#888] hover:text-white p-1 rounded-lg hover:bg-[#25262B] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
          
          {/* Active Path Input Form */}
          <form onSubmit={handleApply} className="space-y-1.5">
            <label className="text-xs font-medium text-[#AAA] flex items-center justify-between">
              <span>Target Directory Path</span>
              <span className="text-[10px] text-purple-400 font-mono">Editable</span>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-[#666] font-mono text-xs select-none">/</span>
              <input
                type="text"
                value={selectedOrTypedPath}
                onChange={(e) => setSelectedOrTypedPath(e.target.value)}
                placeholder="documents/job_centre_applications_2026"
                className="w-full bg-[#1C1D21] border border-[#333] focus:border-purple-500 rounded-lg pl-7 pr-3 py-2 text-xs font-mono text-white focus:outline-none transition-colors"
              />
            </div>
            <p className="text-[10px] text-[#666] leading-relaxed">
              Virtual filesystem paths will be created inside the ZIP archive upon download.
            </p>
          </form>

          {/* Sandbox Notice Banner */}
          {sandboxNotice && (
            <div className="p-3 bg-purple-950/40 border border-purple-500/40 rounded-lg flex items-start gap-2.5 text-xs text-purple-200">
              <AlertCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">Preview Environment Note</p>
                <p className="text-[11px] text-purple-300/80 leading-relaxed">{sandboxNotice}</p>
              </div>
            </div>
          )}

          {/* Presets List */}
          <div className="space-y-4">
            {DIRECTORY_PRESETS.map((group, gIdx) => {
              const GroupIcon = group.icon;
              return (
                <div key={gIdx} className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#777] uppercase tracking-wider select-none">
                    <GroupIcon className="w-3.5 h-3.5 text-purple-400/80" />
                    <span>{group.category}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {group.items.map((item, iIdx) => {
                      const isSelected = selectedOrTypedPath === item.path || selectedOrTypedPath === item.name;
                      return (
                        <button
                          key={iIdx}
                          type="button"
                          onClick={() => setSelectedOrTypedPath(item.path)}
                          className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600/15 border-purple-500/60 text-white'
                              : 'bg-[#18191C] hover:bg-[#1E2024] border-[#25262B] text-[#CCC]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Folder className={`w-4 h-4 shrink-0 ${isSelected ? 'text-purple-400' : 'text-[#666]'}`} />
                            <div className="min-w-0">
                              <div className="text-xs font-mono truncate font-medium">{item.path}</div>
                              <div className="text-[10px] text-[#777] truncate">{item.desc}</div>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-purple-400 shrink-0 ml-2" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Native OS Picker Button */}
          <div className="pt-2 border-t border-[#2D2D2D]">
            <button
              type="button"
              onClick={handleTryNativeOSPicker}
              className="w-full py-2 px-3 bg-[#1A1B1F] hover:bg-[#222429] border border-[#333] hover:border-[#444] rounded-lg text-xs text-[#AAA] hover:text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Laptop className="w-3.5 h-3.5 text-purple-400" />
              <span>Browse OS System Dialog...</span>
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#18191C] border-t border-[#2D2D2D] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#25262B] hover:bg-[#2F3036] text-xs font-medium text-[#BBB] rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleApply()}
            className="px-5 py-1.5 bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white rounded-lg shadow-lg shadow-purple-600/20 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Confirm Directory</span>
          </button>
        </div>

      </div>
    </div>
  );
};
