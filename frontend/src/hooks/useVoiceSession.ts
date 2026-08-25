import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../lib/firebase';

/**
 * Realtime voice session against the Sadhya voice gateway.
 *
 * Owns the whole audio lifecycle: microphone permission, the capture worklet, the WebSocket, the
 * playback queue and teardown. The component using it only reads `state` and renders.
 *
 * Two things here are load-bearing and easy to break:
 *
 *  1. Capture frames are forwarded the moment they arrive. The worklet already paces at
 *     wall-clock speed; buffering them up and flushing in bursts defeats the server's
 *     voice-activity detection and yields a silent session with no error to explain it.
 *
 *  2. Playback is a scheduled queue, not `new Audio()` per chunk. Each 24 kHz PCM chunk is
 *     appended at `nextStartTime` so playback is gapless, and barge-in can drop everything
 *     still pending in one go.
 */

export type VoiceState =
  | 'IDLE'
  | 'CONNECTING'
  | 'LISTENING'
  | 'USER_SPEAKING'
  | 'AI_SPEAKING'
  | 'INTERRUPTED'
  | 'RECONNECTING'
  | 'ERROR'
  | 'ENDING'
  | 'ENDED';

export interface TranscriptLine {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

interface VoiceError {
  code: string;
  message: string;
}

const OUTPUT_SAMPLE_RATE = 24000;
/** Peak level above which we treat the user as actually speaking, not just room noise. */
const SPEAKING_THRESHOLD = 0.045;

function wsUrl(): string {
  const api = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8080/api';
  const base = api.replace(/\/api\/?$/, '');
  return base.replace(/^http/, 'ws') + '/voice';
}

export function useVoiceSession() {
  const [state, setState] = useState<VoiceState>('IDLE');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<VoiceError | null>(null);
  const [level, setLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextStartRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const stateRef = useRef<VoiceState>('IDLE');
  const endedByUser = useRef(false);

  // Dev-only conversation metrics. Measuring "user stops speaking -> first AI audio" by
  // stopwatch is hopeless at these timescales, so the session records it per turn and exposes
  // the table on window.__voiceMetrics. Purely observational: nothing here alters audio,
  // pacing or state, so the experience being judged is the real one.
  const lastSpeechEndRef = useRef(0);
  const awaitingFirstAudioRef = useRef(false);
  const bargeStartRef = useRef(0);
  const metricsRef = useRef<Array<Record<string, number | string>>>([]);
  const record = useCallback((row: Record<string, number | string>) => {
    metricsRef.current.push(row);
    if (typeof window !== 'undefined') (window as any).__voiceMetrics = metricsRef.current;
    // eslint-disable-next-line no-console
    console.log('[voice-metric]', row);
  }, []);

  const setVoiceState = useCallback((s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  /** Append to the last line when the same speaker continues, so the transcript reads as speech. */
  const appendTranscript = useCallback((role: 'user' | 'ai', text: string) => {
    if (!text) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        const merged = [...prev];
        merged[merged.length - 1] = { ...last, text: last.text + text };
        return merged;
      }
      return [...prev, { id: `${role}-${Date.now()}-${prev.length}`, role, text }];
    });
  }, []);

  /** Drop every queued and playing chunk. Used for barge-in and for teardown. */
  const stopPlayback = useCallback(() => {
    sourcesRef.current.forEach((s) => { try { s.stop(); } catch { /* already ended */ } });
    sourcesRef.current.clear();
    nextStartRef.current = 0;
  }, []);

  const enqueueAudio = useCallback((b64: string) => {
    const ctx = playCtxRef.current;
    if (!ctx) return;

    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer);

    const buffer = ctx.createBuffer(1, pcm.length, OUTPUT_SAMPLE_RATE);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    // Schedule against a running cursor so consecutive chunks butt up against each other
    // instead of overlapping or leaving audible gaps.
    const now = ctx.currentTime;
    const startAt = Math.max(now, nextStartRef.current || now);
    src.start(startAt);
    nextStartRef.current = startAt + buffer.duration;

    sourcesRef.current.add(src);
    src.onended = () => {
      sourcesRef.current.delete(src);
      if (sourcesRef.current.size === 0 && stateRef.current === 'AI_SPEAKING') {
        setVoiceState('LISTENING');
      }
    };
    if (stateRef.current !== 'AI_SPEAKING') setVoiceState('AI_SPEAKING');
  }, [setVoiceState]);

  const cleanup = useCallback(() => {
    stopPlayback();
    try { workletRef.current?.port.close(); } catch { /* noop */ }
    try { workletRef.current?.disconnect(); } catch { /* noop */ }
    workletRef.current = null;
    // Releasing every track is what actually clears the browser's mic indicator.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    captureCtxRef.current?.close().catch(() => {});
    captureCtxRef.current = null;
    playCtxRef.current?.close().catch(() => {});
    playCtxRef.current = null;
    try { wsRef.current?.close(); } catch { /* noop */ }
    wsRef.current = null;
    setLevel(0);
  }, [stopPlayback]);

