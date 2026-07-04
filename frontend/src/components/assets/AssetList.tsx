import React from 'react';
import { LearningAsset } from '../../types';
import { Layers, Target, Map as MapIcon, FileText, Clock, Mic } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AssetListProps {
  assets: LearningAsset[];
  onSelect: (asset: LearningAsset) => void;
}

export function AssetList({ assets, onSelect }: AssetListProps) {
  
  const getIconAndColor = (type: string) => {
    switch (type) {
      case 'FLASHCARDS': return { icon: Layers, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10' };
      case 'QUIZ': return { icon: Target, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10' };
      case 'MIND_MAP': return { icon: MapIcon, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' };
      case 'NOTES': return { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' };
      case 'SUMMARY': return { icon: FileText, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' };
      case 'TIMELINE': return { icon: Clock, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' };
      case 'PODCAST': return { icon: Mic, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10' };
      default: return { icon: FileText, color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-500/10' };
    }
  };

  if (!assets || assets.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-10">
         <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-6">
            <Layers className="w-8 h-8 text-slate-400" />
         </div>
         <h2 className="text-xl font-bold text-slate-800 dark:text-gray-200 mb-2">No Learning Assets</h2>
         <p className="text-sm text-center max-w-sm">Use the AI chat to generate flashcards, quizzes, notes, or podcasts from your documents.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
       <div className="max-w-5xl mx-auto">
         <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Learning Assets</h2>
         
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {assets.map(asset => {
             const style = getIconAndColor(asset.type);
             const Icon = style.icon;
             
             return (
               <button
                 key={asset.id}
                 onClick={() => onSelect(asset)}
                 className="flex flex-col text-left p-5 rounded-2xl bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md transition-all group"
               >
                 <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110", style.bg, style.color)}>
                   <Icon className="w-6 h-6" />
                 </div>
                 <h3 className="font-bold text-slate-800 dark:text-gray-100 mb-1 line-clamp-1">{asset.title}</h3>
                 <div className="flex items-center justify-between w-full mt-2">
                   <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{asset.type.replace('_', ' ')}</span>
                   <span className="text-xs text-slate-400">{new Date(asset.createdAt).toLocaleDateString()}</span>
                 </div>
               </button>
             );
           })}
         </div>
       </div>
    </div>
  );
}
