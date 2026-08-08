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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="relative w-full max-w-[480px] rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#F9F8F4', fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E7E1]">
          <span className="text-[13px] font-semibold text-[#1A1A1A]">
            Flashcards
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[#9A9A95]">
              {index + 1} / {cards.length}
            </span>
            <button onClick={onClose} className="text-[#9A9A95] hover:text-[#1A1A1A] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Card face */}
        <div
          className="mx-6 my-6 min-h-[200px] flex flex-col items-center justify-center text-center cursor-pointer rounded-xl border border-[#E8E7E1] bg-white px-6 py-8 select-none transition-all"
          onClick={() => setFlipped((f) => !f)}
        >
          <div className="text-[11px] font-semibold tracking-widest text-[#BDBDB5] uppercase mb-4">
            {flipped ? 'Answer' : card.category}
          </div>
          <p className="text-[17px] leading-[1.7] text-[#1A1A1A] font-medium">
            {flipped ? card.back : card.front}
          </p>
          <div className="mt-6 flex items-center gap-1.5 text-[12px] text-[#BDBDB5]">
            <RotateCcw className="w-3 h-3" />
            <span>{flipped ? 'Click to see question' : 'Click to reveal answer'}</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 pb-6">
          <button
            onClick={prev}
            disabled={index === 0}
            className="flex items-center gap-1.5 text-[13px] font-medium text-[#7A7A75] hover:text-[#1A1A1A] disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <button
            onClick={next}
            disabled={index === cards.length - 1}
            className="flex items-center gap-1.5 text-[13px] font-medium text-[#7A7A75] hover:text-[#1A1A1A] disabled:opacity-30 transition-colors"
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-sm p-4">
      <div
        className="relative w-full max-w-[440px] rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#F9F8F4', fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E7E1]">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-[#9A9A95]" />
            <span className="text-[13px] font-semibold text-[#1A1A1A]">{podcast.episodeTitle}</span>
          </div>
          <button onClick={onClose} className="text-[#9A9A95] hover:text-[#1A1A1A] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tracks */}
        <div className="px-4 py-4 space-y-1">
          {podcast.tracks.map((track) => {
            const isPlaying = playing === track.id;
            return (
              <button
                key={track.id}
                onClick={() => setPlaying(isPlaying ? null : track.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left',
                  isPlaying ? 'bg-[#EEDEB6]/60' : 'hover:bg-[#E9E8E3]'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors',
                    isPlaying ? 'bg-[#1A1A1A]' : 'bg-[#E0DED7]'
                  )}
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-[#7A7A75]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[#1A1A1A] truncate">{track.title}</div>
                  <div className="text-[11px] text-[#9A9A95] mt-0.5">{track.speaker}</div>
                </div>
                <span className="text-[12px] text-[#BDBDB5] shrink-0">{track.duration}</span>
              </button>
            );
          })}
        </div>

        {/* Total duration */}
        <div className="px-6 pb-5 pt-1 flex items-center justify-between text-[12px] text-[#BDBDB5]">
          <span>Total runtime</span>
          <span>{podcast.duration}</span>
        </div>
      </div>
    </div>
  );
}
