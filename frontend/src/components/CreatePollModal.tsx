import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function CreatePollModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState([
    { id: '1', text: '' },
    { id: '2', text: '' }
  ]);

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions([...options, { id: Date.now().toString(), text: '' }]);
  };

  const removeOption = (id: string) => {
    if (options.length <= 2) return;
    setOptions(options.filter(opt => opt.id !== id));
  };

  const updateOption = (id: string, text: string) => {
    setOptions(options.map(opt => opt.id === id ? { ...opt, text } : opt));
  };

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
                <h2 className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight">Create Live Poll</h2>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-[#9e9e9e] hover:text-slate-900 dark:hover:text-[#efefef] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Question</label>
                <input 
                  type="text" 
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question..." 
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none rounded-xl text-[14px] text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Options</label>
                <div className="space-y-3">
                  {options.map((option, index) => (
                    <div key={option.id} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          value={option.text}
                          onChange={(e) => updateOption(option.id, e.target.value)}
                          placeholder={`Option ${index + 1}`} 
                          className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none rounded-xl text-[14px] text-slate-900 dark:text-white focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                        {options.length > 2 && (
                          <button onClick={() => removeOption(option.id)} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors shrink-0 border border-transparent">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {options.length < 6 && (
                  <button 
                    onClick={addOption}
                    className="mt-3 flex items-center gap-2 text-[13px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Option
                  </button>
                )}
              </div>

              <div className="pt-2">
                <button 
                  onClick={onClose}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[14px] font-bold transition-colors shadow-sm"
                >
                  Send Poll
                </button>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
