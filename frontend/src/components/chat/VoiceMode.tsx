import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageSquare, AlertCircle, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useVoiceSession, type VoiceState } from '../../hooks/useVoiceSession';
import VoiceWaveform from './VoiceWaveform';
import { UpgradeModal } from '../monetization/UpgradeModal';

/**
 * Full-screen voice conversation surface with monthly plan quota integration.
 */

const COPY: Record<VoiceState, { title: string; hint?: string }> = {
  IDLE: { title: 'Ready when you are' },
  CONNECTING: { title: 'Connecting to your tutor…' },
  LISTENING: { title: "I'm listening", hint: 'Just start talking — you can ask anything or discuss any topic' },
  USER_SPEAKING: { title: 'Listening to you…' },
  SEARCHING: {
    title: 'Searching syllabus & notes…',
    hint: 'Main iske liye search kar raha hoon, bas thoda rukiye…',
  },
  AI_SPEAKING: { title: 'Sadhya is speaking', hint: 'Talk over me whenever you want' },
  INTERRUPTED: { title: 'Go ahead' },
  RECONNECTING: { title: 'Reconnecting…' },
  ERROR: { title: 'Something went wrong' },
  ENDING: { title: 'Wrapping up…' },
  ENDED: { title: 'Conversation ended' },
};

