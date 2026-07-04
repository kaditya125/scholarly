import React, { useState } from 'react';
import { X, MessageSquare, Send } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Category = "Something's Broken" | "I Have an Idea" | "General Feedback";

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [category, setCategory] = useState<Category>('General Feedback');
  const [feedback, setFeedback] = useState('');

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-[#1a1a1b] w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-white/10"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Send Feedback</h2>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 pb-5">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Help us make Scholarly better for students like you!
            </p>

            {/* Category */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Category
              </label>
              <div className="flex p-1 bg-slate-100 dark:bg-[#131314] rounded-lg">
                {(["Something's Broken", "I Have an Idea", "General Feedback"] as Category[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "flex-1 text-[13px] py-1.5 rounded-md font-medium transition-colors",
                      category === cat
                        ? "bg-white dark:bg-[#2a2a2b] text-slate-800 dark:text-slate-200 shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Feedback Textarea */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Your feedback
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Share what's working, what's broken, or suggest new features..."
                className="w-full h-32 p-3 text-sm bg-slate-50 dark:bg-[#131314] border border-slate-200 dark:border-white/5 rounded-xl outline-none focus:border-blue-500 dark:focus:border-blue-500 transition-colors text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none"
              />
            </div>

            {/* Alternative Contacts */}
            <div className="mb-6">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">
                Prefer chat? Reach us instantly:
              </p>
              <div className="flex gap-3">
                <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 dark:bg-[#1f1f20] hover:bg-slate-200 dark:hover:bg-[#2a2a2b] border border-transparent dark:border-white/5 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl transition-colors">
                  <MessageSquare className="w-4 h-4" />
                  Join our Discord
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 dark:bg-[#1f1f20] hover:bg-slate-200 dark:hover:bg-[#2a2a2b] border border-transparent dark:border-white/5 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl transition-colors">
                  <span className="font-bold text-lg leading-none">r/</span>
                  Visit our Reddit
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={() => {
                // In a real app, this would send the feedback to a server
                onClose();
              }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-sm"
              disabled={!feedback.trim()}
            >
              Submit Feedback
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
