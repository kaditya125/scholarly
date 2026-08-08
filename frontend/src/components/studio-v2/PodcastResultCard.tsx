/**
 * PodcastResultCard
 *
 * Compact result card shown at the end of a project's conversation once the
 * podcast is ready. Deliberately small: a title line, a one-line meta strip,
 * a clamped description, and a single row of actions — no oversized cover art
 * or full transport stack, which made the card dominate the conversation.
 *
 * Playback lives in the row itself: Play toggles a hidden <audio> element and
 * a hairline seek bar sits on the card's bottom edge, so the card stays the
 * same height whether or not audio is playing.
 *
 * Chapter pagination on the right (`‹ 2 / 5 ›`) seeks between chapters when
 * the backend supplied them, and is omitted entirely when it didn't.
 */

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Headphones,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { podcastsApi } from '../../lib/api/podcasts';
import { podcastAudio } from '../../lib/podcastAudio';
import { usePodcastAudio } from '../../hooks/usePodcastAudio';
import type { PodcastMetadata } from '../../types';

interface PodcastResultCardProps {
  podcast: PodcastMetadata;
  /** Opens the full episode dashboard. Hidden when not provided. */
  onOpenEpisode?: (podcast: PodcastMetadata) => void;
  /** Re-run generation for this project. Hidden when not provided. */
  onRegenerate?: () => void;
  /** Delete this project. Hidden when not provided. */
  onDelete?: () => void;
  /** Celebratory framing — used right after generation completes. */
  celebrate?: boolean;
}

