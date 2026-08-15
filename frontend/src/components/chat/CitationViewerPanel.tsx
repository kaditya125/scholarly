import React from 'react';
import { X, FileText, Book } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CitationViewerPanelProps {
  citation: any;
  onClose: () => void;
}

export function CitationViewerPanel({ citation, onClose }: CitationViewerPanelProps) {
  if (!citation) return null;

  return (
    <div className="absolute inset-0 bg-white dark:bg-[#111113] z-30 flex flex-col h-full shadow-lg border-l border-slate-200/80 dark:border-white/10 animate-in slide-in-from-right font-sans">
      <div className="p-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between sticky top-0 bg-white/90 dark:bg-[#111113]/90 backdrop-blur-md">
        <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
          <Book className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
          Source Reference
        </h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
        <div>
          <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white mb-1.5">{citation.source}</p>
          <div className="flex items-center gap-2">
             {citation.pageNumber && (
                <span className="text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">
                  Page {citation.pageNumber}
                </span>
             )}
             <span className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md font-medium">
               Relevance: {(citation.score * 100).toFixed(0)}%
             </span>
          </div>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed bg-slate-50/80 dark:bg-white/[0.03] p-4 rounded-xl border border-slate-200/80 dark:border-white/10 shadow-2xs">
           <ReactMarkdown remarkPlugins={[remarkGfm]}>
             {citation.text}
           </ReactMarkdown>
        </div>
        
        {citation.selectionReasoning && (
           <div className="p-4 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
             <h4 className="text-[11px] font-semibold text-[#8ba32b] dark:text-[#c8e558] uppercase tracking-wider mb-1.5">Why was this retrieved?</h4>
             <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
               {citation.selectionReasoning}
             </p>
           </div>
        )}
      </div>
    </div>
  );
}
