import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LearningAsset } from '../../types';
import { 
  MoreVertical, Edit2, Copy, Archive, Trash2, RefreshCw, 
  Layers, Target, Map as MapIcon, FileText, Clock, Mic, 
  X, BookOpen, BarChart
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface AssetsTabProps {
  assets: LearningAsset[];
  onSelect?: (asset: LearningAsset) => void;
}

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

export function AssetsTab({ assets, onSelect }: AssetsTabProps) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [regenerateAsset, setRegenerateAsset] = useState<LearningAsset | null>(null);

  const toggleMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  const closeMenu = () => setActiveMenuId(null);

  const handleAction = (action: string, asset: LearningAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    closeMenu();
    if (action === 'Regenerate') {
      setRegenerateAsset(asset);
    } else {
      console.log(`Action ${action} triggered for asset ${asset.id}`);
      // Implement mock actions here
    }
  };

  return (
    <div className="flex-1 w-full p-6 md:p-8 overflow-y-auto" onClick={closeMenu}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Study Library</h2>
            <p className="text-slate-500 dark:text-slate-400">Manage and explore your generated learning assets.</p>
          </div>
        </div>

        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-6">
              <Layers className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-gray-200 mb-2">No Assets Yet</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm">
              Generate flashcards, quizzes, and study notes from your knowledge base to see them here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {assets.map((asset) => {
              const { icon: Icon, color, bg } = getIconAndColor(asset.type);
              
              // Extract subject & difficulty from content if they exist, or use defaults
              const subject = asset.content?.subject || 'General Studies';
              const difficulty = asset.content?.difficulty || 'Intermediate';
              
              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={asset.id}
                  onClick={() => onSelect?.(asset)}
                  className="group relative bg-white dark:bg-[#1a1a1b] rounded-2xl p-5 border border-slate-200 dark:border-white/10 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 transition-all cursor-pointer flex flex-col min-h-[220px]"
                >
                  {/* Context Menu Trigger */}
                  <div className="absolute top-4 right-4">
                    <button 
                      onClick={(e) => toggleMenu(asset.id, e)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    
                    {/* Dropdown Menu */}
                    <AnimatePresence>
                      {activeMenuId === asset.id && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-white/10 overflow-hidden z-20"
                        >
                          <div className="py-1">
                            <MenuButton icon={Edit2} label="Rename" onClick={(e) => handleAction('Rename', asset, e)} />
                            <MenuButton icon={Copy} label="Duplicate" onClick={(e) => handleAction('Duplicate', asset, e)} />
                            <MenuButton icon={RefreshCw} label="Regenerate" onClick={(e) => handleAction('Regenerate', asset, e)} className="text-indigo-600 dark:text-indigo-400" />
                            <div className="h-px bg-slate-100 dark:bg-white/10 my-1" />
                            <MenuButton icon={Archive} label="Archive" onClick={(e) => handleAction('Archive', asset, e)} />
                            <MenuButton icon={Trash2} label="Delete" onClick={(e) => handleAction('Delete', asset, e)} className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Icon & Title */}
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4", bg, color)}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 line-clamp-2 pr-8">
                    {asset.title}
                  </h3>
                  
                  {/* Meta Details */}
                  <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-slate-100 dark:border-white/5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center text-slate-500 dark:text-slate-400 truncate pr-2">
                        <BookOpen className="w-4 h-4 mr-1.5 shrink-0" />
                        <span className="truncate">{subject}</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center text-slate-500 dark:text-slate-400">
                        <BarChart className="w-4 h-4 mr-1.5 shrink-0" />
                        {difficulty}
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md shrink-0">
                        {asset.type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                      Created {new Date(asset.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Regenerate Modal */}
      <AnimatePresence>
        {regenerateAsset && (
          <RegenerateModal 
            asset={regenerateAsset} 
            onClose={() => setRegenerateAsset(null)} 
            onRegenerate={(instruction) => {
              console.log(`Regenerating ${regenerateAsset.id} with instruction: ${instruction}`);
              setRegenerateAsset(null);
            }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuButton({ icon: Icon, label, onClick, className }: { icon: any, label: string, onClick: (e: React.MouseEvent) => void, className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center px-4 py-2.5 text-sm font-medium transition-colors hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300",
        className
      )}
    >
      <Icon className="w-4 h-4 mr-3" />
      {label}
    </button>
  );
}

function RegenerateModal({ asset, onClose, onRegenerate }: { asset: LearningAsset, onClose: () => void, onRegenerate: (instruction: string) => void }) {
  const [instruction, setInstruction] = useState('');
  
  const presets = ["Easier", "Harder", "UPSC Focus", "Shorter", "More Detailed", "Include Examples"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-white dark:bg-[#1a1a1b] rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-white/10"
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center">
              <RefreshCw className="w-5 h-5 mr-2 text-indigo-500" />
              Regenerate Asset
            </h3>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Provide instructions to tailor <span className="font-semibold text-slate-900 dark:text-white">"{asset.title}"</span>. 
            The AI will regenerate this {asset.type.toLowerCase().replace('_', ' ')} based on your prompt.
          </p>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Modification Instructions
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g., Make it easier to understand, focus on key dates..."
              className="w-full h-32 px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#131314] border border-slate-200 dark:border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-white placeholder-slate-400 resize-none transition-all"
            />
          </div>

          <div className="mb-8">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Quick Suggestions
            </label>
            <div className="flex flex-wrap gap-2">
              {presets.map(preset => (
                <button
                  key={preset}
                  onClick={() => setInstruction(prev => prev ? `${prev}, ${preset}` : preset)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors border border-indigo-100 dark:border-indigo-500/20"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100 dark:border-white/10">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onRegenerate(instruction)}
              disabled={!instruction.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-500/20 flex items-center"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
