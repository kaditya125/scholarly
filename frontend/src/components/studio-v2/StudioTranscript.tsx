/**
 * Studio Transcript Panel
 *
 * Right-hand panel for a generated podcast. Layout, top to bottom:
 *
 *   1. Episode title + description
 *   2. Cover artwork with a play overlay
 *   3. Transcript / Chapters tabs
 *   4. Toolbar (edit transcription, speakers, overflow)
 *   5. Speaker-labelling tip callout
 *   6. Speaker-tagged segments, click to seek, active line highlighted
 *   7. Docked player: speed, transport, volume, progress
 *
 * Reveal behaviour: segments land one at a time, fully formed. There is no
 * character-by-character typing — the per-segment delay scales down as the
 * transcript grows so the whole list is on screen in about 1.5s regardless of
 * length.
 *
 * Playback goes through the shared controller in `lib/podcastAudio`, so this
 * player and the result card in the conversation drive one audio stream and
 * stay in sync.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  AudioLines,
  Check,
  Copy,
  FileText,
  Headphones,
  Info,
  Layers,
  Loader2,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Rewind,
  RotateCcw,
  RotateCw,
  Sparkles,
  SquarePen,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { PodcastMetadata } from '../../types';
import { podcastsApi, type TranscriptSegment } from '../../lib/api/podcasts';
import { formatAudioTime, podcastAudio } from '../../lib/podcastAudio';
import { usePodcastAudio } from '../../hooks/usePodcastAudio';

interface StudioTranscriptProps {
  /** Podcast metadata, if generation has completed. */
  podcast?: PodcastMetadata | null;
  /** Parsed transcript.json segments, if fetched. */
  segments?: TranscriptSegment[] | null;
  /** True while the parent is fetching the transcript. */
  isLoading?: boolean;
  errorMessage?: string | null;
}

