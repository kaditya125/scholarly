import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Attachment } from '../../lib/api/uploads';

interface VoiceNotePlayerProps {
  attachment: Attachment;
  mine?: boolean;
}

const SPEED_OPTIONS = [1, 1.5, 2];

function formatAudioTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VoiceNotePlayer({ attachment, mine }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(attachment.duration || 0);
  const [speedIndex, setSpeedIndex] = useState(0);

  // Fallback / generated waveform bars
  const waveformBars = useMemo(() => {
    if (attachment.waveform && attachment.waveform.length > 0) {
      return attachment.waveform;
    }
    // Generate deterministic pleasing audio bars based on attachment id or name
    const seed = (attachment.id || attachment.name || 'audio')
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const bars: number[] = [];
    for (let i = 0; i < 36; i++) {
      const val = Math.sin(seed * 0.1 + i * 0.45) * 0.4 + 0.55;
      bars.push(Math.max(0.2, Math.min(1, val)));
    }
    return bars;
  }, [attachment.waveform, attachment.id, attachment.name]);

  useEffect(() => {
    const audio = new Audio(attachment.url);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audioRef.current = null;
    };
  }, [attachment.url]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => {
        console.warn('Audio playback error:', err);
      });
      setIsPlaying(true);
    }
  };

  const cycleSpeed = () => {
    const nextIdx = (speedIndex + 1) % SPEED_OPTIONS.length;
    setSpeedIndex(nextIdx);
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEED_OPTIONS[nextIdx];
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-2xl max-w-sm transition-all font-sans",
        mine
          ? "bg-white/15 text-white"
          : "bg-slate-100/90 dark:bg-white/[0.07] text-slate-800 dark:text-gray-100 border border-slate-200/50 dark:border-white/5"
      )}
    >
      {/* Play / Pause Circular Button */}
      <button
        onClick={togglePlay}
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-sm",
          mine
            ? "bg-white text-indigo-600 hover:bg-slate-100"
            : "bg-[#8ba32b] dark:bg-[#c8e558] text-white dark:text-slate-950 hover:opacity-90"
        )}
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform & Timing */}
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5">
        {/* Scrubbable Waveform */}
        <div
          onClick={handleSeek}
          className="flex items-center gap-[2.5px] h-6 cursor-pointer py-1 group"
          title="Click to seek"
        >
          {waveformBars.map((amp, idx) => {
            const barProgress = idx / waveformBars.length;
            const isPlayed = barProgress <= progress;
            return (
              <span
                key={idx}
                className={cn(
                  "w-[3px] rounded-full transition-all duration-100",
                  isPlayed
                    ? mine
                      ? "bg-white"
                      : "bg-[#8ba32b] dark:bg-[#c8e558]"
                    : mine
                    ? "bg-white/30 group-hover:bg-white/40"
                    : "bg-slate-300 dark:bg-white/20 group-hover:bg-slate-400"
                )}
                style={{
                  height: `${Math.max(20, Math.min(100, amp * 100))}%`,
                }}
              />
            );
          })}
        </div>

        {/* Time & Mic Badge */}
        <div className="flex items-center justify-between text-[11px] font-medium leading-none">
          <span className={cn(mine ? "text-white/80" : "text-slate-500 dark:text-gray-400")}>
            {isPlaying || currentTime > 0
              ? formatAudioTime(currentTime)
              : formatAudioTime(duration)}
          </span>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 opacity-60 text-[10px]">
              <Mic className="w-3 h-3" /> Voice
            </span>

            {/* Speed Toggle */}
            <button
              onClick={cycleSpeed}
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-bold tracking-tight transition-colors cursor-pointer",
                mine
                  ? "bg-white/20 hover:bg-white/30 text-white"
                  : "bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-300 hover:bg-slate-300"
              )}
              title="Toggle playback speed"
            >
              {SPEED_OPTIONS[speedIndex]}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
