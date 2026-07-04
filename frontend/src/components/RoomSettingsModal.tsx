import React, { useState } from 'react';
import { X, Hash, Lock, Sparkles, Settings2, ShieldCheck, UserMinus } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function RoomSettingsModal({ isOpen, onClose, roomName }: { isOpen: boolean; onClose: () => void, roomName: string }) {
  const [access, setAccess] = useState<'public' | 'private'>('public');
  const [aiModerator, setAiModerator] = useState(true);
  const [allowAiSummaries, setAllowAiSummaries] = useState(true);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-[480px] bg-white dark:bg-[#212121] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-2xl"
          >
            <div className="p-6 flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <Settings2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-[18px] font-bold text-slate-900 dark:text-white tracking-tight">Room Settings</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">Manage settings for {roomName}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Visibility */}
                <div>
                  <h3 className="text-[13px] font-bold text-slate-900 dark:text-white mb-3">Room Visibility</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setAccess('public')}
                      className={cn(
                        "flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-colors text-left",
                        access === 'public' ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10" : "border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10"
                      )}
                    >
                      <Hash className={cn("w-4 h-4 mb-1", access === 'public' ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400")} />
                      <span className={cn("text-[13px] font-bold", access === 'public' ? "text-indigo-900 dark:text-indigo-300" : "text-slate-700 dark:text-slate-300")}>Public Room</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">Anyone can view and join</span>
                    </button>
                    <button 
                      onClick={() => setAccess('private')}
                      className={cn(
                        "flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-colors text-left",
                        access === 'private' ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10" : "border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10"
                      )}
                    >
                      <Lock className={cn("w-4 h-4 mb-1", access === 'private' ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400")} />
                      <span className={cn("text-[13px] font-bold", access === 'private' ? "text-indigo-900 dark:text-indigo-300" : "text-slate-700 dark:text-slate-300")}>Private Room</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">Only approved members</span>
                    </button>
                  </div>
                </div>

                {/* AI Settings */}
                <div>
                  <h3 className="text-[13px] font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" /> AI Moderator Permissions
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-start justify-between p-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="w-5 h-5 text-slate-400 mt-0.5" />
                        <div>
                          <p className="text-[13px] font-bold text-slate-900 dark:text-white">Active Moderation</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Let AI filter spam, clear repetitive doubts, and manage chat flow.</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                        <input type="checkbox" className="sr-only peer" checked={aiModerator} onChange={() => setAiModerator(!aiModerator)} />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-purple-500"></div>
                      </label>
                    </div>

                    <div className="flex items-start justify-between p-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                      <div className="flex items-start gap-3">
                        <Sparkles className="w-5 h-5 text-slate-400 mt-0.5" />
                        <div>
                          <p className="text-[13px] font-bold text-slate-900 dark:text-white">Discussion Summaries</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">AI generates daily summary notes of all group chat discussions.</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                        <input type="checkbox" className="sr-only peer" checked={allowAiSummaries} onChange={() => setAllowAiSummaries(!allowAiSummaries)} />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-purple-500"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div>
                  <h3 className="text-[13px] font-bold text-red-500 mb-3">Danger Zone</h3>
                  <button className="w-full flex items-center justify-between p-3 rounded-xl border border-red-100 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/20 transition-colors group">
                    <div className="flex flex-col items-start">
                      <span className="text-[13px] font-bold">Delete Study Room</span>
                      <span className="text-[11px] text-red-500/80 dark:text-red-400/80">This action cannot be undone.</span>
                    </div>
                    <UserMinus className="w-4 h-4 text-red-400 group-hover:text-red-500 transition-colors" />
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex gap-3">
                <button 
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl text-[14px] font-bold transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[14px] font-bold transition-colors shadow-sm"
                >
                  Save Changes
                </button>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
