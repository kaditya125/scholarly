import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { usePodcast } from '../../hooks/api/usePodcast';
import { podcastsApi } from '../../lib/api/podcasts';
import PodcastTranscript from './PodcastTranscript';
import { ArrowLeft, Pause, Play, Check, Loader2, Sparkles, ChevronDown, MessageCircle, X } from 'lucide-react';
import { cn } from '../../lib/utils';

function fmtTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

interface Segment {
  speaker: string;
  text: string;
  segmentId: number;
  startMs?: number;
  endMs?: number;
}

const BAR_COUNT = 48;

/** Deterministic, waveform-like bar heights (0.18–1) seeded off the episode id so they're stable. */
function makeBars(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff;
    const r = (h % 1000) / 1000;
    const envelope = 0.5 + 0.5 * Math.sin((i / BAR_COUNT) * Math.PI * 6); // undulating like real audio
    const val = 0.2 + 0.8 * (0.55 * r + 0.45 * envelope);
    bars.push(Math.max(0.18, Math.min(1, val)));
  }
  return bars;
}

/**
 * Active transcript segment for the current playback time. Uses the REAL per-segment audio
 * timings (startMs/endMs) when the transcript carries them; otherwise falls back to a
 * ~2.5-words/sec estimate for older transcripts.
 */
function activeSegmentIndex(segments: Segment[], currentTime: number): number {
  if (!segments.length) return -1;

  const timed = segments.every((s) => typeof s.startMs === 'number' && typeof s.endMs === 'number');
  if (timed) {
    const ms = currentTime * 1000;
    if (ms < (segments[0].startMs as number)) return 0;
    for (let i = 0; i < segments.length; i++) {
      if (ms >= (segments[i].startMs as number) && ms < (segments[i].endMs as number)) return i;
    }
    return segments.length - 1;
  }

  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const dur = Math.max(1, segments[i].text.split(/\s+/).length / 2.5);
    if (currentTime >= acc && currentTime <= acc + dur) return i;
    acc += dur;
  }
  return segments.length - 1;
}

/** The animated blue/green gradient orb — calm when idle, breathing + swirling while playing. */
function Orb({ playing, size = 200 }: { playing: boolean; size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* Soft glow that breathes while playing */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-teal-300/40 to-blue-400/40 blur-2xl"
        animate={playing ? { scale: [1, 1.15, 1], opacity: [0.45, 0.75, 0.45] } : { scale: 1, opacity: 0.35 }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Frosted glass sphere */}
      <div className="absolute inset-0 rounded-full overflow-hidden border border-white/70 dark:border-white/10 bg-white/50 dark:bg-white/[0.04] backdrop-blur-xl shadow-[inset_0_2px_20px_rgba(255,255,255,0.6),0_10px_40px_-12px_rgba(59,130,246,0.35)]">
        {/* Rotating color field */}
        <motion.div
          className="absolute -inset-1/4 rounded-full"
          style={{ background: 'conic-gradient(from 0deg, rgba(59,130,246,0.30), rgba(16,185,129,0.28), rgba(45,212,191,0.30), rgba(59,130,246,0.30))' }}
          animate={{ rotate: 360 }}
          transition={{ duration: playing ? 14 : 34, repeat: Infinity, ease: 'linear' }}
        />
        {/* Morphing blobs */}
        <motion.div
          className="absolute w-2/3 h-2/3 rounded-full bg-blue-500/55 blur-2xl"
          style={{ top: '12%', left: '8%' }}
          animate={playing ? { x: [-12, 22, -12], y: [-6, 16, -6], scale: [1, 1.2, 1] } : { x: 0, y: 0, scale: 1 }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-1/2 h-1/2 rounded-full bg-emerald-400/55 blur-2xl"
          style={{ bottom: '12%', right: '10%' }}
          animate={playing ? { x: [10, -16, 10], y: [10, -12, 10], scale: [1.1, 0.9, 1.1] } : { x: 0, y: 0, scale: 1 }}
          transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Top-left highlight for the glassy read */}
        <div className="absolute top-3 left-5 w-16 h-10 rounded-full bg-white/60 blur-xl" />
      </div>
    </div>
  );
}

/**
 * Podcast episode player — a focused, template-style listening screen: back + title, an
 * animated gradient orb, the transcript line synced to playback, an animated + seekable
 * waveform, and Pause / Done controls. Real audio playback + generate/generating states.
 */