  const end = useCallback(() => {
    endedByUser.current = true;
    const replies = metricsRef.current.filter((r) => r.metric === 'end_of_speech_to_first_audio').map((r) => Number(r.ms));
    const barges = metricsRef.current.filter((r) => r.metric === 'barge_in_speech_to_silence' && Number(r.ms) >= 0).map((r) => Number(r.ms));
    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    // eslint-disable-next-line no-console
    console.log('[voice-metric] SUMMARY', {
      turns: replies.length,
      replyLatencyMs: replies,
      avgReplyLatencyMs: avg(replies),
      bargeIns: barges.length,
      avgBargeInMs: avg(barges),
    });
    setVoiceState('ENDING');
    try { wsRef.current?.send(JSON.stringify({ type: 'end' })); } catch { /* noop */ }
    cleanup();
    setVoiceState('ENDED');
  }, [cleanup, setVoiceState]);

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]);
    endedByUser.current = false;
    setVoiceState('CONNECTING');

    // 1. microphone first — a permission prompt before any network work reads as more honest,
    //    and there is no point opening a billed session the user may then refuse.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError({ code: 'MIC_DENIED', message: 'Microphone access is required for voice chat. Please allow access and try again.' });
      setVoiceState('ERROR');
      return;
    }
    streamRef.current = stream;

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('not signed in');
      const token = await user.getIdToken();

      playCtxRef.current = new AudioContext();
      // Safari starts contexts suspended until a gesture; start() is always called from a click.
      if (playCtxRef.current.state === 'suspended') await playCtxRef.current.resume();

      const captureCtx = new AudioContext();
      captureCtxRef.current = captureCtx;
      if (captureCtx.state === 'suspended') await captureCtx.resume();
      await captureCtx.audioWorklet.addModule('/voice-capture-worklet.js');

      const source = captureCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(captureCtx, 'voice-capture');
      workletRef.current = worklet;

      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));

      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        switch (m.type) {
          case 'ready':
            setVoiceState('LISTENING');
            break;
          case 'transcript':
            appendTranscript(m.role, m.text);
            break;
          case 'audio':
            if (awaitingFirstAudioRef.current && lastSpeechEndRef.current) {
              awaitingFirstAudioRef.current = false;
              record({
                turn: metricsRef.current.filter((r) => r.metric === 'end_of_speech_to_first_audio').length + 1,
                metric: 'end_of_speech_to_first_audio',
                ms: Date.now() - lastSpeechEndRef.current,
              });
            }
            enqueueAudio(m.data);
            break;
          case 'interrupted':
            // Server VAD heard the user talk over the model: drop queued audio at once.
            record({
              metric: 'barge_in_speech_to_silence',
              ms: bargeStartRef.current ? Date.now() - bargeStartRef.current : -1,
            });
            bargeStartRef.current = 0;
            stopPlayback();
            setVoiceState('INTERRUPTED');
            setTimeout(() => { if (stateRef.current === 'INTERRUPTED') setVoiceState('LISTENING'); }, 150);
            break;
          case 'turn_complete':
            if (sourcesRef.current.size === 0) setVoiceState('LISTENING');
            break;
          case 'session_limit':
            setError({ code: 'SESSION_LIMIT', message: 'This voice session reached its time limit. You can start a new one.' });
            cleanup();
            setVoiceState('ENDED');
            break;
          case 'error':
            setError({ code: m.code, message: m.message });
            cleanup();
            setVoiceState('ERROR');
            break;
        }
      };

      ws.onerror = () => {
        if (endedByUser.current) return;
        setError({ code: 'VOICE_UNAVAILABLE', message: 'Voice chat encountered a temporary problem. You can continue with text chat.' });
        cleanup();
        setVoiceState('ERROR');
      };

      ws.onclose = () => {
        if (endedByUser.current || stateRef.current === 'ENDED' || stateRef.current === 'ERROR') return;
        setError({ code: 'DISCONNECTED', message: 'Voice connection ended. You can start again or continue with text chat.' });
        cleanup();
        setVoiceState('ENDED');
      };

      worklet.port.onmessage = (e) => {
        const { pcm, peak } = e.data as { pcm: ArrayBuffer; peak: number };
        setLevel(peak);
        if (stateRef.current === 'LISTENING' && peak > SPEAKING_THRESHOLD) {
          setVoiceState('USER_SPEAKING');
        } else if (stateRef.current === 'USER_SPEAKING' && peak <= SPEAKING_THRESHOLD) {
          // Student just stopped talking: this is the clock start for reply latency.
          lastSpeechEndRef.current = Date.now();
          awaitingFirstAudioRef.current = true;
          setVoiceState('LISTENING');
        } else if (stateRef.current === 'AI_SPEAKING' && peak > SPEAKING_THRESHOLD && !bargeStartRef.current) {
          // Student started talking over Sadhya: clock start for barge-in responsiveness.
          bargeStartRef.current = Date.now();
        }

        if (ws.readyState !== WebSocket.OPEN) return;
        const bytes = new Uint8Array(pcm);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        // Forwarded immediately — see the pacing note at the top of this file.
        ws.send(JSON.stringify({ type: 'audio', data: btoa(bin) }));
      };

      source.connect(worklet);
      // Not connected to destination: routing the mic to the speakers would echo.
    } catch {
      setError({ code: 'VOICE_CONNECT_FAILED', message: "I couldn't connect to voice chat. Please try again." });
      cleanup();
      setVoiceState('ERROR');
    }
  }, [appendTranscript, cleanup, enqueueAudio, setVoiceState, stopPlayback]);

  // Never leave the microphone live if the page unmounts mid-conversation.
  useEffect(() => () => cleanup(), [cleanup]);

  return { state, transcript, error, level, start, end };
}
