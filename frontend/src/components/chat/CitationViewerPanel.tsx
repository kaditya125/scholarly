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
    <div className="absolute inset-0 bg-white dark:bg-[#1a1a1a] z-30 flex flex-col h-full shadow-[-4px_0_24px_rgb(0,0,0,0.05)] border-l border-slate-200 dark:border-white/5 animate-in slide-in-from-right">
      <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between sticky top-0 bg-white dark:bg-[#1a1a1a]">
        <h3 className="font-bold text-sm text-slate-800 dark:text-gray-100 flex items-center gap-2">
          <Book className="w-4 h-4 text-indigo-500" />
          Source Reference
        </h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        <div className="mb-4">
          <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">{citation.source}</p>
          <div className="flex items-center gap-3">
             {citation.pageNumber && (
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                  Page {citation.pageNumber}
                </span>
             )}
             <span className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
               Relevance Score: {(citation.score * 100).toFixed(0)}%
             </span>
          </div>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed bg-slate-50 dark:bg-[#1e1e1e] p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-inner">
           <ReactMarkdown remarkPlugins={[remarkGfm]}>
             {citation.text}
           </ReactMarkdown>
        </div>
        
        {citation.selectionReasoning && (
           <div className="mt-6 p-4 rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-500/5">
             <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">Why was this retrieved?</h4>
             <p className="text-sm text-slate-600 dark:text-gray-300 leading-relaxed">
               {citation.selectionReasoning}
             </p>
           </div>
        )}
      </div>
    </div>
  );
}
