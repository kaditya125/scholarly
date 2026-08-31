import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageSquare, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
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
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
            aria-label="Close voice mode"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-6">
          <VoiceWaveform
            state={state}
            readSpectrum={readSpectrum}
            className="w-full max-w-2xl h-56 sm:h-64"
          />

          <motion.h2
            key={copy.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-7 text-[19px] font-semibold tracking-tight text-slate-900 dark:text-white text-center"
          >
            {failed && error ? error.message : copy.title}
          </motion.h2>

          {!failed && copy.hint && (
            <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400 text-center max-w-xs">{copy.hint}</p>
          )}

          {failed && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {isQuotaExhausted && (
                <button
                  onClick={() => setIsUpgradeModalOpen(true)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-950 text-white dark:bg-[#c8e558] dark:text-slate-950 text-[13.5px] font-bold hover:opacity-90 transition-all shadow-md cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" /> Upgrade to Pro (300 min/mo)
                </button>
              )}
              {canRetry && (
                <button
                  onClick={() => { startedRef.current = true; start(); }}
                  className="px-5 py-2.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 text-[13.5px] font-bold hover:opacity-90 transition-all"
                >
                  Try again
                </button>
              )}
              <button
                onClick={() => { end(); onFallbackToText(); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 dark:border-white/15 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <MessageSquare className="w-4 h-4" /> Continue with text chat
              </button>
            </div>
          )}
        </div>

        {/* Transcript */}
        <div
          ref={scrollRef}
          className="max-h-[34vh] overflow-y-auto px-6 pb-2 w-full max-w-2xl mx-auto space-y-3"
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
              className="px-7 py-3 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[13.5px] font-bold hover:opacity-90 transition-all active:scale-98"
            >
              End conversation
            </button>
          )}
          {state === 'ENDED' && !error && (
            <button
              onClick={onClose}
              className="px-7 py-3 rounded-full border border-slate-200 dark:border-white/15 text-[13.5px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              Back to chat
            </button>
          )}
          
          {remainingSeconds !== null && (
            <p className="text-[11.5px] font-semibold text-slate-600 dark:text-slate-400">
              {remainingSeconds < 60
                ? '⏳ Less than a minute of Voice Chat remaining this month'
                : `⏳ About ${Math.ceil(remainingSeconds / 60)} min of Voice Chat remaining this month`}
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
