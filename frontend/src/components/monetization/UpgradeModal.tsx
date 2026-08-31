import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Check, ShieldCheck, ArrowRight, Zap, MessageSquare, Mic, FileText, Headphones, Target, HelpCircle } from 'lucide-react';
import { PRO_MONTHLY_INR, PRO_YEARLY_TOTAL_INR } from '../../lib/siteConfig';

export type UpgradeSource =
  | 'chat_limit'
  | 'voice_limit'
  | 'doc_limit'
  | 'podcast_limit'
  | 'mock_test_limit'
  | 'premium_feature'
  | 'settings'
  | 'general';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  source?: UpgradeSource;
}

const SOURCE_DETAILS: Record<UpgradeSource, { title: string; subtitle: string; icon: any }> = {
  chat_limit: {
    title: "You've reached your Free AI Chat allowance",
    subtitle: "You've used your 100 AI Chat messages for this month. With Pro, you get up to 2,000 AI Chat messages each month, plus higher Voice, Document, Podcast, and Mock Test allowances.",
    icon: MessageSquare,
  },
  voice_limit: {
    title: "You've used your Free Voice allowance for this month",
    subtitle: "You've used your 15 minutes of Voice Chat this month. With Pro, get up to 300 minutes (5 hours) of live spoken AI tutoring each month.",
    icon: Mic,
  },
  doc_limit: {
    title: "You've reached your Free document allowance",
    subtitle: "You've uploaded your 5 documents for this month. With Pro, upload up to 100 documents and textbooks (up to 50MB per file with OCR).",
    icon: FileText,
  },
  podcast_limit: {
    title: "You've used your Free Podcast allowance for this month",
    subtitle: "You've generated your 1 free episode this month. With Pro, create up to 25 full multi-speaker podcast lessons with cinematic audio mixing.",
    icon: Headphones,
  },
  mock_test_limit: {
    title: "You've reached your Free AI Mock Test allowance",
    subtitle: "You've generated your 3 free AI tests this month. With Pro, generate up to 1,000 AI Mock Tests with diagnostic weakness heatmaps. Standard PYQs remain 100% free.",
    icon: Target,
  },
  premium_feature: {
    title: "Unlock this feature with Sadhya Pro",
    subtitle: "Get access to expanded AI study tools and higher generation allowances designed for focused preparation.",
    icon: Zap,
  },
  settings: {
    title: "Upgrade to Sadhya Pro",
    subtitle: "Boost your daily study routine with higher AI allowances and advanced diagnostic tools.",
    icon: Sparkles,
  },
  general: {
    title: "Study Smarter with Sadhya Pro",
    subtitle: "Supercharge your preparation with extensive AI tutoring, live voice mode, and full-length adaptive tests.",
    icon: Sparkles,
  },
};

