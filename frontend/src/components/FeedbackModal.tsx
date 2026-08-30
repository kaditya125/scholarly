import React, { useState } from 'react';
import {
  X,
  MessageSquare,
  Send,
  Bug,
  Sparkles,
  MessageSquareHeart,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ExternalLink,
  Smile,
  Heart,
  Meh,
  Frown,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api/client';
import { db } from '../lib/firestore';
import { collection, addDoc } from 'firebase/firestore';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Category = "Something's Broken" | "I Have an Idea" | "General Feedback";
type Sentiment = "love" | "good" | "okay" | "frustrated";

const CATEGORIES: { id: Category; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "Something's Broken", label: "Something's Broken", icon: Bug },
  { id: "I Have an Idea", label: "I Have an Idea", icon: Sparkles },
  { id: "General Feedback", label: "General Feedback", icon: MessageSquareHeart },
];

const SENTIMENTS: { id: Sentiment; label: string; icon: React.ComponentType<{ className?: string }>; rating: string }[] = [
  { id: "love", label: "Love it", icon: Heart, rating: "very_helpful" },
  { id: "good", label: "Good", icon: Smile, rating: "thumbs_up" },
  { id: "okay", label: "Okay", icon: Meh, rating: "thumbs_down" },
  { id: "frustrated", label: "Frustrated", icon: Frown, rating: "report_issue" },
];

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { user } = useAuth();
  const [category, setCategory] = useState<Category>('General Feedback');
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setCategory('General Feedback');
    setSentiment(null);
    setFeedback('');
    setStatus('idle');
    setErrorMessage(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const getPlaceholder = () => {
    switch (category) {
      case "Something's Broken":
        return "What happened? Describe the issue and what you were trying to do...";
      case "I Have an Idea":
        return "What new feature, tool, or improvement would make your learning easier?";
      case "General Feedback":
      default:
        return "Share your thoughts, what you love about Sadhya, or how we can improve...";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setStatus('submitting');
    setErrorMessage(null);

    const payload = {
      category,
      sentiment: sentiment || 'good',
      rating: sentiment ? SENTIMENTS.find(s => s.id === sentiment)?.rating || 'thumbs_up' : 'thumbs_up',
      feedback: feedback.trim(),
      comment: feedback.trim(),
      email: email.trim() || user?.email || 'anonymous',
      userId: user?.uid || 'anonymous',
      userName: user?.displayName || 'Scholar User',
      currentUrl: window.location.href,
      route: window.location.pathname,
      metadata: {
        device: window.innerWidth < 768 ? 'mobile' : 'desktop',
        screenResolution: `${window.innerWidth}x${window.innerHeight}`,
        userAgent: navigator.userAgent,
        submittedAt: new Date().toISOString(),
      },
    };

    try {
      // 1. Try sending via Backend API
      await api.post('/help/feedback', payload);
      setStatus('success');
    } catch (apiErr: any) {
      console.warn('Backend feedback submission failed, trying direct Firestore fallback...', apiErr);
      try {
        // 2. Direct Firestore fallback
        await addDoc(collection(db, 'user_feedback'), {
          ...payload,
          createdAt: Date.now(),
        });
        setStatus('success');
      } catch (fsErr: any) {
        console.error('All feedback submission channels failed:', fsErr);
        setStatus('error');
        setErrorMessage(
          apiErr?.response?.data?.error ||
          apiErr?.message ||
          'Failed to send feedback. Please check your internet connection or reach out on Discord.'
        );
      }
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
        {/* Backdrop click to close */}
        <div className="fixed inset-0" onClick={handleClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative bg-white dark:bg-[#1a1a1e] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200/90 dark:border-white/[0.08] z-10 text-left"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/25 dark:border-[#c8e558]/25 shadow-2xs">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
                  Send Feedback
                </h2>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                  Help us make Sadhya better for students like you!
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6">
            {status === 'success' ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-6 flex flex-col items-center text-center space-y-4"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/30 dark:border-[#c8e558]/30 shadow-md">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Thank You for Your Feedback!
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                    Your suggestions and bug reports directly help us shape and refine the Sadhya learning experience.
                  </p>
                </div>

                <div className="pt-3 flex gap-3 w-full max-w-xs">
                  <button
                    onClick={handleReset}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200/90 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Send Another
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 text-xs font-bold shadow-md hover:opacity-90 transition-all cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Category Selection */}
                <div>
                  <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                    Category
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100/80 dark:bg-[#121215] rounded-2xl border border-slate-200/60 dark:border-white/[0.04]">
                    {CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      const active = category === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCategory(cat.id)}
                          className={cn(
                            "flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-[11.5px] font-semibold transition-all cursor-pointer",
                            active
                              ? "bg-white dark:bg-[#25252b] text-slate-900 dark:text-white shadow-xs font-bold border border-slate-200/80 dark:border-white/10"
                              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/40 dark:hover:bg-white/5"
                          )}
                        >
                          <Icon className={cn("w-3.5 h-3.5 shrink-0", active ? "text-[#8ba32b] dark:text-[#c8e558]" : "text-slate-400")} />
                          <span className="truncate">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Experience / Sentiment */}
                <div>
                  <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    How is your experience? <span className="text-[11px] font-normal text-slate-400 normal-case">(optional)</span>
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {SENTIMENTS.map((s) => {
                      const Icon = s.icon;
                      const active = sentiment === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSentiment(active ? null : s.id)}
                          className={cn(
                            "flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[11.5px] font-medium border transition-all cursor-pointer",
                            active
                              ? "bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 border-[#8ba32b]/40 dark:border-[#c8e558]/40 text-[#8ba32b] dark:text-[#c8e558] font-bold shadow-2xs"
                              : "bg-slate-50 dark:bg-[#202025] border-slate-200/70 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#26262c]"
                          )}
                        >
                          <Icon className={cn("w-3.5 h-3.5", active && "fill-current")} />
                          <span>{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Feedback Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[12px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Your Feedback
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {feedback.length}/2000
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder={getPlaceholder()}
                    className="w-full p-3.5 text-[13px] bg-slate-50 dark:bg-[#121215] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl outline-none focus:ring-2 focus:ring-[#8ba32b]/20 dark:focus:ring-[#c8e558]/20 focus:border-[#8ba32b] dark:focus:border-[#c8e558] transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none shadow-2xs leading-relaxed"
                  />
                </div>

                {/* Email (Optional if anonymous) */}
                {!user && (
                  <div>
                    <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Your Email <span className="text-[11px] font-normal text-slate-400 normal-case">(optional, for reply)</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@example.com"
                      className="w-full px-3.5 py-2 text-[13px] bg-slate-50 dark:bg-[#121215] border border-slate-200/90 dark:border-white/[0.08] rounded-xl outline-none focus:ring-2 focus:ring-[#8ba32b]/20 dark:focus:ring-[#c8e558]/20 focus:border-[#8ba32b] dark:focus:border-[#c8e558] text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                    />
                  </div>
                )}

                {/* Error Banner */}
                {status === 'error' && errorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Community & Instant Chat Channels */}
                <div className="pt-1">
                  <p className="text-[11.5px] font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                    <span>Prefer chat? Reach our student team directly:</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <a
                      href="https://discord.gg/8U8Vj287"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 dark:bg-[#202025] hover:bg-slate-200 dark:hover:bg-[#282830] border border-slate-200/60 dark:border-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors shadow-2xs group"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#5865F2]" />
                      <span>Join Discord</span>
                      <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-white transition-colors" />
                    </a>
                    <a
                      href="mailto:support@sadhya.app?subject=Sadhya%20Student%20Inquiry"
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 dark:bg-[#202025] hover:bg-slate-200 dark:hover:bg-[#282830] border border-slate-200/60 dark:border-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors shadow-2xs group"
                    >
                      <Send className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
                      <span>Email Support</span>
                      <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-white transition-colors" />
                    </a>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={!feedback.trim() || status === 'submitting'}
                    className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#d5f068] dark:text-slate-950 font-bold rounded-2xl transition-all text-sm shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 active:scale-99"
                  >
                    {status === 'submitting' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending Feedback...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit Feedback</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
