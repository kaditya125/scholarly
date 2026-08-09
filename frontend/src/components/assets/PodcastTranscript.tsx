import { useState, useEffect, useRef } from 'react';
import { PodcastMetadata } from '../../types';
import { podcastsApi } from '../../lib/api/podcasts';
import { Loader2 } from 'lucide-react';

interface TranscriptSegment {
  speaker: string;
  text: string;
  segmentId: number;
  startMs?: number;
  endMs?: number;
}

/**
 * The full transcript body used inside the podcast episode dashboard's
 * expandable "Show full transcript" panel.
 *
 * The reverted version of this file was reading `metadata.transcriptUrl` — a
 * legacy field that only exists on the older public-episode shape. Every
 * podcast the current pipeline produces stores a GCS object at
 * `metadata.transcriptPath` and expects the client to fetch the JSON through
 * `GET /api/podcasts/:id/transcript` (ownership-checked, streams the JSON).
 * The rewrite below uses the api client for that so this panel actually
 * populates instead of rendering nothing.
 */
export default function PodcastTranscript({
  metadata,
  currentTime,
  onSeek,
}: {
  metadata: PodcastMetadata;
  currentTime: number;
  /** Called with a millisecond offset when the user clicks a segment. */
  onSeek?: (ms: number) => void;
}) {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const podcastId = (metadata as any)?.id as string | undefined;
  const transcriptPath = (metadata as any)?.transcriptPath as string | undefined;
  const legacyTranscriptUrl = (metadata as any)?.transcriptUrl as string | undefined;

  useEffect(() => {
    if (!podcastId && !legacyTranscriptUrl) return;
    let cancelled = false;
    setLoading(true);
    const done = (segments: TranscriptSegment[]) => {
      if (cancelled) return;
      setTranscript(Array.isArray(segments) ? segments : []);
      setLoading(false);
    };
    const fail = () => { if (!cancelled) setLoading(false); };

    // Prefer the modern signed-URL flow (works for authenticated users on any
    // storage layout). Fall back to the legacy public transcriptUrl only when
    // that's the only field the doc carries.
    if (transcriptPath && podcastId) {
      podcastsApi
        .getTranscript(podcastId)
        .then((data) => done(data as any))
        .catch(fail);
    } else if (legacyTranscriptUrl) {
      fetch(legacyTranscriptUrl)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) return done(data);
          if (Array.isArray(data?.segments)) return done(data.segments);
          if (Array.isArray(data?.transcript)) return done(data.transcript);
          done([]);
        })
        .catch(fail);
    } else if (podcastId) {
      // No transcriptPath on the doc but we still have an id — try the
      // endpoint anyway; the backend may know about a transcript we don't.
      podcastsApi
        .getTranscript(podcastId)
        .then((data) => done(data as any))
        .catch(fail);
    }

    return () => { cancelled = true; };
  }, [podcastId, transcriptPath, legacyTranscriptUrl]);

  const timed = transcript.length > 0
    && transcript.every((s) => typeof s.startMs === 'number' && typeof s.endMs === 'number');

  const activeIndex = (() => {
    if (transcript.length === 0) return -1;
    if (timed) {
      const ms = currentTime * 1000;
      if (ms < (transcript[0].startMs as number)) return 0;
      for (let i = 0; i < transcript.length; i++) {
        if (ms >= (transcript[i].startMs as number) && ms < (transcript[i].endMs as number)) return i;
      }
      return transcript.length - 1;
    }
    // Legacy word-per-second estimate for transcripts without per-segment
    // timings — same 2.5 wps rate the earlier version used.
    let accum = 0;
    for (let i = 0; i < transcript.length; i++) {
      const words = transcript[i].text.split(/\s+/).filter(Boolean).length;
      const durationSec = words / 2.5;
      if (currentTime >= accum && currentTime <= accum + durationSec) return i;
      accum += durationSec;
    }
    return transcript.length - 1;
  })();

  useEffect(() => {
    if (activeIndex < 0 || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-segment-id="${activeIndex}"]`);
    if (el && 'scrollIntoView' in el) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (transcript.length === 0) {
    return (
      <div className="p-4 text-center text-[13px] text-slate-400 dark:text-gray-500">
        Transcript is not available for this episode.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="max-h-[400px] overflow-y-auto custom-scrollbar p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl space-y-6"
    >
      {transcript.map((segment, index) => {
        const isActive = index === activeIndex;
        const speakerName = segment.speaker || 'Speaker';
        const isHost = speakerName.toLowerCase().includes('host');
        const canSeek = typeof segment.startMs === 'number' && !!onSeek;
        return (
          <div
            key={index}
            data-segment-id={index}
            onClick={() => {
              if (canSeek) onSeek!(segment.startMs as number);
            }}
            className={`flex gap-4 transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-60 hover:opacity-90'} ${canSeek ? 'cursor-pointer' : ''}`}
          >
            <div
              className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${
                isHost
                  ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300'
                  : 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300'
              }`}
            >
              {speakerName.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-500 mb-1">{speakerName}</div>
              <p
                className={`text-[15px] leading-relaxed whitespace-pre-line ${
                  isActive
                    ? 'text-slate-900 dark:text-white font-medium'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {segment.text}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
