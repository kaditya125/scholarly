/**
 * DocumentaryBlocks.tsx
 * Minimal overlay components used by ChapterReader:
 *  - FlashcardModal   — flip-card revision deck
 *  - PodcastPlayerDrawer — multi-track audio drawer
 *
 * All heavy editorial content rendering is now done inline
 * in ChapterReader.tsx using pure flowing prose (no boxes, no AI icons).
 */

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, RotateCcw, Play, Pause, Headphones } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { FlashcardItem } from '../../services/chapterDocumentaryService';

export type { FlashcardItem };

export interface PodcastData {
  episodeTitle: string;
  duration: string;
  tracks: { id: string; title: string; duration: string; speaker: string }[];
}

// ─── Flashcard Modal ──────────────────────────────────────────────────────────
export function FlashcardModal({
  open,
  onClose,
  cards,
}: {
  open: boolean;
  onClose: () => void;
  cards: FlashcardItem[];
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!open || !cards.length) return null;

  const card = cards[index];

  const prev = () => { setFlipped(false); setIndex((i) => Math.max(0, i - 1)); };
  const next = () => { setFlipped(false); setIndex((i) => Math.min(cards.length - 1, i + 1)); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div
        className="relative w-full max-w-[480px] rounded-2xl shadow-2xl overflow-hidden bg-[#F9F8F4] dark:bg-[#1a1a1e] border border-[#E8E7E1] dark:border-white/10"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#E8E7E1] dark:border-white/10">
          <span className="text-[13px] font-semibold text-[#1A1A1A] dark:text-white">
            Flashcards
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[#9A9A95] dark:text-slate-400">
              {index + 1} / {cards.length}
            </span>
            <button onClick={onClose} className="text-[#9A9A95] hover:text-[#1A1A1A] dark:hover:text-white transition-colors cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Card face */}
        <div
          className="mx-4 sm:mx-6 my-5 sm:my-6 min-h-[200px] flex flex-col items-center justify-center text-center cursor-pointer rounded-xl border border-[#E8E7E1] dark:border-white/10 bg-white dark:bg-[#232328] px-5 sm:px-6 py-8 select-none transition-all touch-manipulation shadow-2xs"
          onClick={() => setFlipped((f) => !f)}
        >
          <div className="text-[11px] font-semibold tracking-widest text-[#BDBDB5] dark:text-[#8ba32b] dark:text-[#c8e558] uppercase mb-4">
            {flipped ? 'Answer' : card.category}
          </div>
          <p className="text-[16px] sm:text-[17px] leading-[1.7] text-[#1A1A1A] dark:text-white font-medium">
            {flipped ? card.back : card.front}
          </p>
          <div className="mt-6 flex items-center gap-1.5 text-[12px] text-[#BDBDB5] dark:text-slate-400">
            <RotateCcw className="w-3 h-3" />
            <span>{flipped ? 'Click to see question' : 'Click to reveal answer'}</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-5 sm:px-6 pb-5 sm:pb-6">
          <button
            onClick={prev}
            disabled={index === 0}
            className="flex items-center gap-1.5 text-[13px] font-medium text-[#7A7A75] dark:text-slate-300 hover:text-[#1A1A1A] dark:hover:text-white disabled:opacity-30 transition-colors cursor-pointer touch-manipulation"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <button
            onClick={next}
            disabled={index === cards.length - 1}
            className="flex items-center gap-1.5 text-[13px] font-medium text-[#7A7A75] dark:text-slate-300 hover:text-[#1A1A1A] dark:hover:text-white disabled:opacity-30 transition-colors cursor-pointer touch-manipulation"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Podcast Player Drawer ────────────────────────────────────────────────────
export function PodcastPlayerDrawer({
  open,
  onClose,
  podcast,
}: {
  open: boolean;
  onClose: () => void;
  podcast: PodcastData;
}) {
  const [playing, setPlaying] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="fixed inset-0" onClick={onClose} />
      <div
        className="relative w-full max-w-[440px] rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden bg-[#F9F8F4] dark:bg-[#1a1a1e] border border-[#E8E7E1] dark:border-white/10 z-10"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#E8E7E1] dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
            <span className="text-[13px] font-semibold text-[#1A1A1A] dark:text-white truncate max-w-[280px]">{podcast.episodeTitle}</span>
          </div>
          <button onClick={onClose} className="text-[#9A9A95] hover:text-[#1A1A1A] dark:hover:text-white transition-colors cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tracks */}
        <div className="px-3 sm:px-4 py-3 sm:py-4 space-y-1 max-h-[50vh] overflow-y-auto">
          {podcast.tracks.map((track) => {
            const isPlaying = playing === track.id;
            return (
              <button
                key={track.id}
                onClick={() => setPlaying(isPlaying ? null : track.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left cursor-pointer touch-manipulation',
                  isPlaying ? 'bg-[#EEDEB6]/60 dark:bg-[#8ba32b]/20 dark:bg-[#c8e558]/15' : 'hover:bg-[#E9E8E3] dark:hover:bg-white/5'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors',
                    isPlaying ? 'bg-[#1A1A1A] dark:bg-white' : 'bg-[#E0DED7] dark:bg-white/10'
                  )}
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 text-white dark:text-slate-950" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-[#7A7A75] dark:text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[#1A1A1A] dark:text-white truncate">{track.title}</div>
                  <div className="text-[11px] text-[#9A9A95] dark:text-slate-400 mt-0.5">{track.speaker}</div>
                </div>
                <span className="text-[12px] text-[#BDBDB5] dark:text-slate-400 shrink-0">{track.duration}</span>
              </button>
            );
          })}
        </div>

        {/* Total duration */}
        <div className="px-5 sm:px-6 pb-5 pt-1 flex items-center justify-between text-[12px] text-[#BDBDB5] dark:text-slate-400 border-t border-[#E8E7E1]/50 dark:border-white/[0.05]">
          <span>Total runtime</span>
          <span>{podcast.duration}</span>
        </div>
      </div>
    </div>
  );
}