export default function PodcastEpisode({ notebookId, podcastId, title: titleProp, fallbackDescription, onBack }: { notebookId: string; podcastId: string; title?: string; fallbackDescription?: string; onBack?: () => void }) {
  const { metadata, generateAudio } = usePodcast(notebookId, podcastId);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);

  // Live Q&A State
  const [showAsk, setShowAsk] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  // The Firestore podcast doc stores an `audioPath` (a GCS object path) — never
  // a public URL. The client must ask the backend to mint a signed URL via
  // GET /api/podcasts/:id/audio. When the doc has `audioUrl` (legacy public
  // episodes) use it directly; otherwise mint one from the backend.
  //
  // The dependency array is deliberately narrow (podcastId + status + the two
  // relevant path fields) rather than the whole `metadata` object — Firestore
  // onSnapshot re-emits a new object reference on every incidental doc update
  // (cover ready, chapters populated, etc.), and depending on the whole
  // object was resetting signedAudioUrl to null on every emission, which is
  // why the player kept flickering back to the empty "Audio hasn't been
  // generated" state even when /audio was returning 200.
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);
  const metaStatus = metadata?.status;
  const metaAudioPath = (metadata as any)?.audioPath as string | undefined;
  const metaLegacyAudioUrl = (metadata as any)?.audioUrl as string | undefined;
  useEffect(() => {
    if (!podcastId) { setSignedAudioUrl(null); return; }
    if (metaLegacyAudioUrl) { setSignedAudioUrl(metaLegacyAudioUrl); return; }
    if (metaStatus === 'FAILED') { setSignedAudioUrl(null); return; }
    // Always attempt to fetch a signed URL — the /audio endpoint is the source
    // of truth. If audio exists it returns 200 + { url }; if not it 404s and
    // we correctly land in the empty state. We don't clear the previous URL
    // while re-fetching so the player doesn't visibly flash back to the empty
    // view on incidental snapshot updates.
    let cancelled = false;
    podcastsApi
      .getAudioUrl(podcastId)
      .then((url) => { if (!cancelled) setSignedAudioUrl(url || null); })
      .catch(() => { if (!cancelled) setSignedAudioUrl(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podcastId, metaStatus, metaAudioPath, metaLegacyAudioUrl]);
  const audioUrl = signedAudioUrl;
  const title = metadata?.title || titleProp || 'Podcast episode';
  const bars = useMemo(() => makeBars(podcastId || title), [podcastId, title]);

  // Wire up the <audio> element.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentTime(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onWait = () => setBuffering(true);
    const onPlay = () => { setBuffering(false); setIsPlaying(true); };
    const onPause = () => setIsPlaying(false);
    const onEnd = () => { setIsPlaying(false); setCurrentTime(0); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('waiting', onWait);
    a.addEventListener('playing', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('waiting', onWait);
      a.removeEventListener('playing', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnd);
    };
  }, [audioUrl]);

  // Load transcript segments (for the synced center line). Like audio, the
  // backend keeps the transcript at a GCS path and mints a signed URL on
  // demand. The dep array is narrow so Firestore snapshot noise doesn't cause
  // the transcript to be re-fetched (and briefly nulled) on every emission.
  const metaTranscriptPath = (metadata as any)?.transcriptPath as string | undefined;
  const metaLegacyTranscriptUrl = (metadata as any)?.transcriptUrl as string | undefined;
  useEffect(() => {
    if (!podcastId) { setSegments([]); return; }
    let cancelled = false;
    if (metaLegacyTranscriptUrl && !metaTranscriptPath) {
      fetch(metaLegacyTranscriptUrl)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const list = Array.isArray(data) ? data : Array.isArray((data as any)?.segments) ? (data as any).segments : [];
          setSegments(list);
        })
        .catch(() => { /* transcript is optional for playback */ });
    } else {
      podcastsApi
        .getTranscript(podcastId)
        .then((data) => {
          if (cancelled) return;
          // `podcastsApi.getTranscript` already unwraps the various response
          // shapes ({segments}, {transcript}, or raw array) to a plain array.
          if (Array.isArray(data)) setSegments(data as any);
        })
        .catch(() => { /* transcript is optional for playback */ });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podcastId, metaTranscriptPath, metaLegacyTranscriptUrl]);

  const activeIdx = useMemo(() => activeSegmentIndex(segments, currentTime), [segments, currentTime]);
  const activeSegment = activeIdx >= 0 ? segments[activeIdx] : undefined;
  const centerText = activeSegment?.text
    || metadata?.description
    || fallbackDescription
    || 'An AI-generated audio discussion that turns this material into an engaging, conversational episode.';

  const progress = duration > 0 ? currentTime / duration : 0;

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };

  const handleAsk = async () => {
    if (!question.trim()) return;
    setIsAsking(true);
    setAnswer('');
    const a = audioRef.current;
    if (a && !a.paused) a.pause();

    try {
      const res = await podcastsApi.ask(podcastId, {
        question: question.trim(),
        timeMs: currentTime * 1000,
        segmentId: activeSegment?.segmentId || 0,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.text) setAnswer((prev) => prev + data.text);
            } catch (e) {
              // ignore parse errors for partial chunks
            }
          }
        }
      }
    } catch (err) {
      setAnswer('Failed to get answer. Please try again.');
    } finally {
      setIsAsking(false);
    }
  };

  const closeAsk = () => {
    setShowAsk(false);
    setQuestion('');
    setAnswer('');
  };

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * duration;
    setCurrentTime(frac * duration);
  };

  const handleDone = () => {
    audioRef.current?.pause();
    onBack?.();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try { await generateAudio(); } catch { /* surfaced via status */ } finally { setGenerating(false); }
  };

  const isGenerating = !!metadata && ['GENERATING_SCRIPT', 'GENERATING_AUDIO', 'STITCHING_AUDIO', 'UPLOADING'].includes(metadata.status);
  const canGenerate = !metadata || metadata.status === 'PENDING' || metadata.status === 'FAILED';

  return (
    <div className="flex flex-col h-full min-h-[560px] overflow-y-auto custom-scrollbar bg-white dark:bg-[#111112] transition-colors">
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      {/* Keyframes for the live waveform pulse (compositor-friendly). */}
      <style>{`@keyframes podWave{0%,100%{transform:scaleY(0.5)}50%{transform:scaleY(1)}}`}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-5 md:px-8 pt-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            title="Back to episodes"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[17px] md:text-[19px] font-bold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">{title}</h1>
        </div>
        {audioUrl && (
          <button
            onClick={() => {
              setShowAsk(true);
              audioRef.current?.pause();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[13.5px] font-semibold hover:bg-orange-100 dark:hover:bg-orange-500/20 transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> Ask a Question
          </button>
        )}
      </div>

      {/* Centered player */}
      <div className="flex-1 flex flex-col items-center justify-center gap-7 w-full max-w-2xl mx-auto px-6 py-8">
        <Orb playing={isPlaying && !!audioUrl} />

        {/* Transcript / description line */}
        <div className="text-center min-h-[92px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={activeSegment ? activeIdx : 'desc'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="text-[14.5px] leading-relaxed text-slate-600 dark:text-gray-300 whitespace-pre-line line-clamp-6"
            >
              {centerText}
            </motion.p>
          </AnimatePresence>
          <div className="mt-3 text-[12.5px] text-slate-400 dark:text-gray-500 truncate max-w-md mx-auto">
            {activeSegment?.speaker || title}
          </div>
        </div>

        {/* Waveform + controls, or generate/generating states */}
        {audioUrl ? (
          <>
            <div className="w-full flex items-center gap-3">
              <div
                onClick={seekFromEvent}
                className="group relative flex-1 flex items-center justify-between gap-[2px] h-16 cursor-pointer"
                title="Seek"
              >
                {bars.map((hgt, i) => {
                  const played = i / BAR_COUNT <= progress;
                  return (
                    <span
                      key={i}
                      className={cn(
                        'flex-1 rounded-full transition-colors duration-300',
                        played ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-emerald-500/20 dark:bg-emerald-400/20'
                      )}
                      style={{
                        height: `${Math.round(hgt * 100)}%`,
                        transformOrigin: 'center',
                        animation: isPlaying ? `podWave ${(0.8 + (i % 5) * 0.12).toFixed(2)}s ease-in-out ${((i % 8) * 0.08).toFixed(2)}s infinite` : undefined,
                      }}
                    />
                  );
                })}
              </div>
              <span className="text-[13px] font-medium text-slate-400 dark:text-gray-500 tabular-nums shrink-0">
                {fmtTime(currentTime)}
                {duration > 0 && <span className="text-slate-300 dark:text-gray-600"> / {fmtTime(duration)}</span>}
              </span>
            </div>

            {/* Controls */}
            <div className="flex items-start justify-center gap-14 pt-1">
              <ControlButton
                onClick={togglePlay}
                label={isPlaying ? 'Pause' : 'Play'}
                tone="neutral"
              >
                {buffering ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-6 h-6" fill="currentColor" />
                ) : (
                  <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
                )}
              </ControlButton>

              <ControlButton onClick={handleDone} label="Done" tone="success">
                <Check className="w-6 h-6" />
              </ControlButton>
            </div>

            {/* Optional full transcript. Gated on either the legacy public
                transcriptUrl OR the modern transcriptPath (GCS-backed) so
                episodes generated by the current pipeline actually expose the
                "Show full transcript" affordance instead of hiding it. */}
            {(metaTranscriptPath || metaLegacyTranscriptUrl || segments.length > 0) && (
              <div className="w-full">
                <button
                  onClick={() => setShowTranscript((v) => !v)}
                  className="mx-auto flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showTranscript ? 'Hide transcript' : 'Show full transcript'}
                  <ChevronDown className={cn('w-4 h-4 transition-transform', showTranscript && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {showTranscript && metadata && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden mt-3"
                    >
                      <PodcastTranscript
                        metadata={metadata}
                        currentTime={currentTime}
                        onSeek={(ms) => {
                          const a = audioRef.current;
                          if (a) {
                            a.currentTime = ms / 1000;
                            a.play().catch(() => {});
                          }
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </>
        ) : isGenerating ? (
          <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-gray-400 py-2">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              <span className="text-[14px] font-medium">
                Synthesizing audio — {String(metadata?.status || '').toLowerCase().replace(/_/g, ' ')}…
              </span>
            </div>
            <p className="text-[12.5px] text-slate-400 dark:text-gray-500">This can take a minute. The player will start automatically.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-2">
            <p className="text-[13.5px] text-slate-500 dark:text-gray-400 text-center max-w-sm">
              {metadata?.status === 'FAILED'
                ? 'Audio generation failed last time. You can try generating it again.'
                : "Audio hasn't been generated for this episode yet."}
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating || !canGenerate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-[13.5px] font-bold shadow-sm shadow-emerald-500/25 transition-colors"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate audio
            </button>
          </div>
        )}
      </div>

      {/* Ask A Question Overlay */}
      <AnimatePresence>
        {showAsk && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#1a1a1b] border-t border-slate-200 dark:border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-3xl p-6"
          >
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h3 className="text-[16px] font-bold text-slate-800 dark:text-gray-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-500" /> Live Q&A
                </h3>
                <button onClick={closeAsk} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question about what was just discussed..."
                  disabled={isAsking || !!answer}
                  className="w-full h-24 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141415] text-[14px] text-slate-800 dark:text-slate-100 outline-none resize-none disabled:opacity-60"
                />
                {!answer && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleAsk}
                      disabled={isAsking || !question.trim()}
                      className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold text-[13.5px] transition-colors"
                    >
                      {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ask'}
                    </button>
                  </div>
                )}
              </div>

              {answer && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 p-4 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 text-[14px] text-slate-700 dark:text-gray-300">
                  {answer}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A round, outlined control with a caption beneath — matches the template's two buttons. */
function ControlButton({ children, onClick, label, tone }: { children: React.ReactNode; onClick: () => void; label: string; tone: 'neutral' | 'success' }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 group">
      <span
        className={cn(
          'w-14 h-14 rounded-full border flex items-center justify-center transition-all active:scale-95 group-hover:shadow-md',
          tone === 'success'
            ? 'border-emerald-300 dark:border-emerald-500/40 text-emerald-500 dark:text-emerald-400 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10'
            : 'border-slate-300 dark:border-white/15 text-slate-600 dark:text-gray-200 group-hover:bg-slate-50 dark:group-hover:bg-white/5'
        )}
      >
        {children}
      </span>
      <span className={cn('text-[12.5px] font-medium', tone === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-gray-400')}>
        {label}
      </span>
    </button>
  );
}