export default function PodcastResultCard({
  podcast,
  onOpenEpisode,
  onRegenerate,
  onDelete,
  celebrate = false,
}: PodcastResultCardProps) {
  // Playback is delegated to the shared controller so this card and the player
  // docked under the transcript drive one audio stream and stay in sync.
  const audio = usePodcastAudio();
  const isThis = audio.podcastId === podcast.id;
  const isPlaying = isThis && audio.isPlaying;
  const currentTime = isThis ? audio.currentTime : 0;
  const duration =
    isThis && audio.duration > 0 ? audio.duration : fallbackDurationSeconds(podcast);
  const audioError = isThis ? audio.error : null;
  const loadingAudio = isThis && audio.loading;

  const [copied, setCopied] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(0);

  const chapters = podcast.chapters ?? [];
  const hasChapters = chapters.length > 1;
  const isReady = podcast.status === 'READY';

  const metaLine = useMemo(
    () =>
      [
        formatDurationLabel(podcast),
        podcast.language || null,
        podcast.speakers && podcast.speakers.length > 0
          ? podcast.speakers.join(', ')
          : null,
        podcast.difficulty || null,
      ]
        .filter(Boolean)
        .join(' · '),
    [podcast]
  );

  const handlePlayClick = useCallback(() => {
    void podcastAudio.toggle(podcast.id, podcast.audioUrl);
  }, [podcast.id, podcast.audioUrl]);

  /** Jump to a chapter; the controller loads and starts audio if needed. */
  const goToChapter = (index: number) => {
    const next = Math.max(0, Math.min(index, chapters.length - 1));
    setChapterIndex(next);
    const startMs = chapters[next]?.startMs;
    if (typeof startMs !== 'number') return;
    void podcastAudio.seekTo(podcast.id, startMs, podcast.audioUrl);
  };

  const copySummary = () => {
    const text = [podcast.title, podcast.description].filter(Boolean).join('\n\n');
    navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const download = async () => {
    try {
      const url = podcast.audioUrl || (await podcastsApi.getAudioUrl(podcast.id));
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[PodcastCard] Download failed:', err);
    }
  };

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mb-5 relative rounded-xl border border-indigo-200/80 dark:border-indigo-500/25 bg-white dark:bg-[#23262b] shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden"
    >
      {/* Thin left accent */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-indigo-400 to-violet-500"
        aria-hidden
      />

      <div className="pl-4 pr-3.5 py-3">
        {/* Title */}
        <div className="flex items-start gap-2">
          {celebrate && (
            <motion.span
              initial={{ scale: 0.6, rotate: -20 }}
              animate={{ scale: [0.6, 1.15, 1], rotate: [-20, 12, 0] }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="text-[14px] leading-5 shrink-0"
            >
              🎉
            </motion.span>
          )}
          <h4 className="flex-1 text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 leading-[1.45] tracking-[-0.01em]">
            {podcast.title || 'Untitled episode'}
          </h4>
        </div>

        {/* Meta strip */}
        {metaLine && (
          <div className="mt-1 text-[11.5px] text-gray-500 dark:text-gray-400 truncate">
            {metaLine}
          </div>
        )}

        {/* Description */}
        {podcast.description && (
          <p className="mt-1.5 text-[12.5px] text-gray-500 dark:text-gray-400 leading-[1.6] line-clamp-2">
            {podcast.description}
          </p>
        )}

        {audioError && (
          <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-red-600 dark:text-red-400">
            <AlertCircle className="w-3 h-3 mt-[2px] shrink-0" />
            <span>{audioError}</span>
          </div>
        )}

        {/* Action row */}
        <div className="mt-3 flex items-center gap-1.5">
          {isReady ? (
            <ActionButton
              onClick={handlePlayClick}
              disabled={loadingAudio}
              primary
              icon={
                loadingAudio ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )
              }
              label={
                isPlaying
                  ? `${formatTime(currentTime)} / ${formatTime(duration)}`
                  : currentTime > 0
                  ? 'Resume'
                  : 'Play'
              }
            />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-gray-500 dark:text-gray-400 px-1">
              <Headphones className="w-3.5 h-3.5" />
              Playback available once generation finishes
            </span>
          )}

          {isReady && (
            <ActionButton onClick={download} icon={<Download className="w-3.5 h-3.5" />} label="Save" />
          )}

          {onOpenEpisode && isReady && (
            <IconButton
              onClick={() => onOpenEpisode(podcast)}
              title="Open full episode (quiz, flashcards, mind map)"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </IconButton>
          )}

          {onRegenerate && (
            <IconButton onClick={onRegenerate} title="Generate another version">
              <RefreshCw className="w-3.5 h-3.5" />
            </IconButton>
          )}

          <IconButton onClick={copySummary} title="Copy title and description">
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </IconButton>

          {onDelete && (
            <IconButton onClick={onDelete} title="Delete this podcast" danger>
              <Trash2 className="w-3.5 h-3.5" />
            </IconButton>
          )}

          {/* Chapter pagination */}
          {hasChapters && (
            <div className="ml-auto flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => void goToChapter(chapterIndex - 1)}
                disabled={chapterIndex === 0}
                title="Previous chapter"
                className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11.5px] tabular-nums text-gray-500 dark:text-gray-400 px-0.5">
                {chapterIndex + 1} / {chapters.length}
              </span>
              <button
                type="button"
                onClick={() => void goToChapter(chapterIndex + 1)}
                disabled={chapterIndex >= chapters.length - 1}
                title="Next chapter"
                className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hairline seek bar pinned to the bottom edge */}
      {isReady && (
        <div className="relative h-[3px] bg-gray-100 dark:bg-white/[0.07] group">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-400 to-violet-500"
            style={{ width: `${progressPct}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={(e) => podcastAudio.seek(parseFloat(e.target.value))}
            disabled={!isThis}
            aria-label="Seek"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
          />
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors disabled:opacity-50',
        primary
          ? 'border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/[0.18]'
          : 'border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06]'
      )}
    >
      {icon}
      <span className={primary ? 'tabular-nums' : undefined}>{label}</span>
    </button>
  );
}

function IconButton({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent transition-colors',
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-200 dark:hover:border-red-500/30'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-gray-200'
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fallbackDurationSeconds(podcast: PodcastMetadata): number {
  if (podcast.duration && podcast.duration > 0) return podcast.duration;
  if (podcast.durationMs && podcast.durationMs > 0) return podcast.durationMs / 1000;
  return 0;
}

function formatDurationLabel(podcast: PodcastMetadata): string | null {
  const seconds = fallbackDurationSeconds(podcast);
  if (seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  return mins <= 1 ? '1 min' : `${mins} min`;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
