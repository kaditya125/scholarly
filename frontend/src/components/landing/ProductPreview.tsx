import { ChevronDown, BookText, NotebookPen, Camera, Paperclip, ArrowUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { LogoMark } from '../brand/Logo';

/**
 * The hero product visual — a faithful recreation of the real /chat surface.
 *
 * Every element here mirrors something that actually ships:
 *   · the "N results" source list matches components/chat/AssistantReply.tsx
 *   · the composer modes are the real prompt modes in the backend's buildModeInstructions()
 *
 * Deliberately hand-built rather than a screenshot: no network request, nothing to
 * re-export whenever the product UI moves, crisp at any DPI, and correct in both themes.
 *
 * ── FULLY STATIC, AND THAT IS THE POINT ───────────────────────────────────────────────────
 * This used to branch on `const done = true`, so one arm rendered the finished answer and the
 * other animated six reasoning steps through a `phase` counter. `phase` was never declared —
 * it survived only because the hardcoded `true` made its branch unreachable. TypeScript had
 * been reporting it as an error the whole time.
 *
 * That is the same shape as the bug that blanked all 19 /exams/:slug pages and the checkout
 * page (an identifier used but never declared), except this one was one edit away from firing:
 * the moment anyone made `done` real state, the LANDING PAGE would have thrown on first render,
 * before `done` ever flipped true. Deleting the dead arm removes that trap rather than leaving
 * a live grenade behind a constant.
 *
 * If the stepping animation is wanted later, add it deliberately with `phase` actually declared
 * — do not restore the branch from history.
 */

const SOURCES = [
  { icon: BookText, label: 'NCERT Physics XII — Current Electricity' },
  { icon: BookText, label: 'NCERT Physics XII — Drift of Electrons' },
  { icon: NotebookPen, label: 'Your notebook — Class 12 revision' },
];

const MODES = ['Explain', 'Revise', 'Quiz', 'Essay', 'Research'];

export default function ProductPreview() {
  return (
    <div className="relative">
      {/* A single soft wash behind the panel to lift it off the page. No blobs, no glow.
          The horizontal inset stays inside the page gutter on small screens — bleeding it
          the full -6 there pushed past the viewport and gave the whole page a scrollbar. */}
      <div
        aria-hidden
        className="absolute -inset-x-1 sm:-inset-x-6 -inset-y-6 sm:-inset-y-8 rounded-[32px] bg-[#c8e558]/[0.10] dark:bg-[#c8e558]/[0.05] blur-2xl"
      />

      <div className="relative rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#141416] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_40px_-12px_rgba(15,23,42,0.18)] dark:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* ── Window bar ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 px-4 sm:px-5 h-11 border-b border-slate-100 dark:border-white/[0.07]">
          <LogoMark className="w-[15px] h-[15px]" />
          {/* Chrome sits a step darker than the equivalent tokens in the real app: this is a
              marketing surface, and slate-400 on white lands under 3:1. */}
          <span className="text-[12px] font-medium text-slate-500 dark:text-gray-400">Sadhya — AI chat</span>
          <span className="ml-auto hidden sm:inline text-[11px] text-slate-500 dark:text-gray-400 tabular-nums">NEET · Class 12</span>
        </div>

        <div className="px-4 sm:px-5 py-5 space-y-4">
          {/* ── Student message ───────────────────────────────────────────── */}
          <div className="flex justify-end">
            <p className="max-w-[86%] rounded-2xl rounded-tr-sm bg-slate-800 dark:bg-gray-200 px-4 py-2.5 text-[13px] leading-relaxed text-white dark:text-slate-900">
              Why does the resistance of a metal go up when it heats up?
            </p>
          </div>

          {/* ── Reasoning ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-gray-400">
            <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
            <span>Thought for 6 steps</span>
            <span className="text-slate-400 dark:text-gray-600">·</span>
            <span className="tabular-nums">4.1s</span>
          </div>

          {/* ── Answer ────────────────────────────────────────────────────── */}
          <div className="space-y-3.5">
            <div className="space-y-2.5 text-[13px] leading-[1.65] text-slate-700 dark:text-gray-300">
              <p>
                Current in a metal is carried by free electrons drifting through a lattice of
                positive ions. Heat the metal and those ions vibrate harder, so a drifting
                electron collides with them more often.
              </p>
              <p>
                That shortens the average time between collisions, <em>τ</em>. Since resistivity{' '}
                <span className="font-medium text-slate-900 dark:text-white">ρ = m / (n e² τ)</span>,
                a smaller <em>τ</em> means larger ρ — so the resistance rises.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200/70 dark:border-amber-400/20 bg-amber-50/70 dark:bg-amber-400/[0.07] px-3.5 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400/90">
                Common mistake
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-700 dark:text-gray-300">
                Semiconductors do the opposite — heating frees far more carriers than it costs in
                collisions, so their resistance falls.
              </p>
            </div>

            {/* Source list — same treatment as AssistantReply's "N results". */}
            <div>
              <p className="text-[11.5px] text-slate-500 dark:text-gray-400 mb-1.5">3 results</p>
              <div className="space-y-1">
                {SOURCES.map((s) => (
                  <div key={s.label} className="flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-gray-300">
                    <s.icon className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={1.75} />
                    <span className="truncate underline decoration-slate-200 dark:decoration-white/15 underline-offset-[3px]">
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Composer ────────────────────────────────────────────────────── */}
        <div className="border-t border-slate-100 dark:border-white/[0.07] px-4 sm:px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 h-10 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.04]">
              <span className="text-[12.5px] text-slate-500 dark:text-gray-400 truncate">
                Ask a follow-up…
              </span>
              <span className="ml-auto flex items-center gap-2 text-slate-300 dark:text-gray-600">
                <Paperclip className="w-3.5 h-3.5" strokeWidth={1.75} />
                <Camera className="w-3.5 h-3.5" strokeWidth={1.75} />
              </span>
            </div>
            <span className="w-10 h-10 rounded-xl bg-[#c8e558] flex items-center justify-center shrink-0" aria-hidden>
              <ArrowUp className="w-4 h-4 text-slate-900" strokeWidth={2.5} />
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {MODES.map((m, i) => (
              <span
                key={m}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[11.5px] font-medium border',
                  i === 0
                    ? 'border-slate-900 dark:border-white/70 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400'
                )}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
