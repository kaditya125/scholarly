import React, { useState } from 'react';
import { X, FileDown, CheckCircle, Loader2 } from 'lucide-react';

export type ExportSelection = {
  coverPage: boolean;
  tableOfContents: boolean;
  notes: boolean;
  flashcards: boolean;
  quizzes: boolean;
  mindMaps: boolean;
  timelines: boolean;
  summaries: boolean;
};

export type ExportState = 'idle' | 'preparing' | 'rendering_layout' | 'rendering_diagrams' | 'generating_pdf' | 'completed' | 'error';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (selection: ExportSelection) => Promise<void>;
  exportState: ExportState;
}

export function ExportDialog({ isOpen, onClose, onExport, exportState }: ExportDialogProps) {
  const [selection, setSelection] = useState<ExportSelection>({
    coverPage: true,
    tableOfContents: true,
    notes: true,
    flashcards: true,
    quizzes: true,
    mindMaps: true,
    timelines: true,
    summaries: true,
  });

  if (!isOpen) return null;

  const handleSelectAll = (val: boolean) => {
    setSelection({
      coverPage: val,
      tableOfContents: val,
      notes: val,
      flashcards: val,
      quizzes: val,
      mindMaps: val,
      timelines: val,
      summaries: val,
    });
  };

  const handleExport = () => {
    onExport(selection);
  };

  const isExporting = exportState !== 'idle' && exportState !== 'completed' && exportState !== 'error';

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1a1a1b] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-white/10">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
              <FileDown className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Export Study Guide</h2>
          </div>
          {!isExporting && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {exportState === 'idle' || exportState === 'error' ? (
            <>
              <p className="text-sm text-slate-600 dark:text-gray-400 mb-6">
                Select the sections you want to include in your generated PDF study guide. 
                Our AI engine will typeset the document with a premium layout.
              </p>

              <div className="flex items-center justify-between mb-4">
                <span className="font-bold text-sm text-slate-800 dark:text-white">Content Options</span>
                <div className="flex gap-3 text-sm">
                  <button onClick={() => handleSelectAll(true)} className="text-indigo-600 dark:text-indigo-400 hover:underline">Select All</button>
                  <button onClick={() => handleSelectAll(false)} className="text-slate-500 hover:underline">Clear All</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {Object.entries(selection).map(([key, value]) => (
                  <label key={key} className="flex items-center gap-3 p-3 border border-slate-200 dark:border-white/10 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={value}
                      onChange={(e) => setSelection(prev => ({ ...prev, [key]: e.target.checked }))}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-gray-300 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </label>
                ))}
              </div>
              
              {exportState === 'error' && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl mb-4 border border-red-100">
                  Failed to generate PDF. Please try again.
                </div>
              )}
            </>
          ) : exportState === 'completed' ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Export Complete!</h3>
              <p className="text-sm text-slate-500 dark:text-gray-400">
                Your premium study guide has been generated and downloaded.
              </p>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">
                {exportState === 'preparing' && 'Preparing Assets...'}
                {exportState === 'rendering_diagrams' && 'Capturing Diagrams...'}
                {exportState === 'rendering_layout' && 'Typesetting Document...'}
                {exportState === 'generating_pdf' && 'Generating PDF...'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-gray-400">
                This may take a moment depending on the notebook size.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121212] flex justify-end gap-3">
          {exportState === 'completed' ? (
            <button 
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-white dark:text-black dark:hover:bg-slate-200 text-white rounded-xl font-bold text-sm transition-colors"
            >
              Close
            </button>
          ) : (
            <>
              <button 
                onClick={onClose}
                disabled={isExporting}
                className="px-4 py-2.5 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleExport}
                disabled={isExporting || !Object.values(selection).some(Boolean)}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                {isExporting ? 'Generating...' : 'Export PDF'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
