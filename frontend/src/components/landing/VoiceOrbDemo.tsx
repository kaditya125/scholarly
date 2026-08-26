import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Pause } from 'lucide-react';
import VoiceWaveform from '../chat/VoiceWaveform';
import type { VoiceState } from '../../hooks/useVoiceSession';

/**
 * Landing-page demonstration of voice mode.
 *
 * Renders the REAL VoiceWaveform the product uses, not a mock or a recording of one. If the visual
 * changes in the app it changes here, so this cannot quietly become a picture of something we no
 * longer ship — the usual fate of a hand-built marketing replica.
 *
 * ── Why there is a button rather than autoplay ──────────────────────────────────────────────
 * Audio cannot start on scroll. Chrome and Safari block playback with sound until the page has
 * received a real user gesture, so a scroll-triggered clip is silently muted for most visitors —
 * the worst outcome, because it looks like it played and nobody hears anything. It is also the
 * behaviour people leave a page over. One tap is honest and it works everywhere.
 *
 * ── The sample is a real answer ─────────────────────────────────────────────────────────────
 * The clip is what the production voice stack actually replied when asked about the SSC CGL
 * quantitative section, spoken by Kore — the same voice a student hears in a real session. This
 * section claims the tutor answers from the commission's published syllabus rather than from
 * memory, so demonstrating it with invented copy would advertise a behaviour we do not have.
 *
 * ── Two spectrum sources ────────────────────────────────────────────────────────────────────
 * While the clip plays the waveform is driven by a real AnalyserNode on the audio element, so the
 * ribbon moves to the actual speech rather than to an approximation of it. When idle it falls
 * back to a synthetic speech-shaped signal so the orb stays alive instead of sitting frozen
 * between plays. No microphone is ever requested on this page.
 */

const SPECTRUM_BINS = 128;

/** A turn cycle at a conversational pace, used only when the clip is not playing. */
const IDLE_SCRIPT: Array<{ state: VoiceState; caption: string; ms: number }> = [
  { state: 'LISTENING', caption: 'Listening…', ms: 2600 },
  { state: 'USER_SPEAKING', caption: '“What’s in the SSC CGL quant syllabus?”', ms: 3400 },
  { state: 'AI_SPEAKING', caption: 'Sadhya answers — from the official notice', ms: 5200 },
  { state: 'LISTENING', caption: 'Listening…', ms: 2200 },
];

export const VoiceOrbDemo: React.FC<{ className?: string }> = ({ className }) => {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startedRef = useRef(performance.now());
  const stateRef = useRef<VoiceState>('LISTENING');
  const playingRef = useRef(false);

  const idle = IDLE_SCRIPT[step % IDLE_SCRIPT.length];
  const current: { state: VoiceState; caption: string } = playing
    ? { state: 'AI_SPEAKING', caption: 'Sadhya answers — from the official SSC notice' }
    : idle;
  stateRef.current = current.state;
  playingRef.current = playing;

  // The idle cycle only advances while nothing is playing; real audio drives the state otherwise.
  useEffect(() => {
    if (playing) return;
    const id = setTimeout(() => setStep((s) => s + 1), idle.ms);
    return () => clearTimeout(id);
  }, [step, idle.ms, playing]);

  const toggle = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;

    if (playingRef.current) { el.pause(); return; }

    /*
     * Built on the click, never before: an AudioContext created without a gesture starts
     * suspended, and a MediaElementSource can only be attached to an element once — so both are
     * done here, once, and reused for every later play.
     */
    if (!ctxRef.current) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctor();
      const src = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);
      analyser.connect(ctx.destination);   // still has to reach the speakers
      ctxRef.current = ctx;
      analyserRef.current = analyser;
    }
    if (ctxRef.current.state === 'suspended') await ctxRef.current.resume();

    try { el.currentTime = 0; await el.play(); } catch { /* blocked or interrupted; button stays */ }
  }, []);

  useEffect(() => () => { void ctxRef.current?.close().catch(() => {}); }, []);

  /*
   * Real analyser while the clip plays; otherwise a synthetic stand-in shaped like speech —
   * energy concentrated in the low bins, an envelope that rises and falls across a phrase, and
   * enough per-bin variation that the ribbon articulates instead of pulsing as one block.
   */
  const readSpectrum = useCallback((out: Uint8Array): boolean => {
    if (playingRef.current && analyserRef.current) {
      analyserRef.current.getByteFrequencyData(out);
      return true;
    }
    const speaking = stateRef.current === 'USER_SPEAKING' || stateRef.current === 'AI_SPEAKING';
    if (!speaking) { out.fill(0); return false; }

    const t = (performance.now() - startedRef.current) / 1000;
    const syllable = 0.55 + 0.45 * Math.sin(t * 8.2);   // ~4 syllables a second
    const phrase = 0.6 + 0.4 * Math.sin(t * 1.1);
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const tilt = Math.exp(-i / 22);                    // voice energy sits low
      const detail = 0.75 + 0.25 * Math.sin(i * 0.7 + t * 5.5);
      out[i] = Math.max(0, Math.min(255, tilt * detail * syllable * phrase * 255));
    }
    return true;
  }, []);

  return (
    /*
      No card. The waveform is transparent and draws with straight alpha, so it sits on the page
      the same way it does in the app.
    */
    <div className={className}>
      <div className="flex items-center justify-center gap-2 text-[12.5px] font-semibold text-slate-400 dark:text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-[#8ba32b] dark:bg-[#c8e558]" />
        Voice mode
      </div>

      <VoiceWaveform
        state={current.state}
        readSpectrum={readSpectrum}
        className="w-full h-48 sm:h-56"
      />

      <div className="text-center">
        <motion.p
          key={current.caption}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[14.5px] font-semibold text-slate-800 dark:text-slate-100"
        >
          {current.caption}
        </motion.p>

        <button
          onClick={toggle}
          disabled={!ready}
          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-white/15
                     text-[13px] font-semibold text-slate-700 dark:text-slate-200
                     hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          aria-label={playing ? 'Stop the voice sample' : 'Play a real answer from Sadhya'}
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {playing ? 'Stop' : 'Hear a real answer'}
        </button>

        <p className="mt-2 text-[12px] text-slate-400 dark:text-slate-500">
          A real reply from Sadhya, in the voice students hear — no microphone is used on this page
        </p>
      </div>

      {/*
        Served from /media/, NOT /voice-…: nginx proxies `location /voice` to the WebSocket
        gateway as a PREFIX match, so any path merely BEGINNING with "/voice" — including
        /voice-sample-ssc-cgl.mp3 — is handed to the socket handler and comes back 404.

        "metadata", not "none": with none the element never reaches a readable state until play is
        attempted, so onLoadedMetadata never fires and the button stays disabled forever. Metadata
        is a few KB of header — the 37KB of audio still only downloads if someone presses play.
      */}
      <audio
        ref={audioRef}
        src="/media/voice-sample-ssc-cgl.mp3"
        preload="metadata"
        onCanPlay={() => setReady(true)}
        onLoadedMetadata={() => setReady(true)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setStep(0); startedRef.current = performance.now(); }}
        onError={() => setReady(false)}
      />
    </div>
  );
};

export default VoiceOrbDemo;
