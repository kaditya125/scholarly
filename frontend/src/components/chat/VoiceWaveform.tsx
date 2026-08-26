import React, { useEffect, useRef } from 'react';
import type { VoiceState } from '../../hooks/useVoiceSession';

/**
 * The flowing ribbon that reacts to whoever is speaking.
 *
 * ── Why filaments rather than a line ────────────────────────────────────────────────────────
 * The look this imitates is not one stroke per ribbon. Each ribbon is a BUNDLE of many very thin
 * curves whose phases drift slightly apart, so where they converge the colour reads solid and
 * where they fan out it reads as silk. A single thick stroke with a glow cannot produce that —
 * it just looks like a neon worm.
 *
 * ── Why canvas rather than SVG or CSS ───────────────────────────────────────────────────────
 * ~2,000 curve segments redrawn every frame. In SVG that is 2,000 DOM nodes mutating at 60fps,
 * which is where the frame budget goes and why the page stops responding to anything else.
 *
 * ── Why it reads audio through a ref ────────────────────────────────────────────────────────
 * `readSpectrum` fills a buffer rather than returning React state. Sixty spectrum updates a
 * second through setState would re-render the whole voice surface for something only this canvas
 * looks at.
 *
 * Idle is deliberately not still: a frozen ribbon reads as broken. With no audio it drifts on its
 * own slow phase so the surface stays alive while nobody is talking.
 */

interface Props {
  state: VoiceState;
  /** Fills the array with the live spectrum. False when nothing is sounding. */
  readSpectrum: (out: Uint8Array) => boolean;
  className?: string;
}

/** One ribbon: a family of filaments sharing a wave shape but drifting apart in phase. */
interface Ribbon {
  hue: number;
  /** Vertical share of the canvas this ribbon may swing through. */
  reach: number;
  /** Radians per second of horizontal travel. Different per ribbon so they never lock together. */
  drift: number;
  /** Spatial frequency — how many crests fit across the width. */
  waves: number;
  phase: number;
  filaments: number;
}

/*
 * Tuned by measurement rather than by eye. The first pass used reach ~0.27 and a 0.18 swell base,
 * which sampled back as light confined to two vertical tenths of the canvas — a flat cyan smear
 * rather than a ribbon. These values spread it across roughly six tenths, which is the proportion
 * the reference actually has.
 */
const RIBBONS: Ribbon[] = [
  { hue: 226, reach: 0.46, drift: 0.22, waves: 1.00, phase: 0.0, filaments: 26 }, // deep blue
  { hue: 190, reach: 0.38, drift: -0.31, waves: 1.50, phase: 1.9, filaments: 22 }, // cyan
  { hue: 150, reach: 0.42, drift: 0.17, waves: 1.25, phase: 3.4, filaments: 24 }, // green
];

const SPECTRUM_BINS = 128;

export const VoiceWaveform: React.FC<Props> = ({ state, readSpectrum, className }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const spectrumRef = useRef<Uint8Array>(new Uint8Array(SPECTRUM_BINS));
  /** Smoothed band energies. Raw analyser output jitters hard enough to look like noise. */
  const bandsRef = useRef<number[]>(new Array(24).fill(0));
  const stateRef = useRef<VoiceState>(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // 3x on phones costs more than it shows
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const start = performance.now();
    let last = start;

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);

      last = now;
      const t = (now - start) / 1000;

      const live = readSpectrum(spectrumRef.current);
      const spectrum = spectrumRef.current;
      const bands = bandsRef.current;

      // Fold the spectrum into a handful of bands. Voice energy sits low, so the bins are read
      // over the lower half where the detail actually is rather than spread across the full range.
      let energy = 0;
      for (let b = 0; b < bands.length; b++) {
        const lo = Math.floor((b / bands.length) * (SPECTRUM_BINS * 0.55));
        const hi = Math.floor(((b + 1) / bands.length) * (SPECTRUM_BINS * 0.55));
        let sum = 0;
        for (let i = lo; i < hi; i++) sum += spectrum[i];
        const target = live ? sum / Math.max(1, hi - lo) / 255 : 0;
        // Rise quickly, fall slowly: speech should feel responsive on attack but not flicker.
        const k = target > bands[b] ? 0.35 : 0.08;
        bands[b] += (target - bands[b]) * k;
        energy += bands[b];
      }
      energy /= bands.length;

      const idle = stateRef.current === 'IDLE' || stateRef.current === 'ENDED' || stateRef.current === 'ERROR';
      // A floor keeps the ribbon breathing when nobody is speaking.
      // A generous floor: the ribbon should have shape even in silence, not collapse to a line.
      const swell = idle ? 0.30 : 0.42 + Math.min(energy * 1.15, 0.55);

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter'; // overlapping filaments brighten, as light does

      const cy = height / 2;

      for (const r of RIBBONS) {
        for (let f = 0; f < r.filaments; f++) {
          const u = f / (r.filaments - 1);          // 0..1 across the bundle
          const spread = (u - 0.5) * 2;             // -1..1
          // Filaments fan out from the centre of the bundle, so the middle stays dense.
          const fan = 1 - Math.abs(spread) * 0.55;
          const amp = height * r.reach * swell * fan;
          const phase = r.phase + spread * 0.55 + (reduceMotion ? 0 : t * r.drift);

          ctx.beginPath();
          const steps = 64;
          for (let i = 0; i <= steps; i++) {
            const x = (i / steps) * width;
            const p = i / steps;

            // Envelope: pinned at both ends so ribbons taper to nothing at the edges.
            const envelope = Math.sin(Math.PI * p);
            const bandEnergy = bands[Math.min(bands.length - 1, Math.floor(p * bands.length))];

            const y =
              cy +
              Math.sin(p * Math.PI * 2 * r.waves + phase) * amp * envelope +
              // Second harmonic driven by the spectrum: this is what makes it track the voice
              // rather than merely pulse with its volume.
              Math.sin(p * Math.PI * 6 * r.waves - phase * 1.7) * amp * envelope * bandEnergy * 0.55 +
              spread * height * 0.012 * envelope;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          const alpha = 0.045 + (1 - Math.abs(spread)) * 0.10;
          const light = 52 + bandAt(bands, u) * 18;
          ctx.strokeStyle = `hsla(${r.hue + spread * 14}, 92%, ${light}%, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      ctx.globalCompositeOperation = 'source-over';
    };

    rafRef.current = requestAnimationFrame(frame);

    // A hidden tab should not keep a 60fps canvas alive.
    const onVisibility = () => {
      if (document.hidden && rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (!document.hidden && rafRef.current === null) {
        last = performance.now();
        rafRef.current = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [readSpectrum]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
};

/** Average band energy near a bundle position — used only to brighten the denser filaments. */
function bandAt(bands: number[], u: number): number {
  const i = Math.min(bands.length - 1, Math.max(0, Math.floor(u * bands.length)));
  return bands[i];
}

export default VoiceWaveform;