const PRO_BENEFITS = [
  { text: 'Up to 2,000 AI Chat messages / month', highlight: '2,000 messages' },
  { text: 'Up to 300 minutes (5 hours) of Realtime Voice Chat', highlight: '5 hours voice' },
  { text: 'Up to 100 document / PDF uploads (up to 50MB per file)', highlight: '100 documents' },
  { text: '25 AI Podcast Studio episodes with cinematic mixing', highlight: '25 podcasts' },
  { text: 'Up to 1,000 AI adaptive mock tests with weakness heatmaps', highlight: '1,000 tests' },
  { text: 'Priority server queue & direct expert human support', highlight: 'Priority access' },
];

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, source = 'general' }) => {
  const navigate = useNavigate();
  const context = SOURCE_DETAILS[source] || SOURCE_DETAILS.general;
  const ContextIcon = context.icon;

  if (!isOpen) return null;

  const handleUpgrade = (billing: 'monthly' | 'yearly' = 'monthly') => {
    onClose();
    navigate(`/checkout?billing=${billing}&plan=pro`);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-white dark:bg-[#1a1b1e] rounded-3xl shadow-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header accent gradient */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#8ba32b] via-[#c8e558] to-[#8ba32b]" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-6 sm:p-8 space-y-5">
            {/* Context Header */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#8ba32b]/10 dark:bg-[#8ba32b]/20 flex items-center justify-center shrink-0 border border-[#8ba32b]/30">
                <ContextIcon className="w-6 h-6 text-[#8ba32b] dark:text-[#c8e558]" />
              </div>
              <div className="pr-6">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#8ba32b]/10 dark:bg-[#8ba32b]/20 text-[#60721c] dark:text-[#c8e558] mb-1.5">
                  <Sparkles className="w-3 h-3" />
                  Sadhya Pro
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {context.title}
                </h3>
                <p className="text-[13px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {context.subtitle}
                </p>
              </div>
            </div>

            {/* Benefits List */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 space-y-2.5">
              <div className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                Included in Sadhya Pro:
              </div>
              <div className="space-y-2">
                {PRO_BENEFITS.map((b, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-[13px] text-slate-700 dark:text-slate-300">
                    <div className="w-4 h-4 rounded-full bg-[#8ba32b]/15 dark:bg-[#8ba32b]/25 flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 text-[#8ba32b] dark:text-[#c8e558] stroke-[3]" />
                    </div>
                    <span>{b.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pricing Options */}
            <div className="grid grid-cols-2 gap-3">
              {/* Monthly option */}
              <div
                onClick={() => handleUpgrade('monthly')}
                className="p-3.5 rounded-2xl border-2 border-[#8ba32b]/40 dark:border-[#8ba32b]/50 bg-[#8ba32b]/5 dark:bg-[#8ba32b]/10 hover:border-[#8ba32b] transition-all cursor-pointer group"
              >
                <div className="text-[11px] font-semibold text-[#8ba32b] dark:text-[#c8e558] uppercase tracking-wider">
                  Monthly Plan
                </div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">₹{PRO_MONTHLY_INR}</span>
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">/ month</span>
                </div>
                <div className="text-[11.5px] text-slate-600 dark:text-slate-400 mt-1">
                  Billed monthly &middot; Cancel anytime
                </div>
              </div>

              {/* Yearly option */}
              <div
                onClick={() => handleUpgrade('yearly')}
                className="p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-slate-50/50 dark:bg-white/[0.02] transition-all cursor-pointer group"
              >
                <div className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 uppercase">
                  Save ₹600/year
                </div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">₹{PRO_YEARLY_TOTAL_INR.toLocaleString('en-IN')}</span>
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">/ year</span>
                </div>
                <div className="text-[11.5px] text-slate-600 dark:text-slate-400 mt-1">
                  Equivalent to ₹149/mo &middot; 12 months access
                </div>
              </div>
            </div>

            {/* 7-Day 100% Refund Policy Callout */}
            <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/50 dark:border-white/5 text-[12px] text-slate-600 dark:text-slate-400 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#8ba32b] shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">
                <strong>7-Day 100% Refund Policy:</strong> Eligible Pro purchases can be refunded within 7 days directly to your original payment method.{' '}
                <Link to="/refunds" onClick={onClose} className="text-[#8ba32b] dark:text-[#c8e558] font-semibold underline hover:opacity-80">
                  View Refund Terms
                </Link>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-2xl text-[13.5px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer text-center"
              >
                Maybe later
              </button>
              <button
                type="button"
                onClick={() => handleUpgrade('monthly')}
                className="flex-1.5 py-3 px-5 rounded-2xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-bold text-[13.5px] hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer group"
              >
                <span>Upgrade to Pro</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Free Value Reassurance */}
            <div className="text-center pt-1">
              <span className="text-[11.5px] text-slate-400 dark:text-slate-500">
                Official PYQs, Community discussions, and Study Circles remain <strong>100% Free and Unlimited</strong>.
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default UpgradeModal;