export default function StudioTranscript({
  podcast,
  segments,
  isLoading,
  errorMessage,
}: StudioTranscriptProps) {
  const [tab, setTab] = useState<'transcript' | 'chapters'>('transcript');
  const [showTip, setShowTip] = useState(true);
  const hasPodcast = !!podcast;

  const speakerCount = useMemo(() => {
    if (segments && segments.length > 0) {
      return new Set(segments.map((s) => (s.speaker || 'Speaker').trim())).size;
    }
    return podcast?.speakers?.length ?? 0;
  }, [segments, podcast?.speakers]);

  return (
    <div className="w-full h-full bg-white dark:bg-[#111113] flex flex-col font-sans border-l border-slate-200/80 dark:border-white/10">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="px-4 pt-4 pb-3">
          {/* Title + description */}
          {hasPodcast ? (
            <>
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white leading-snug tracking-[-0.01em]">
                {podcast!.title || 'Untitled episode'}
              </h3>
              {podcast!.description && (
                <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400 leading-[1.6] line-clamp-2">
                  {podcast!.description}
                </p>
              )}
            </>
          ) : (
            <>
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white leading-snug">
                Transcript
              </h3>
              <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400 leading-[1.6]">
                Once your podcast is generated, the transcript, speakers, and
                time-synced segments will appear here.
              </p>
            </>
          )}

          {/* Artwork */}
          {hasPodcast && <ArtworkTile podcast={podcast!} />}

          {/* Tabs */}
          <TabStrip
            tab={tab}
            onChange={setTab}
            chapterCount={(podcast as any)?.chapters?.length ?? 0}
          />

          {/* Toolbar */}
          {hasPodcast && <Toolbar speakerCount={speakerCount} segments={segments} />}

          {/* Speaker tip */}
          {hasPodcast && showTip && tab === 'transcript' && (
            <TipCallout onDismiss={() => setShowTip(false)} />
          )}
        </div>

        {/* Tab body */}
        <div className="px-4 pb-4">
          {tab === 'transcript' ? (
            <TranscriptBody
              podcast={podcast}
              segments={segments}
              isLoading={!!isLoading}
              errorMessage={errorMessage}
            />
          ) : (
            <ChaptersBody podcast={podcast} />
          )}
        </div>
      </div>

      {/* Docked player */}
      {hasPodcast && <DockedPlayer podcast={podcast!} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Artwork
// ---------------------------------------------------------------------------

function ArtworkTile({ podcast }: { podcast: PodcastMetadata }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(
    podcast.coverImageUrl ?? null
  );
  const [regenerating, setRegenerating] = useState(false);
  const audio = usePodcastAudio();
  const isThis = audio.podcastId === podcast.id;
  const isPlaying = isThis && audio.isPlaying;

  useEffect(() => {
    if (coverUrl) return;
    let cancelled = false;
    (async () => {
      const url = await podcastsApi.getCoverUrl(podcast.id);
      if (!cancelled && url) setCoverUrl(url);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podcast.id]);

  /**
   * Covers generated before the Imagen aspect-ratio fix are flat SVG
   * gradients baked into Storage, so they can only be replaced by asking the
   * backend to generate a fresh one.
   */
  const regenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const url = await podcastsApi.regenerateCover(podcast.id);
      if (url) setCoverUrl(url);
    } catch (err: any) {
      console.error('[Studio] Cover regeneration failed:', err);
    } finally {
      setRegenerating(false);
    }
  };

  const canPlay = podcast.status === 'READY';

  return (
    // Capped height keeps the artwork from dominating the panel while still
    // reading as a proper 16:9 tile on narrow layouts.
    <div className="mt-3 relative rounded-lg overflow-hidden aspect-video max-h-[150px] mx-auto w-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 group">
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={podcast.title ? `Cover art for ${podcast.title}` : 'Podcast cover art'}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Headphones className="w-7 h-7 text-white/80" />
        </div>
      )}

      {canPlay && (
        <button
          type="button"
          onClick={() => void podcastAudio.toggle(podcast.id, podcast.audioUrl)}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors"
        >
          <span
            className={cn(
              'w-10 h-10 rounded-full bg-white/95 shadow-lg flex items-center justify-center transition-all',
              isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
            )}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 text-gray-900" />
            ) : (
              <Play className="w-4 h-4 text-gray-900 ml-0.5" />
            )}
          </span>
        </button>
      )}

      {/* Regenerate artwork — appears on hover so it stays out of the way */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void regenerate();
        }}
        disabled={regenerating}
        title="Generate new cover art"
        className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-black/45 backdrop-blur-sm text-white opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-black/65 disabled:opacity-100 transition-all"
      >
        {regenerating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs + toolbar
// ---------------------------------------------------------------------------

function TabStrip({
  tab,
  onChange,
  chapterCount,
}: {
  tab: 'transcript' | 'chapters';
  onChange: (t: 'transcript' | 'chapters') => void;
  chapterCount: number;
}) {
  return (
    <div className="mt-3.5 rounded-full bg-slate-100/90 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 p-1 flex items-center">
      <TabButton
        active={tab === 'transcript'}
        onClick={() => onChange('transcript')}
        icon={<FileText className="w-3.5 h-3.5" />}
        label="Transcript"
      />
      <TabButton
        active={tab === 'chapters'}
        onClick={() => onChange('chapters')}
        icon={<Layers className="w-3.5 h-3.5" />}
        label="Chapters"
        count={chapterCount || undefined}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-all',
        active
          ? 'bg-white dark:bg-[#18181b] text-slate-900 dark:text-white shadow-xs'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
      )}
    >
      {icon}
      {label}
      {count != null && (
        <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 text-[9.5px] font-bold tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

function Toolbar({
  speakerCount,
  segments,
}: {
  speakerCount: number;
  segments?: TranscriptSegment[] | null;
}) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const copyAll = () => {
    if (!segments || segments.length === 0) return;
    const text = segments
      .map((s) => `${s.speaker || 'Speaker'}: ${s.text || ''}`)
      .join('\n\n');
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setMenuOpen(false);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="mt-3 flex items-center gap-1.5">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-[12px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors"
      >
        <SquarePen className="w-3.5 h-3.5" />
        Edit transcription
        <kbd className="ml-0.5 text-[10.5px] text-gray-400 dark:text-gray-500 font-sans">
          ⌘E
        </kbd>
      </button>

      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-[12px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors"
      >
        <Mic className="w-3.5 h-3.5" />
        Speakers
        {speakerCount > 0 && (
          <span className="px-1.5 py-px rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[10px] font-bold tabular-nums">
            {speakerCount}
          </span>
        )}
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title="More actions"
          className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors"
        >
          {copied ? (
            <Check className="w-4 h-4 text-emerald-500" />
          ) : (
            <MoreHorizontal className="w-4 h-4" />
          )}
        </button>

        {menuOpen && (
          <>
            {/* Click-away layer keeps the menu dismissible without a global listener */}
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 min-w-[168px] rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#2a2d32] shadow-lg overflow-hidden">
              <button
                type="button"
                onClick={copyAll}
                disabled={!segments || segments.length === 0}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy full transcript
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TipCallout({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mt-3 rounded-lg bg-gray-50 dark:bg-white/[0.04] border border-gray-200/70 dark:border-white/[0.06] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-[2px] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-gray-800 dark:text-gray-200">
            Label speakers for better results
          </div>
          <p className="mt-0.5 text-[11.5px] text-gray-500 dark:text-gray-400 leading-[1.55]">
            Pro tip: Assign speakers in the Transcript panel to help us generate
            better content
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          title="Dismiss"
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-[16px] leading-none px-1 shrink-0"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transcript body
// ---------------------------------------------------------------------------

function TranscriptBody({
  podcast,
  segments,
  isLoading,
  errorMessage,
}: {
  podcast?: PodcastMetadata | null;
  segments?: TranscriptSegment[] | null;
  isLoading: boolean;
  errorMessage?: string | null;
}) {
  if (!podcast) {
    return (
      <div className="flex flex-col items-center justify-center text-center px-6 py-14">
        <div className="w-11 h-11 rounded-full bg-gray-100 dark:bg-white/[0.05] flex items-center justify-center mb-3">
          <AudioLines className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        </div>
        <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
          No transcript yet
        </p>
        <p className="text-[12px] text-gray-500 dark:text-gray-500 max-w-[210px] leading-[1.6]">
          Generate a podcast from the workspace on the left to see its transcript
          appear here.
        </p>
      </div>
    );
  }

  if (isLoading) return <TranscriptSkeleton />;

  if (errorMessage) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200/70 dark:border-red-500/20 bg-red-50 dark:bg-red-500/[0.07] px-3 py-2.5 text-[12.5px] text-red-700 dark:text-red-400 leading-[1.6]">
        <AlertCircle className="w-3.5 h-3.5 mt-[3px] shrink-0" />
        <span>{errorMessage}</span>
      </div>
    );
  }

  if (!segments || segments.length === 0) {
    return (
      <div className="text-[12.5px] text-gray-500 dark:text-gray-400 px-1 py-2 leading-[1.6]">
        Transcript is being finalized. Please give it a moment.
      </div>
    );
  }

  return <SegmentList segments={segments} podcast={podcast} />;
}

function TranscriptSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-white/[0.07] animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5 pt-1">
            <div className="h-2 w-24 rounded bg-gray-200 dark:bg-white/[0.07] animate-pulse" />
            <div className="h-2 w-full rounded bg-gray-100 dark:bg-white/[0.05] animate-pulse" />
            <div className="h-2 w-[80%] rounded bg-gray-100 dark:bg-white/[0.05] animate-pulse" />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-center gap-1.5 pt-1 text-[11.5px] text-gray-400 dark:text-gray-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading transcript
      </div>
    </div>
  );
}

function SegmentList({
  segments,
  podcast,
}: {
  segments: TranscriptSegment[];
  podcast: PodcastMetadata;
}) {
  const revealedCount = useSequentialReveal(segments.length);
  const audio = usePodcastAudio();
  const isThisPodcast = audio.podcastId === podcast.id;
  const positionMs = isThisPodcast ? audio.currentTime * 1000 : -1;

  // Stable colour per speaker for the whole episode.
  const speakerThemes = useMemo(() => {
    const names = Array.from(
      new Set(segments.map((s) => (s.speaker || 'Speaker').trim()))
    );
    const map = new Map<string, SpeakerTheme>();
    names.forEach((n, i) => map.set(n, SPEAKER_THEMES[i % SPEAKER_THEMES.length]));
    return map;
  }, [segments]);

  /**
   * Index of the line being spoken. Prefers an explicit [startMs, endMs) hit,
   * otherwise falls back to the last segment that has started — transcripts
   * don't always carry endMs.
   */
  const activeIndex = useMemo(() => {
    if (positionMs < 0) return -1;
    let candidate = -1;
    for (let i = 0; i < segments.length; i++) {
      const start = segments[i].startMs;
      if (typeof start !== 'number') continue;
      if (start > positionMs) break;
      const end = segments[i].endMs;
      if (typeof end === 'number' && positionMs >= end) {
        candidate = i;
        continue;
      }
      candidate = i;
    }
    return candidate;
  }, [segments, positionMs]);

  // Keep the spoken line in view while playing, without hijacking manual scroll.
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!audio.isPlaying || activeIndex < 0) return;
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeIndex, audio.isPlaying]);

  const visible = segments.slice(0, revealedCount);

  return (
    <div className="space-y-1">
      {visible.map((seg, idx) => {
        const speaker = (seg.speaker || 'Speaker').trim();
        return (
          <SegmentRow
            key={`${seg.segmentId ?? idx}-${idx}`}
            ref={idx === activeIndex ? activeRef : undefined}
            entry={seg}
            speaker={speaker}
            theme={speakerThemes.get(speaker) ?? SPEAKER_THEMES[0]}
            isActive={idx === activeIndex}
            onSeek={() =>
              typeof seg.startMs === 'number'
                ? void podcastAudio.seekTo(podcast.id, seg.startMs, podcast.audioUrl)
                : undefined
            }
          />
        );
      })}

      {revealedCount < segments.length && (
        <div className="flex items-center gap-1.5 pt-3 pl-1 text-[11px] text-gray-400 dark:text-gray-500">
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1 h-1 rounded-full bg-indigo-400"
                animate={{ opacity: [0.25, 1, 0.25] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </span>
          {segments.length - revealedCount} more
        </div>
      )}
    </div>
  );
}

interface SegmentRowProps {
  entry: TranscriptSegment;
  speaker: string;
  theme: SpeakerTheme;
  isActive: boolean;
  onSeek: () => void;
}

/** One transcript line. Clicking seeks playback to its start. */
function SegmentRow({
  ref,
  entry,
  speaker,
  theme,
  isActive,
  onSeek,
}: SegmentRowProps & { ref?: React.Ref<HTMLDivElement> }) {
  const range = formatRange(entry.startMs, entry.endMs);
  const seekable = typeof entry.startMs === 'number';

  return (
    <motion.div
      ref={ref}
      // Whole segment appears at once — no character animation.
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      onClick={seekable ? onSeek : undefined}
      className={cn(
        'group relative rounded-lg px-2 py-2 -mx-1 transition-colors',
        seekable && 'cursor-pointer',
        isActive
          ? 'bg-indigo-50/80 dark:bg-indigo-500/[0.09]'
          : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ring-1',
            theme.avatar,
            theme.ring
          )}
        >
          {speaker.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          {/* Speaker + time range */}
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={cn(
                'text-[12px] font-semibold truncate',
                isActive ? theme.name : 'text-gray-800 dark:text-gray-200'
              )}
            >
              {speaker}
            </span>
            {range && (
              <>
                <span className="text-gray-300 dark:text-gray-600 text-[11px]">·</span>
                <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500 font-medium shrink-0">
                  {range}
                </span>
              </>
            )}
          </div>

          {/* Prose — full text, rendered immediately. The active line gets a
              soft highlight so you can follow along with the audio. */}
          <p
            className={cn(
              'font-answer text-[12.5px] leading-[1.65] whitespace-pre-wrap',
              isActive
                ? 'text-gray-900 dark:text-gray-100'
                : 'text-gray-600 dark:text-gray-300'
            )}
          >
            <span
              className={cn(
                isActive &&
                  'bg-amber-200/60 dark:bg-amber-300/20 rounded px-0.5 -mx-0.5 [box-decoration-break:clone]'
              )}
            >
              {entry.text}
            </span>
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

function ChaptersBody({ podcast }: { podcast?: PodcastMetadata | null }) {
  const audio = usePodcastAudio();
  const chapters = (podcast as any)?.chapters ?? [];

  if (!podcast || chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center px-6 py-14">
        <div className="w-11 h-11 rounded-full bg-gray-100 dark:bg-white/[0.05] flex items-center justify-center mb-3">
          <Layers className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        </div>
        <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
          No chapters
        </p>
        <p className="text-[12px] text-gray-500 dark:text-gray-500 max-w-[210px] leading-[1.6]">
          This episode wasn't split into chapters. Longer podcasts usually are.
        </p>
      </div>
    );
  }

  const positionMs = audio.podcastId === podcast.id ? audio.currentTime * 1000 : -1;

  return (
    <div className="space-y-1">
      {chapters.map((ch, i) => {
        const isActive =
          positionMs >= 0 && positionMs >= ch.startMs && positionMs < ch.endMs;
        return (
          <button
            key={`${ch.index}-${i}`}
            type="button"
            onClick={() => void podcastAudio.seekTo(podcast.id, ch.startMs, podcast.audioUrl)}
            className={cn(
              'w-full flex items-start gap-2.5 px-2 py-2 rounded-lg text-left transition-colors',
              isActive
                ? 'bg-indigo-50/80 dark:bg-indigo-500/[0.09]'
                : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
            )}
          >
            <span
              className={cn(
                'w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold tabular-nums shrink-0',
                isActive
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-100 dark:bg-white/[0.07] text-gray-500 dark:text-gray-400'
              )}
            >
              {i + 1}
            </span>
            <span className="flex-1 min-w-0">
              <span
                className={cn(
                  'block text-[12.5px] font-medium leading-snug',
                  isActive
                    ? 'text-gray-900 dark:text-gray-100'
                    : 'text-gray-700 dark:text-gray-300'
                )}
              >
                {ch.title || `Chapter ${i + 1}`}
              </span>
              <span className="block text-[11px] tabular-nums text-gray-400 dark:text-gray-500 mt-0.5">
                {formatAudioTime(ch.startMs / 1000)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Docked player
// ---------------------------------------------------------------------------

function DockedPlayer({ podcast }: { podcast: PodcastMetadata }) {
  const audio = usePodcastAudio();
  const isThis = audio.podcastId === podcast.id;
  const isPlaying = isThis && audio.isPlaying;
  const currentTime = isThis ? audio.currentTime : 0;

  // Prefer live metadata duration; fall back to the stored length so the
  // total reads correctly before the file has loaded.
  const duration =
    isThis && audio.duration > 0 ? audio.duration : fallbackDuration(podcast);
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const disabled = podcast.status !== 'READY';

  return (
    <div className="flex-shrink-0 border-t border-gray-200/80 dark:border-white/[0.07] bg-white dark:bg-[#1e2125]">
      {audio.error && isThis && (
        <div className="px-4 pt-2 flex items-start gap-1.5 text-[11.5px] text-red-600 dark:text-red-400">
          <AlertCircle className="w-3 h-3 mt-[2px] shrink-0" />
          <span>{audio.error}</span>
        </div>
      )}

      {/* Transport */}
      <div className="px-3 pt-2.5 pb-1.5 flex items-center">
        {/* Speed */}
        <button
          type="button"
          onClick={() => podcastAudio.cycleRate()}
          title="Playback speed"
          className="px-1.5 py-1 rounded-md text-[11.5px] font-semibold tabular-nums text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors"
        >
          {audio.playbackRate}x
        </button>

        <button
          type="button"
          onClick={() => podcastAudio.seek(0)}
          disabled={disabled}
          title="Back to start"
          className="ml-0.5 p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.07] disabled:opacity-35 transition-colors"
        >
          <Rewind className="w-3.5 h-3.5" />
        </button>

        {/* Centre transport */}
        <div className="flex-1 flex items-center justify-center gap-1">
          <TransportButton
            onClick={() => podcastAudio.skip(-10)}
            disabled={disabled}
            title="Back 10 seconds"
          >
            <RotateCcw className="w-4 h-4" />
          </TransportButton>

          <button
            type="button"
            onClick={() => void podcastAudio.toggle(podcast.id, podcast.audioUrl)}
            disabled={disabled || audio.loading}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="mx-1 w-9 h-9 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center shadow-sm hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            {audio.loading && isThis ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>

          <TransportButton
            onClick={() => podcastAudio.skip(10)}
            disabled={disabled}
            title="Forward 10 seconds"
          >
            <RotateCw className="w-4 h-4" />
          </TransportButton>
        </div>

        <button
          type="button"
          onClick={() => podcastAudio.toggleMuted()}
          title={audio.muted ? 'Unmute' : 'Mute'}
          className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors"
        >
          {audio.muted ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Progress */}
      <div className="px-3 pb-2.5 flex items-center gap-2">
        <span className="text-[10.5px] tabular-nums text-gray-500 dark:text-gray-400 w-9 shrink-0">
          {formatAudioTime(currentTime)}
        </span>

        <div className="relative flex-1 h-1 group">
          <div className="absolute inset-0 rounded-full bg-gray-200 dark:bg-white/10" />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gray-900 dark:bg-white"
            style={{ width: `${progressPct}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={(e) => podcastAudio.seek(parseFloat(e.target.value))}
            disabled={disabled || !isThis}
            aria-label="Seek"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-gray-900 dark:bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `${progressPct}%` }}
          />
        </div>

        <span className="text-[10.5px] tabular-nums text-gray-500 dark:text-gray-400 w-12 text-right shrink-0">
          {formatAudioTime(duration)}
        </span>
      </div>
    </div>
  );
}

function TransportButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1.5 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.07] disabled:opacity-35 transition-colors"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Speaker theming
// ---------------------------------------------------------------------------

interface SpeakerTheme {
  avatar: string;
  ring: string;
  name: string;
}

/** Accent palette cycled across the episode's speakers. */
const SPEAKER_THEMES: SpeakerTheme[] = [
  {
    avatar: 'bg-indigo-500/12 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300',
    ring: 'ring-indigo-500/20 dark:ring-indigo-400/25',
    name: 'text-indigo-700 dark:text-indigo-300',
  },
  {
    avatar: 'bg-teal-500/12 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300',
    ring: 'ring-teal-500/20 dark:ring-teal-400/25',
    name: 'text-teal-700 dark:text-teal-300',
  },
  {
    avatar: 'bg-amber-500/12 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-500/20 dark:ring-amber-400/25',
    name: 'text-amber-700 dark:text-amber-300',
  },
  {
    avatar: 'bg-rose-500/12 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-500/20 dark:ring-rose-400/25',
    name: 'text-rose-700 dark:text-rose-300',
  },
  {
    avatar: 'bg-violet-500/12 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300',
    ring: 'ring-violet-500/20 dark:ring-violet-400/25',
    name: 'text-violet-700 dark:text-violet-300',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fallbackDuration(podcast: PodcastMetadata): number {
  if (podcast.duration && podcast.duration > 0) return podcast.duration;
  if ((podcast as any).durationMs && (podcast as any).durationMs > 0) return (podcast as any).durationMs / 1000;
  return 0;
}

/** `0:00 - 0:06`, or just the start when there's no end. */
function formatRange(startMs?: number, endMs?: number): string {
  const hasStart = typeof startMs === 'number' && isFinite(startMs) && startMs >= 0;
  if (!hasStart) return '';
  const start = formatAudioTime(startMs! / 1000);
  const hasEnd =
    typeof endMs === 'number' && isFinite(endMs) && endMs > (startMs as number);
  return hasEnd ? `${start} - ${formatAudioTime(endMs! / 1000)}` : start;
}

/**
 * Reveal `total` items one at a time. The per-item delay shrinks as the list
 * grows so the full transcript is on screen in roughly 1.5s — a fixed 85ms
 * would take 9 seconds for a 100-segment episode.
 */
function useSequentialReveal(total: number): number {
  const [count, setCount] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (total <= 0) {
      setCount(0);
      return;
    }

    const TARGET_TOTAL_MS = 1500;
    const delay = Math.max(16, Math.min(85, Math.round(TARGET_TOTAL_MS / total)));

    setCount(0);
    let shown = 0;
    intervalRef.current = window.setInterval(() => {
      shown += 1;
      setCount(shown);
      if (shown >= total && intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, delay);

    return () => {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [total]);

  return count;
}
