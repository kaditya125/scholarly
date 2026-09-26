import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

interface AvatarThoughtBubbleProps {
  /** Exam-specific doubts to cycle through (examDoubts.ts). */
  doubts: string[];
  isDarkMode: boolean;
  /** Called with the visible doubt when the student clicks the bubble. */
  onAsk: (question: string) => void;
  className?: string;
}

const THINK_MS = 1400;
const SHOW_MS = 6500;

/**
 * Thought bubble above the dashboard avatar: a short "thinking" beat (three dots), then one of the
 * exam's common doubts, then the next. Clicking sends the visible doubt to the AI tutor. It pauses
 * while hovered or focused so it never changes under the pointer.
 */
export const AvatarThoughtBubble: React.FC<AvatarThoughtBubbleProps> = ({
  doubts,
  isDarkMode,
  onAsk,
  className = "",
}) => {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = React.useState(() => Math.floor(Math.random() * Math.max(doubts.length, 1)));
  const [thinking, setThinking] = React.useState(!reduceMotion);
  const [paused, setPaused] = React.useState(false);

  // Exam changed (new doubts list): start over from a fresh question.
  React.useEffect(() => {
    setIndex(Math.floor(Math.random() * Math.max(doubts.length, 1)));
  }, [doubts]);

  React.useEffect(() => {
    if (paused || doubts.length === 0) return;
    const t = window.setTimeout(() => {
      if (thinking) {
        setThinking(false);
      } else {
        setIndex((i) => (i + 1) % doubts.length);
        if (!reduceMotion) setThinking(true);
      }
    }, thinking ? THINK_MS : SHOW_MS);
    return () => window.clearTimeout(t);
  }, [thinking, paused, doubts.length, reduceMotion, index]);

  if (doubts.length === 0) return null;
  const question = doubts[index % doubts.length];

  const surface = isDarkMode
    ? "bg-[#1c1c1f] border-white/15"
    : "bg-white border-slate-200";
  const cloudPaint = isDarkMode
    ? "fill-[#1c1c1f] stroke-white/15 group-hover:stroke-white/30"
    : "fill-white stroke-slate-200 group-hover:stroke-slate-300";

  return (
    <div className={`pointer-events-none ${className}`}>
      <motion.button
        type="button"
        onClick={() => !thinking && onAsk(question)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        aria-label={`Ask Sadhya: ${question}`}
        initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={`group pointer-events-auto relative isolate flex items-center w-[224px] sm:w-[252px] h-[88px] sm:h-[92px] text-left pl-7 pr-6 pt-2 pb-1.5 cursor-pointer rounded-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ca855]/60 dark:focus-visible:ring-[#c8e558]/60 ${
          isDarkMode ? "text-slate-200" : "text-slate-700"
        }`}
      >
        {/* Cloud outline. Stretched to the button with a non-scaling 1px stroke, so the puffs stay
            crisp at both widths; the soft shadow lifts it off either theme's background. */}
        <svg
          aria-hidden
          viewBox="0 0 240 100"
          preserveAspectRatio="none"
          className={`absolute inset-0 w-full h-full -z-10 transition-colors ${cloudPaint} ${
            isDarkMode ? "drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]" : "drop-shadow-[0_2px_6px_rgba(15,23,42,0.08)]"
          }`}
        >
          <path
            vectorEffect="non-scaling-stroke"
            strokeWidth={1}
            d="M38 90 C16 92 4 76 14 62 C0 52 6 30 28 30 C28 12 54 4 70 14 C82 0 114 -2 126 12 C140 0 172 2 178 18 C202 12 234 26 224 48 C240 60 230 88 204 86 C196 100 164 102 150 92 C132 102 102 102 88 92 C72 102 46 100 38 90 Z"
          />
        </svg>

        <AnimatePresence mode="wait" initial={false}>
          {thinking ? (
            <motion.span
              key="thinking"
              className="flex items-center justify-center gap-1 w-full h-[30px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              aria-hidden
            >
              {[0, 1, 2].map((d) => (
                <motion.span
                  key={d}
                  className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? "bg-slate-400" : "bg-slate-400"}`}
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15, ease: "easeInOut" }}
                />
              ))}
            </motion.span>
          ) : (
            <motion.span
              key={question}
              className="block"
              initial={reduceMotion ? false : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.2 }}
            >
              <span className="block text-[12px] sm:text-[12.5px] leading-[1.35] font-medium line-clamp-2">
                {question}
              </span>
              <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-[#6ca855] dark:text-[#c8e558] opacity-80 group-hover:opacity-100">
                Ask Sadhya <ArrowUpRight className="w-3 h-3" />
              </span>
            </motion.span>
          )}
        </AnimatePresence>

        {/* Thought-cloud tail: two shrinking puffs trailing down toward the avatar's head. */}
        <span aria-hidden className={`absolute -bottom-[7px] left-6 w-3 h-3 rounded-full border ${surface}`} />
        <span aria-hidden className={`absolute -bottom-[16px] left-3.5 w-[7px] h-[7px] rounded-full border ${surface}`} />
      </motion.button>
    </div>
  );
};
