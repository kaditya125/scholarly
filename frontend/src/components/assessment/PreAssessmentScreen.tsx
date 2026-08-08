import React from 'react';
import { Brain, Sparkles, Target, Zap, Clock, HelpCircle, CheckCircle2, ShieldCheck, ArrowRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PreAssessmentScreenProps {
  isOpen: boolean;
  onClose?: () => void;
  onStart: () => void;
  isLoading?: boolean;
}

export function PreAssessmentScreen({ isOpen, onClose, onStart, isLoading }: PreAssessmentScreenProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900/95 p-6 md:p-8 text-white shadow-2xl backdrop-blur-xl my-8"
        >
          {/* Luminous Glow Orbs */}
          <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-amber-500/15 blur-3xl" />

          {onClose && (
            <button
              onClick={onClose}
              className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Header */}
          <div className="relative flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-amber-500/20 border border-indigo-500/30 text-indigo-400 shadow-[0_0_25px_rgba(99,102,241,0.25)]">
              <Brain className="w-6 h-6 text-indigo-300 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
            </span>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                <Sparkles className="w-3 h-3 text-amber-400" /> One-Time Initial Assessment
              </div>
              <h2 className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-tight">
                Let's Understand Your Current Learning Level
              </h2>
            </div>
          </div>

          <p className="relative mt-3 text-sm md:text-base text-slate-300 leading-relaxed font-normal">
            Before creating your personalized AI learning journey, Scholarly needs to understand your current strengths, weaknesses, confidence, and problem-solving ability.
          </p>

          {/* 3 Highlight Cards */}
          <div className="relative mt-6 grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md hover:border-indigo-500/40 transition-colors">
              <ShieldCheck className="w-5 h-5 text-emerald-400 mb-2" />
              <h4 className="text-sm font-bold text-white">No Pass or Fail</h4>
              <p className="mt-1 text-xs text-slate-400 leading-normal">
                This assessment is only used for personalization and adaptive study planning.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md hover:border-indigo-500/40 transition-colors">
              <Zap className="w-5 h-5 text-amber-400 mb-2" />
              <h4 className="text-sm font-bold text-white">Adaptive AI Engine</h4>
              <p className="mt-1 text-xs text-slate-400 leading-normal">
                Questions adjust dynamically in difficulty specifically for your profile.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md hover:border-indigo-500/40 transition-colors">
              <Target className="w-5 h-5 text-purple-400 mb-2" />
              <h4 className="text-sm font-bold text-white">Personalized Roadmap</h4>
              <p className="mt-1 text-xs text-slate-400 leading-normal">
                Generates your Student Digital Twin and tailored first-week learning plan.
              </p>
            </div>
          </div>

          {/* Summary Pills */}
          <div className="relative mt-6 flex flex-wrap gap-2 pt-2 border-t border-white/10">
            {[
              '20–25 Questions',
              '20–25 Minutes',
              'Adaptive Difficulty',
              'Personalized Analysis',
              'One-Time Initial Assessment',
            ].map((pill, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-white/10 text-xs font-semibold text-slate-300"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                {pill}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div className="relative mt-8 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={onStart}
              disabled={isLoading}
              className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 font-bold text-sm text-white shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_40px_rgba(99,102,241,0.6)] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Generating Adaptive Assessment...
                </>
              ) : (
                <>
                  Begin AI Baseline Assessment <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
