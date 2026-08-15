/**
 * Text-to-Speech Studio View
 *
 * A dedicated view inside the podcast studio for one-off text synthesis.
 * Layout mirrors the reference:
 *   - Top bar with "Try With API" + "History"
 *   - Centered greeting + description
 *   - Card with textarea, model/voice selectors, speed slider, generate CTA
 *   - Bottom sticky audio player (progress, play/pause, share/download)
 *
 * Synthesis path (v1):
 *   - Uses the browser's Web Speech API (SpeechSynthesis). Zero backend
 *     work; voice quality depends on the user's OS voices. Enough to prove
 *     the UI and let users play with quick TTS.
 *   - Chirp 3 HD backend integration is a follow-up: swap `speakWithBrowser`
 *     for a call to `POST /api/tts/synthesize` and load the returned audio
 *     into the same <audio> element. The UI wiring stays the same.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Mic,
  Pause,
  Play,
  Share2,
  Sparkles,
  History as HistoryIcon,
  MoreHorizontal,
  Wand2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Voice {
  id: string;
  label: string;
  accent: string;
  gender: 'male' | 'female' | 'neutral';
  voice: SpeechSynthesisVoice | null;
}

interface HistoryEntry {
  id: string;
  text: string;
  voiceLabel: string;
  createdAt: number;
  characters: number;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const MAX_CHARACTERS = 5000;
const HISTORY_STORAGE_KEY = 'tts-history-v1';
const HISTORY_LIMIT = 20;

export default function TextToSpeechView() {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [speed, setSpeed] = useState(1); // 0.5 – 2 range, 1 = Normal
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('browser');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const voices = useBrowserVoices();
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const tickerRef = useRef<number | null>(null);

  // Default to first English voice when the list first loads.
  useEffect(() => {
    if (!selectedVoiceId && voices.length > 0) {
      const preferred =
        voices.find((v) => v.voice?.lang?.startsWith('en')) ||
        voices[0];
      setSelectedVoiceId(preferred.id);
    }
  }, [voices, selectedVoiceId]);

  const selectedVoice = useMemo(
    () => voices.find((v) => v.id === selectedVoiceId) || null,
    [voices, selectedVoiceId]
  );

  const characterCount = text.length;
  const overLimit = characterCount > MAX_CHARACTERS;
  const canSpeak = !isSpeaking && !overLimit && text.trim().length > 0 && !!selectedVoice;

  // Clean up any ongoing speech when the view unmounts.
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel?.();
      if (tickerRef.current != null) window.clearInterval(tickerRef.current);
    };
  }, []);

  const stopTicker = () => {
    if (tickerRef.current != null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  };

  const speakWithBrowser = () => {
    if (!selectedVoice || !text.trim()) return;
    // Cancel anything in flight first — SpeechSynthesis is finicky about overlaps.
    window.speechSynthesis.cancel();
    stopTicker();

    const utter = new SpeechSynthesisUtterance(text);
    if (selectedVoice.voice) utter.voice = selectedVoice.voice;
    utter.rate = Math.max(0.5, Math.min(2, speed));
    utter.pitch = 1;

    utter.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
      setElapsedMs(0);
      // Approximate duration: ~14 chars/sec at rate=1.
      const estimated = Math.max(1000, Math.round((text.length / 14 / utter.rate) * 1000));
      setTotalMs(estimated);
      const start = Date.now();
      tickerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - start);
      }, 100);
    };
    utter.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      stopTicker();
      setElapsedMs((prev) => Math.max(prev, totalMs));
      pushHistory({
        id: `h-${Date.now()}`,
        text,
        voiceLabel: selectedVoice.label,
        createdAt: Date.now(),
        characters: text.length,
      });
    };
    utter.onerror = (e) => {
      console.warn('[TTS] SpeechSynthesis error:', e);
      setIsSpeaking(false);
      setIsPaused(false);
      stopTicker();
    };
    utter.onpause = () => {
      setIsPaused(true);
    };
    utter.onresume = () => {
      setIsPaused(false);
    };

    utteranceRef.current = utter;
    window.speechSynthesis.speak(utter);
  };

  const handlePlayPauseClick = () => {
    if (!isSpeaking) {
      speakWithBrowser();
      return;
    }
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } else {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const handleGenerate = () => {
    speakWithBrowser();
  };

  const pushHistory = (entry: HistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, HISTORY_LIMIT);
      saveHistory(next);
      return next;
    });
  };

  const handleReplayHistory = (entry: HistoryEntry) => {
    setText(entry.text);
    setShowHistory(false);
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const firstName = useMemo(() => {
    const raw = (user?.displayName || user?.email || '').split(/[\s@]/)[0];
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'there';
  }, [user]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-[#1a1d21]">
      {/* Top bar */}
      <div className="h-12 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#23262b] flex-shrink-0">
        <h2 className="text-[15px] font-medium text-gray-900 dark:text-gray-100">Text to Speech</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
            title="Backend API integration coming next"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Try with API
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border transition-colors',
              showHistory
                ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-300'
                : 'bg-white dark:bg-transparent border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/20'
            )}
          >
            <HistoryIcon className="w-3.5 h-3.5" />
            History
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-3xl mx-auto px-6 py-10">
          {/* Greeting */}
          <div className="text-center mb-8">
            <h1 className="text-[24px] sm:text-[26px] font-semibold text-slate-900 dark:text-white tracking-[-0.02em]">
              {greeting}, {firstName} <span aria-hidden>👋</span>
            </h1>
            <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
              Turn any text into natural speech. Pick a voice, set the pace, and press play.
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#141416] shadow-xs overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-900 dark:text-white">
                <FileText className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
                Text to Speech
              </div>
              <div className="flex items-center gap-2">
                <DropdownButton
                  label={selectedModel === 'browser' ? 'Browser TTS' : 'Backend TTS'}
                  open={modelMenuOpen}
                  onToggle={() => setModelMenuOpen((v) => !v)}
                >
                  <MenuItem
                    active={selectedModel === 'browser'}
                    onClick={() => {
                      setSelectedModel('browser');
                      setModelMenuOpen(false);
                    }}
                  >
                    Browser TTS <span className="ml-2 text-[10.5px] text-slate-400">available</span>
                  </MenuItem>
                  <MenuItem
                    disabled
                    active={false}
                    onClick={() => {
                      /* future */
                    }}
                  >
                    Chirp 3 HD <span className="ml-2 text-[10.5px] text-slate-400">soon</span>
                  </MenuItem>
                </DropdownButton>

                <DropdownButton
                  label={selectedVoice?.label || 'Select voice'}
                  icon={<Mic className="w-3.5 h-3.5" />}
                  open={voiceMenuOpen}
                  onToggle={() => setVoiceMenuOpen((v) => !v)}
                >
                  <div className="max-h-64 overflow-y-auto scrollbar-hide">
                    {voices.length === 0 && (
                      <div className="px-3 py-2 text-[12.5px] text-slate-500 dark:text-slate-400">
                        No voices available in this browser.
                      </div>
                    )}
                    {voices.map((v) => (
                      <MenuItem
                        key={v.id}
                        active={selectedVoiceId === v.id}
                        onClick={() => {
                          setSelectedVoiceId(v.id);
                          setVoiceMenuOpen(false);
                        }}
                      >
                        <div className="flex-1">
                          <div className="text-[13px] font-medium">{v.label}</div>
                          <div className="text-[11px] text-slate-400">
                            {v.accent} · {v.gender}
                          </div>
                        </div>
                      </MenuItem>
                    ))}
                  </div>
                </DropdownButton>
              </div>
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type or paste the text you want to convert to speech..."
              rows={6}
              className="w-full px-4 py-3.5 bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none resize-none text-[14px] leading-relaxed scrollbar-hide"
            />

            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-3 flex-1 max-w-sm">
                <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">Speed</span>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="flex-1 accent-[#8ba32b] dark:accent-[#c8e558]"
                />
                <span className="text-[12px] font-mono font-medium text-slate-600 dark:text-slate-300 w-14 text-right">
                  {speedLabel(speed)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'text-[11.5px] font-mono',
                    overLimit ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'
                  )}
                >
                  {characterCount.toLocaleString()} / {MAX_CHARACTERS.toLocaleString()} characters
                </span>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canSpeak}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all shadow-xs',
                    canSpeak
                      ? 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 active:scale-95'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                  )}
                >
                  {isSpeaking ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Speaking...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate speech
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* History drawer inline */}
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#23262b] p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">
                  History
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setHistory([]);
                    saveHistory([]);
                  }}
                  disabled={history.length === 0}
                  className="text-[11.5px] text-gray-500 dark:text-gray-400 hover:text-red-500 disabled:opacity-40"
                >
                  Clear all
                </button>
              </div>
              {history.length === 0 ? (
                <p className="text-[12.5px] text-gray-500 dark:text-gray-400">
                  Your generated clips will show up here.
                </p>
              ) : (
                <div className="space-y-1">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => handleReplayHistory(h)}
                      className="w-full flex items-start gap-3 text-left px-2 py-2 rounded-md hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Mic className="w-3.5 h-3.5 text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-gray-800 dark:text-gray-200 truncate">
                          {h.text}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                          {h.voiceLabel} · {timeAgo(h.createdAt)} · {h.characters} chars
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Bottom player */}
      <AudioPlayerBar
        text={text}
        voiceLabel={selectedVoice?.label}
        isSpeaking={isSpeaking}
        isPaused={isPaused}
        elapsedMs={elapsedMs}
        totalMs={totalMs || 1}
        onPlayPause={handlePlayPauseClick}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom sticky player
