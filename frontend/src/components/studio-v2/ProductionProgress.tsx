/**
 * ProductionProgress — the live pipeline view shown while an episode renders.
 *
 * Replaces a timer-driven list of invented sentences. Each step is marked from
 * the podcast's REAL status, and the lines underneath are the backend's own
 * `stageDetails` entries — actual segment titles, the dialogue being written, the
 * line currently being voiced, and the cinematic mix outcome. If the backend says
 * nothing about a step, nothing is shown for it: the UI no longer claims work it
 * cannot see.
 *
 * Presentation is deliberately bare — no card, no border — so it reads as part of
 * the conversation rather than a widget dropped into it. New detail lines type in,
 * matching how the rest of the studio reveals text.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { PodcastStatus, PodcastStageDetail } from '../../types';

/** Pipeline order. Terminal states are handled separately. */
const STEPS: { status: PodcastStatus; label: string }[] = [
  { status: 'PENDING', label: 'Queued for production' },
  { status: 'PLANNING', label: 'Planning the episode' },
  { status: 'GENERATING_SCRIPT', label: 'Writing the script' },
  { status: 'GENERATING_AUDIO', label: 'Recording the voices' },
  { status: 'STITCHING_AUDIO', label: 'Mixing the audio' },
  { status: 'UPLOADING', label: 'Finalising the episode' },
  { status: 'GENERATING_ASSETS', label: 'Building study assets' },
];

const ORDER: PodcastStatus[] = STEPS.map((s) => s.status);

/** Matches the studio prose cadence so the whole surface reveals text alike. */
const DETAIL_CHARS_PER_SECOND = 90;

interface ProductionProgressProps {
  status: PodcastStatus | null;
  progressPct?: number;
  stageDetails?: PodcastStageDetail[];
  defaultCollapsed?: boolean;
}

export default function ProductionProgress({
  status,
  progressPct,
  stageDetails,
  defaultCollapsed = false,
}: ProductionProgressProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const isFailed = status === 'FAILED' || status === 'CANCELLED';
  const isReady = status === 'READY';

  const activeIndex = useMemo(() => {
    if (!status) return 0;
    if (isReady) return ORDER.length;
    const idx = ORDER.indexOf(status);
    return idx === -1 ? 0 : idx;
  }, [status, isReady]);

  const detailsFor = (stepStatus: PodcastStatus) =>
    (stageDetails ?? []).filter((d) => d.stage === stepStatus);

  const percent = useMemo(() => {
    if (isReady) return 100;
    if (typeof progressPct === 'number' && progressPct > 0) {
      return Math.min(100, progressPct);
    }
    return Math.round((activeIndex / ORDER.length) * 100);
  }, [progressPct, activeIndex, isReady]);

  return (
    <div className="mb-6 font-answer">
      {/* Header — compact, inline progress bar rather than a full-width band */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="group flex w-full items-center gap-2 text-left"
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}

        <span className="text-[13px] font-medium text-gray-800 dark:text-gray-200">
          {isReady
            ? 'Production complete'
            : isFailed
              ? 'Production stopped'
              : 'Producing your episode'}
        </span>

        {/* Small fixed-width track so it reads as a meter, not a page divider. */}
        <span className="ml-1 h-1 w-24 shrink-0 overflow-hidden rounded-full bg-gray-200/80 dark:bg-white/10">
          <motion.span
            className={cn(
              'block h-full rounded-full',
              isFailed ? 'bg-red-500' : isReady ? 'bg-emerald-500' : 'bg-indigo-500'
            )}
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </span>

        <span
          className={cn(
            'text-[11.5px] tabular-nums',
            isFailed ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'
          )}
        >
          {isFailed ? 'failed' : `${percent}%`}
        </span>
      </button>

      {/* Steps */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <ol className="mt-2.5 space-y-2 pl-[3px]">
              {STEPS.map((step, i) => {
                const done = i < activeIndex;
                const current = i === activeIndex && !isReady && !isFailed;
                const failedHere = isFailed && i === activeIndex;
                const details = detailsFor(step.status);
                const pending = !done && !current && !failedHere;

                return (
                  <li key={step.status} className="flex gap-2.5">
                    <span className="mt-[3px] shrink-0">
                      {done ? (
                        <motion.span
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                          className="flex h-[15px] w-[15px] items-center justify-center rounded-full bg-emerald-500"
                        >
                          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                        </motion.span>
                      ) : current ? (
                        <span className="flex h-[15px] w-[15px] items-center justify-center">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                        </span>
                      ) : failedHere ? (
                        <span className="flex h-[15px] w-[15px] items-center justify-center rounded-full bg-red-500">
                          <X className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                        </span>
                      ) : (
                        <span className="flex h-[15px] w-[15px] items-center justify-center">
                          <span className="h-[5px] w-[5px] rounded-full bg-gray-300 dark:bg-gray-600" />
                        </span>
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-[12.5px] leading-5',
                          done && 'text-gray-600 dark:text-gray-400',
                          current && 'font-medium text-gray-900 dark:text-gray-100',
                          failedHere && 'font-medium text-red-600 dark:text-red-400',
                          pending && 'text-gray-400 dark:text-gray-600'
                        )}
                      >
                        {step.label}
                      </p>

                      {details.length > 0 && (
                        <ul className="mt-0.5 space-y-[3px]">
                          {details.map((d, j) => (
                            <DetailLine
                              key={`${d.at}-${j}`}
                              text={d.detail}
                              // Only the newest line in the active step types in;
                              // older lines and completed steps render instantly so
                              // a re-render never replays the whole history.
                              animate={current && j === details.length - 1}
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * One detail line, revealed at a steady rate the first time it appears.
 *
 * The reveal is keyed on the text: once a line has finished, it stays finished
 * even as sibling lines arrive on later polls.
 */
function DetailLine({ text, animate }: { text: string; animate: boolean }) {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  const doneRef = useRef(!animate);

  useEffect(() => {
    if (doneRef.current) {
      setShown(text.length);
      return;
    }

    let raf = 0;
    let lastTs = 0;
    let owed = 0;
    let revealed = 0;

    const tick = (ts: number) => {
      if (!lastTs) lastTs = ts;
      owed += ((ts - lastTs) / 1000) * DETAIL_CHARS_PER_SECOND;
      lastTs = ts;

      if (owed >= 1) {
        revealed = Math.min(text.length, revealed + Math.floor(owed));
        owed %= 1;
        setShown(revealed);
      }

      if (revealed < text.length) {
        raf = window.requestAnimationFrame(tick);
      } else {
        doneRef.current = true;
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [text]);

  const typing = shown < text.length;

  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="break-words text-[11.5px] leading-[1.55] text-gray-500 dark:text-gray-400"
    >
      {text.slice(0, shown)}
      {typing && (
        <span className="ml-px inline-block h-[0.9em] w-[1.5px] translate-y-[0.1em] bg-indigo-400/70" />
      )}
    </motion.li>
  );
}
