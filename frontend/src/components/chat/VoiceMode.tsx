import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, X, MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useVoiceSession, type VoiceState } from '../../hooks/useVoiceSession';

/**
 * Full-screen voice conversation surface.
 *
 * The orb is the primary affordance and the transcript is deliberately secondary — this is a
 * conversation, not a recorder. Every visual cue is derived from the session state machine, so
 * the UI can never claim to be listening while the socket is actually down.
 */

const COPY: Record<VoiceState, { title: string; hint?: string }> = {
  IDLE: { title: 'Ready when you are' },
  CONNECTING: { title: 'Connecting to your tutor…' },
  LISTENING: { title: "I'm listening", hint: 'Just start talking — you can interrupt me any time' },
  USER_SPEAKING: { title: 'Go on…' },
  AI_SPEAKING: { title: 'Sadhya is speaking', hint: 'Talk over me whenever you want' },
  INTERRUPTED: { title: 'Go ahead' },
  RECONNECTING: { title: 'Reconnecting…' },
  ERROR: { title: 'Something went wrong' },
  ENDING: { title: 'Wrapping up…' },
  ENDED: { title: 'Conversation ended' },
};

/** The orb reads state at a glance: lime when the student holds the floor, white when Sadhya does. */
function Orb({ state, level }: { state: VoiceState; level: number }) {
  const userTurn = state === 'USER_SPEAKING' || state === 'INTERRUPTED';
  const aiTurn = state === 'AI_SPEAKING';
  const busy = state === 'CONNECTING' || state === 'RECONNECTING' || state === 'ENDING';
  // Mic level drives the ring, so it responds to the same samples that get sent upstream.
  const scale = userTurn ? 1 + Math.min(level * 2.2, 0.45) : aiTurn ? 1.06 : 1;

  return (
    <div className="relative flex items-center justify-center w-44 h-44">
      <motion.div
        className={cn(
          'absolute rounded-full blur-2xl',
          userTurn ? 'bg-[#c8e558]/30' : aiTurn ? 'bg-white/20' : 'bg-slate-400/15'
        )}
        animate={{ width: 176 * scale, height: 176 * scale, opacity: busy ? 0.35 : 0.75 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      />
      <motion.div
        className={cn(
          'relative rounded-full border flex items-center justify-center',
          userTurn
            ? 'bg-[#c8e558] border-[#c8e558]'
            : aiTurn
              ? 'bg-white dark:bg-white border-white'
              : 'bg-slate-100 dark:bg-[#232328] border-slate-200 dark:border-white/10'
        )}
        animate={{
          width: 104 * (userTurn ? scale : 1),
          height: 104 * (userTurn ? scale : 1),
          // A slow breath while Sadhya talks reads as "alive" without a spinner.
          ...(aiTurn ? { opacity: [0.85, 1, 0.85] } : { opacity: 1 }),
        }}
        transition={aiTurn ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { type: 'spring', stiffness: 260, damping: 20 }}
      >
        {busy
          ? <Loader2 className="w-7 h-7 animate-spin text-slate-400" strokeWidth={1.8} />
          : <Mic className={cn('w-8 h-8', userTurn ? 'text-slate-900' : aiTurn ? 'text-slate-900' : 'text-slate-400 dark:text-slate-500')} strokeWidth={1.7} />}
      </motion.div>
    </div>
  );
}

export function VoiceMode({ open, onClose, onFallbackToText }: {
  open: boolean;
  onClose: () => void;
  onFallbackToText: () => void;
}) {
  const { state, transcript, error, level, start, end } = useVoiceSession();
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
   * Voice being switched off, gated to Pro, or a rejected token are settled facts about the
   * account or the deployment — pressing a button cannot change any of them. Offering "Try again"
   * for those invites someone to keep hitting a control that is guaranteed to fail, which is
   * exactly what a disabled gateway looked like from the outside.
   */
  const canRetry = !['VOICE_DISABLED', 'VOICE_REQUIRES_PRO', 'UNAUTHENTICATED'].includes(error?.code ?? '');

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
          <Orb state={state} level={level} />

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
          <p className="text-[11.5px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" /> Prototype — audio isn't recorded or stored
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
