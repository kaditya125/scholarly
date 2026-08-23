import React, { useEffect, useRef, useState } from 'react';
import { Mic, Trash2, Send, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface VoiceRecorderProps {
  onSendAudio: (file: File, duration: number, waveform: number[]) => Promise<void>;
  onCancel: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceRecorder({ onSendAudio, onCancel }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const waveformSamplesRef = useRef<number[]>([]);

  // Start recording on mount
  useEffect(() => {
    let active = true;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        // Web Audio API for live visualization
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateWaveform = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length / 255;
            waveformSamplesRef.current.push(Math.max(0.15, Math.min(1, avg)));
            if (waveformSamplesRef.current.length > 28) {
              waveformSamplesRef.current.shift();
            }
            setWaveform([...waveformSamplesRef.current]);
            animFrameRef.current = requestAnimationFrame(updateWaveform);
          };
          animFrameRef.current = requestAnimationFrame(updateWaveform);
        } catch {
          /* Fallback if Web Audio context cannot start */
        }

        // Determine supported MIME type
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.start(100);
        setIsRecording(true);

        timerRef.current = setInterval(() => {
          setSeconds((s) => s + 1);
        }, 1000);
      } catch (err: any) {
        if (active) {
          setPermissionError(
            err.name === 'NotAllowedError'
              ? 'Microphone access was denied. Please allow microphone permissions in your browser settings.'
              : 'Could not access microphone.'
          );
        }
      }
    }

    start();

    return () => {
      active = false;
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  const handleCancel = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    cleanup();
    onCancel();
  };

  const handleFinishAndSend = async () => {
    if (!mediaRecorderRef.current || isSending) return;
    setIsSending(true);

    const recorder = mediaRecorderRef.current;
    const finalSeconds = Math.max(1, seconds);
    const recordedWaveform = [...waveformSamplesRef.current];

    recorder.onstop = async () => {
      try {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: mimeType });

        await onSendAudio(file, finalSeconds, recordedWaveform);
        cleanup();
      } catch (err) {
        console.error('Error sending audio note:', err);
        setIsSending(false);
      }
    };

    recorder.stop();
    cleanup();
  };

  if (permissionError) {
    return (
      <div className="flex items-center justify-between p-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[12.5px] font-sans">
        <span>{permissionError}</span>
        <button
          onClick={onCancel}
          className="px-3 py-1 rounded-lg bg-rose-200/80 dark:bg-rose-500/20 font-semibold hover:bg-rose-200 cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-slate-900 dark:bg-black text-white px-4 py-2.5 rounded-2xl shadow-lg border border-slate-800 dark:border-white/10 font-sans">
      {/* Recording indicator & timer */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
        </span>
        <span className="text-[13px] font-semibold tabular-nums text-slate-200">
          {formatDuration(seconds)}
        </span>
      </div>

      {/* Live Waveform Bars */}
      <div className="flex-1 flex items-center justify-center gap-[3px] h-6 px-2 overflow-hidden">
        {waveform.length === 0 ? (
          <span className="text-[11px] text-slate-400">Listening to voice...</span>
        ) : (
          waveform.map((amp, i) => (
            <span
              key={i}
              className="w-[3px] bg-[#c8e558] rounded-full transition-all duration-75"
              style={{
                height: `${Math.max(15, Math.min(100, amp * 100))}%`,
              }}
            />
          ))
        )}
      </div>

      {/* Action Buttons: Cancel & Send */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleCancel}
          disabled={isSending}
          className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer"
          title="Cancel recording"
          aria-label="Cancel recording"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          onClick={handleFinishAndSend}
          disabled={isSending}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#8ba32b] dark:bg-[#c8e558] text-white dark:text-slate-950 font-semibold text-[12.5px] hover:opacity-90 transition-all cursor-pointer shadow-md disabled:opacity-50"
          aria-label="Send voice note"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
