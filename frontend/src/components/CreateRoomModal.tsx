import React, { useState } from 'react';
import { X, Hash, Lock, Bot, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function CreateRoomModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [access, setAccess] = useState<'public' | 'private'>('public');
  const [aiModerator, setAiModerator] = useState(false);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-[440px] bg-white dark:bg-[#212121] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-2xl"
          >
            <div className="p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight">Create Study Room</h2>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-[#9e9e9e] hover:text-slate-900 dark:hover:text-[#efefef] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Room Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Science Mock Tests" 
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none rounded-xl text-[14px] text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Access Control</label>
                <div className="flex p-1 bg-slate-100 dark:bg-[#1a1c1e] rounded-xl border border-slate-200 dark:border-white/5">
                  <button 
                    onClick={() => setAccess('public')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-bold rounded-lg transition-colors shadow-sm",
                      access === 'public' ? "bg-white dark:bg-[#2c2d30] text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-[#8b8b8b] hover:text-slate-700 dark:hover:text-[#eaeaea]"
                    )}
                  >
                    <Hash className="w-4 h-4" /> Public
                  </button>
                  <button 
                    onClick={() => setAccess('private')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-bold rounded-lg transition-colors border border-transparent shadow-sm",
                      access === 'private' ? "bg-white dark:bg-[#2c2d30] text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-[#8b8b8b] hover:text-slate-700 dark:hover:text-[#eaeaea]"
                    )}
                  >
                    <Lock className="w-4 h-4" /> Private
                  </button>
                </div>
                <p className="text-[12px] text-slate-500 dark:text-[#8b8b8b] mt-2 ml-1">
                  {access === 'public' ? "Anyone in the workspace can find and join this room." : "Only invited members can join this room."}
                </p>
              </div>

              <div className="border border-purple-100 dark:border-purple-500/20 bg-purple-50/50 dark:bg-purple-500/5 rounded-xl p-4 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors" onClick={() => setAiModerator(!aiModerator)}>
                <div className="flex items-start gap-3">
                  <div className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-colors", aiModerator ? "bg-purple-600 text-white" : "border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-transparent")}>
                    {aiModerator && <X className="w-3.5 h-3.5" style={{ transform: "rotate(45deg)", display: "none" }} />}
                    {aiModerator && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[14px] font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" /> 
                      Invite AI Moderator
                    </h3>
                    <p className="text-[12px] text-purple-700/70 dark:text-purple-400/80 leading-tight">
                      Automatically moderate group doubts, clear repetitive questions, and summarize discussions.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button 
                  onClick={onClose}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[14px] font-bold transition-colors shadow-sm"
                >
                  Create Study Room
                </button>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