export function VoiceMode({ open, onClose, onFallbackToText }: {
  open: boolean;
  onClose: () => void;
  onFallbackToText: () => void;
  }) {
  const { state, transcript, error, remainingSeconds, start, end, readSpectrum } = useVoiceSession();
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !startedRef.current) { startedRef.current = true; start(); }
    if (!open) startedRef.current = false;
  }, [open, start]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcript]);

  const close = () => { end(); onClose(); };

  if (!open) return null;
  const copy = COPY[state];
  const failed = state === 'ERROR' || (state === 'ENDED' && !!error);
  const isQuotaExhausted = error?.code === 'VOICE_MONTHLY_LIMIT' || error?.code === 'VOICE_REQUIRES_PRO' || error?.code === 'VOICE_DAILY_LIMIT';

  const canRetry = !['VOICE_DISABLED', 'VOICE_REQUIRES_PRO', 'UNAUTHENTICATED', 'VOICE_MONTHLY_LIMIT', 'VOICE_DAILY_LIMIT']
    .includes(error?.code ?? '');

  const isLowVoiceQuota = remainingSeconds !== null && remainingSeconds <= 180 && remainingSeconds > 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#0b0b0c]"
        role="dialog"
        aria-label="Voice conversation with Sadhya AI Tutor"
      >
        {/* Header toolbar */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
            <span className={cn('w-1.5 h-1.5 rounded-full',
              state === 'ERROR' ? 'bg-rose-500'
                : state === 'CONNECTING' || state === 'RECONNECTING' ? 'bg-amber-400'
                  : state === 'SEARCHING' ? 'bg-[#c8e558] animate-ping'
                    : state === 'ENDED' ? 'bg-slate-400' : 'bg-[#8ba32b] dark:bg-[#c8e558]')} />
            Voice mode
          </div>
          <button
            onClick={close}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
            aria-label="Close voice mode"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </button>
        </div>

        {/* 80% Low Quota Reassurance Banner */}
        {isLowVoiceQuota && (
          <div className="mx-6 mb-2 p-2.5 rounded-2xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/25 flex items-center justify-between gap-3 text-[12px] text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                You have about <strong>{Math.ceil(remainingSeconds / 60)} min</strong> of Voice Chat left this month. Pro includes 300 min (5 hrs) with our <strong>7-Day 100% Refund Policy</strong>.
              </span>
            </div>
            <button
              onClick={() => setIsUpgradeModalOpen(true)}
              className="px-2.5 py-1 rounded-xl bg-amber-900/10 dark:bg-amber-100/15 hover:bg-amber-900/20 text-amber-950 dark:text-amber-100 text-[11.5px] font-bold shrink-0 transition-all border border-amber-500/30 cursor-pointer"
            >
              Upgrade to Pro · ₹199
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-4">
          <VoiceWaveform
            state={state}
            readSpectrum={readSpectrum}
            className="w-full max-w-2xl h-52 sm:h-60"
          />

          {isQuotaExhausted ? (
            <div className="mt-4 max-w-lg w-full p-5 rounded-3xl bg-white dark:bg-[#141416] border border-[#8ba32b]/40 dark:border-[#8ba32b]/50 shadow-xl space-y-3.5 text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#8ba32b]/15 text-[#60721c] dark:text-[#c8e558] uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                Monthly Voice Allowance Reached
              </div>
              <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">
                You've used your 15 minutes of Free Voice Tutoring this month!
              </h3>
              <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Spoken tutoring resets at the beginning of next month. You can continue studying immediately via text chat or practice quizzes!
              </p>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/5 text-[12px] text-slate-600 dark:text-slate-300 text-left flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#8ba32b] shrink-0 mt-0.5" />
                <div className="flex-1 leading-snug">
                  <strong>7-Day 100% Refund Policy:</strong> Upgrade to Sadhya Pro for up to <strong>300 minutes (5 full hours)</strong> of spoken AI tutoring each month at <strong>₹199/month</strong>. If it doesn’t fit your study routine, claim a 100% refund in 1 click within 7 days.{' '}
                  <Link to="/refunds" onClick={close} className="text-[#8ba32b] dark:text-[#c8e558] font-semibold underline hover:opacity-80">
                    View Terms
                  </Link>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  onClick={() => { end(); onFallbackToText(); }}
                  className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-white/15 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 inline mr-1.5" /> Continue with text chat
                </button>
                <button
                  onClick={() => setIsUpgradeModalOpen(true)}
                  className="px-5 py-2.5 rounded-2xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-[13px] font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-all shadow-md cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" /> Upgrade to Pro (300 min)
                </button>
              </div>
            </div>
          ) : (
            <>
              <motion.h2
                key={copy.title}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 text-[19px] font-semibold tracking-tight text-slate-900 dark:text-white text-center"
              >
                {failed && error ? error.message : copy.title}
              </motion.h2>

              {!failed && copy.hint && (
                <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400 text-center max-w-xs">{copy.hint}</p>
              )}

              {failed && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  {canRetry && (
                    <button
                      onClick={() => { startedRef.current = true; start(); }}
                      className="px-5 py-2.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 text-[13.5px] font-bold hover:opacity-90 transition-all cursor-pointer"
                    >
                      Try again
                    </button>
                  )}
                  <button
                    onClick={() => { end(); onFallbackToText(); }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 dark:border-white/15 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" /> Continue with text chat
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Transcript */}
        <div
          ref={scrollRef}
          className="max-h-[30vh] overflow-y-auto px-6 pb-2 w-full max-w-2xl mx-auto space-y-3"
        >
          {transcript.map((line) => (
            <div key={line.id} className="text-[13.5px] leading-relaxed">
              <span className={cn('font-semibold mr-2',
                line.role === 'user' ? 'text-slate-900 dark:text-white' : 'text-[#8ba32b] dark:text-[#c8e558]')}>
                {line.role === 'user' ? 'You' : 'Sadhya'}
              </span>
              <span className="text-slate-600 dark:text-slate-300">{line.text}</span>
            </div>
          ))}
        </div>

        <div className="px-6 pb-8 pt-3 flex flex-col items-center gap-3">
          {!failed && state !== 'ENDED' && (
            <button
              onClick={close}
              className="px-7 py-3 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[13.5px] font-bold hover:opacity-90 transition-all active:scale-98 cursor-pointer shadow-sm"
            >
              End conversation
            </button>
          )}
          {state === 'ENDED' && !error && (
            <button
              onClick={onClose}
              className="px-7 py-3 rounded-full border border-slate-200 dark:border-white/15 text-[13.5px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              Back to chat
            </button>
          )}
          
          {remainingSeconds !== null && !isLowVoiceQuota && (
            <p className="text-[11.5px] font-semibold text-slate-600 dark:text-slate-400">
              {`⏳ About ${Math.ceil(remainingSeconds / 60)} min of Voice Chat remaining this month`}
            </p>
          )}
          <p className="text-[11.5px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" /> Live conversational AI Tutor with syllabus grounding
          </p>
        </div>

        <UpgradeModal
          isOpen={isUpgradeModalOpen}
          onClose={() => setIsUpgradeModalOpen(false)}
          source="voice_limit"
        />
      </motion.div>
    </AnimatePresence>
  );
}

export default VoiceMode;