// ---------------------------------------------------------------------------

function AudioPlayerBar({
  text,
  voiceLabel,
  isSpeaking,
  isPaused,
  elapsedMs,
  totalMs,
  onPlayPause,
}: {
  text: string;
  voiceLabel?: string;
  isSpeaking: boolean;
  isPaused: boolean;
  elapsedMs: number;
  totalMs: number;
  onPlayPause: () => void;
}) {
  const progressPct = Math.min(100, (elapsedMs / totalMs) * 100);
  const showPause = isSpeaking && !isPaused;
  const truncatedText = text.length > 60 ? `${text.slice(0, 60)}...` : text;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1d21] flex-shrink-0">
      <div className="h-1 bg-gray-200 dark:bg-gray-800 relative">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="px-6 py-3 flex items-center gap-4">
        <div className="text-[11.5px] tabular-nums text-gray-500 dark:text-gray-400 w-12">
          {formatTime(elapsedMs)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-gray-800 dark:text-gray-200 truncate">
            {truncatedText || 'Nothing to speak yet.'}
          </div>
          {voiceLabel && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500 inline-block" />
              {voiceLabel}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPlayPause}
            disabled={!text.trim()}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
              text.trim()
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
            )}
            aria-label={showPause ? 'Pause' : 'Play'}
          >
            {showPause ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
        </div>
        <div className="text-[11.5px] tabular-nums text-gray-500 dark:text-gray-400 w-12 text-right">
          {formatTime(totalMs)}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 dark:text-gray-400"
            title="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 dark:text-gray-400"
            title="Download (backend synthesis required)"
            disabled
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 dark:text-gray-400"
            title="More"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dropdown helpers
// ---------------------------------------------------------------------------

function DropdownButton({
  label,
  icon,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onToggle();
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium border transition-colors',
          'bg-white dark:bg-transparent border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/20'
        )}
      >
        {icon}
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[220px] rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-[#23262b] shadow-lg z-10 overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left transition-colors',
        disabled
          ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
          : active
          ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Voice list hook
// ---------------------------------------------------------------------------

function useBrowserVoices(): Voice[] {
  const [voices, setVoices] = useState<Voice[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    const load = () => {
      const raw = window.speechSynthesis.getVoices();
      const mapped: Voice[] = raw.map((v) => ({
        id: `${v.name}::${v.lang}`,
        label: v.name,
        accent: v.lang,
        gender: guessGender(v.name),
        voice: v,
      }));
      setVoices(mapped);
    };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', load);
    };
  }, []);

  return voices;
}

function guessGender(name: string): 'male' | 'female' | 'neutral' {
  const n = name.toLowerCase();
  const female = ['female', 'zira', 'aria', 'samantha', 'victoria', 'karen', 'susan', 'joanna', 'salli', 'aoede', 'kore', 'zephyr'];
  const male = ['male', 'david', 'alex', 'daniel', 'thomas', 'mark', 'george', 'charon', 'fenrir', 'puck'];
  if (female.some((k) => n.includes(k))) return 'female';
  if (male.some((k) => n.includes(k))) return 'male';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// History persistence
// ---------------------------------------------------------------------------

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function speedLabel(speed: number): string {
  if (speed <= 0.6) return 'Slow';
  if (speed <= 0.9) return 'Relaxed';
  if (speed < 1.15) return 'Normal';
  if (speed < 1.5) return 'Brisk';
  return 'Fast';
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
