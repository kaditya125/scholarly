import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageSquare, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useVoiceSession, type VoiceState } from '../../hooks/useVoiceSession';
import VoiceWaveform from './VoiceWaveform';

/**
 * Full-screen voice conversation surface.
 *
 * The waveform is the primary affordance and the transcript is deliberately secondary — this is a
 * conversation, not a recorder. Every visual cue is derived from the session state machine, so
 * the UI can never claim to be listening while the socket is actually down.
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

  /*
   * Retrying only helps when the failure was transient.
   *
   * Voice being switched off, gated to Pro, a rejected token, or a spent daily budget are settled
   * facts about the account or the deployment — pressing a button cannot change any of them.
   * Offering "Try again" for those invites someone to keep hitting a control that is guaranteed to
   * fail, which is exactly what a disabled gateway looked like from the outside.
   *
   * The other two quota refusals are deliberately NOT here. VOICE_SESSION_ALREADY_ACTIVE clears as
   * soon as the other tab is closed and VOICE_STARTING_TOO_FAST clears within seconds, so for both
   * of them retrying is the correct next action and the message says as much.
   */
  const canRetry = !['VOICE_DISABLED', 'VOICE_REQUIRES_PRO', 'UNAUTHENTICATED', 'VOICE_DAILY_LIMIT']
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
          {/*
            No panel and no background of its own: the canvas is transparent and draws with
            straight alpha, so it sits on whatever the page is. It carries its own shape — an orb
            at rest, a ribbon while anyone speaks — and a box around that only fought it.
          */}
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
            <div className="mt-6 flex items-center gap-3">
              {canRetry && (
                <button
                  onClick={() => { startedRef.current = true; start(); }}
                  className="px-5 py-2.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 text-[13.5px] font-bold hover:opacity-90 transition-all"
                >
                  Try again
                </button>
              )}
              {/* Promoted to the primary action when it is the only one that can help. */}
              <button
                onClick={() => { end(); onFallbackToText(); }}
                className={canRetry
                  ? 'inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 dark:border-white/15 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors'
                  : 'inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 text-[13.5px] font-bold hover:opacity-90 transition-all'}
              >
                <MessageSquare className="w-4 h-4" /> Continue with text chat
              </button>
            </div>
          )}
        </div>

        {/* Transcript stays visually quiet: the conversation is the product, this is a record of it. */}
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
          {/*
            Surfaced only when the day's budget is genuinely close to spent. Shown always, it is
            noise on a ten-minute session; shown never, the student is cut off with no warning and
            no idea why. Ten minutes is one full session's worth of warning.
          */}
          {remainingSeconds !== null && remainingSeconds < 600 && (
            <p className="text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">
              {remainingSeconds < 60
                ? 'Less than a minute of voice time left today'
                : `About ${Math.floor(remainingSeconds / 60)} min of voice time left today`}
            </p>
          )}
          <p className="text-[11.5px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" /> Prototype — audio isn't recorded or stored
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
