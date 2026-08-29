import React, { useEffect, useRef } from 'react';
import type { VoiceState } from '../../hooks/useVoiceSession';

/**
 * The voice visual: a calm orb at rest that unrolls into a flowing ribbon while anyone speaks.
 *
 * ── One shape, not two ──────────────────────────────────────────────────────────────────────
 * The orb and the ribbon are the SAME curve drawn at two ends of a morph. Every filament is
 * parametrised by p ∈ [0,1]; at morph 0 that p walks a circle, at morph 1 it walks left to right
 * across the panel, and in between the two positions are interpolated. Cross-fading two separate
 * visuals would show one dissolving through the other, which reads as a glitch rather than as a
 * form changing shape.
 *
 * ── Why filaments ───────────────────────────────────────────────────────────────────────────
 * Each band is a BUNDLE of thin curves whose phases drift slightly apart — dense where they
 * converge, translucent where they fan out. That is what gives the silk look; a single thick
 * stroke with a glow reads as a neon worm.
 *
 * ── Compositing ─────────────────────────────────────────────────────────────────────────────
 * Normal alpha, NOT 'lighter'. Additive blending only makes light on a dark ground, so it needed
 * a black panel to work at all, and on the app's white surface the same canvas washed out.
 * Straight alpha lets this sit directly on the page in either theme, with no container.
 *
 * ── Why it no longer flickers ───────────────────────────────────────────────────────────────
 * Everything that drives geometry is low-passed and nothing is allowed to snap. `readSpectrum`
 * returns false the moment an analyser is absent — between turns, or while a context is torn
 * down — and treating those frames as real silence drove the amplitude to zero and back on
 * alternating frames. Silence now sags toward the resting shape instead of collapsing.
 */

interface Props {
  state: VoiceState;
  /** Fills the array with the live spectrum. False when nothing is sounding. */
  readSpectrum: (out: Uint8Array) => boolean;
  className?: string;
}

interface Ribbon {
  hue: number;
  reach: number;
  drift: number;
  waves: number;
  phase: number;
  filaments: number;
}

const RIBBONS: Ribbon[] = [
  { hue: 222, reach: 0.42, drift: 0.20, waves: 1.00, phase: 0.0, filaments: 22 }, // blue
  { hue: 190, reach: 0.34, drift: -0.28, waves: 1.50, phase: 1.9, filaments: 18 }, // cyan
  { hue: 148, reach: 0.38, drift: 0.16, waves: 1.25, phase: 3.4, filaments: 20 }, // green
];

const SPECTRUM_BINS = 128;
const BAND_COUNT = 24;

/** Approach `to` at a rate that does not depend on frame rate. */
function ease(from: number, to: number, perSecond: number, dt: number): number {
  return from + (to - from) * (1 - Math.exp(-perSecond * dt));
}

export const VoiceWaveform: React.FC<Props> = ({ state, readSpectrum, className }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const spectrumRef = useRef<Uint8Array>(new Uint8Array(SPECTRUM_BINS));
  const bandsRef = useRef<number[]>(new Array(BAND_COUNT).fill(0));
  const swellRef = useRef(0.3);
  const morphRef = useRef(0);
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
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = (now - start) / 1000;

      const s = stateRef.current;
      const speaking = s === 'USER_SPEAKING' || s === 'AI_SPEAKING' || s === 'INTERRUPTED';
      const searching = s === 'SEARCHING';

      const live = readSpectrum(spectrumRef.current);
      const spectrum = spectrumRef.current;
      const bands = bandsRef.current;

      let energy = 0;
      for (let b = 0; b < BAND_COUNT; b++) {
        const lo = Math.floor((b / BAND_COUNT) * (SPECTRUM_BINS * 0.55));
        const hi = Math.floor(((b + 1) / BAND_COUNT) * (SPECTRUM_BINS * 0.55));
        let sum = 0;
        for (let i = lo; i < hi; i++) sum += spectrum[i];
        const raw = hi > lo ? sum / (hi - lo) / 255 : 0;
        /*
         * With no analyser at all, sag from the previous value rather than snapping to zero.
         * `live` goes false between turns and during teardown, and reading those frames as
         * silence is what made the whole shape pump.
         */
        const target = live ? raw : bands[b] * 0.75;
        bands[b] = ease(bands[b], target, target > bands[b] ? 14 : 4, dt);
        energy += bands[b];
      }
      energy /= BAND_COUNT;

      // Geometry follows eased values only — nothing below reads a raw sample.
      swellRef.current = ease(swellRef.current, speaking ? 0.45 + Math.min(energy * 1.1, 0.5) : searching ? 0.38 + Math.sin(t * 3.5) * 0.05 : 0.30, 5, dt);
      morphRef.current = ease(morphRef.current, speaking ? 1 : 0, 3.2, dt);

      const swell = swellRef.current;
      const morph = morphRef.current;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const orbR = Math.min(width, height) * 0.26;

      for (const r of RIBBONS) {
        for (let f = 0; f < r.filaments; f++) {
          const u = f / (r.filaments - 1);
          const spread = (u - 0.5) * 2;
          const fan = 1 - Math.abs(spread) * 0.5;
          const phase = r.phase + spread * 0.5 + (reduceMotion ? 0 : t * r.drift);

          ctx.beginPath();
          const steps = 72;
          for (let i = 0; i <= steps; i++) {
            const p = i / steps;
            const bandEnergy = bands[Math.min(BAND_COUNT - 1, Math.floor(p * BAND_COUNT))];

            // ── resting form: a circle that breathes ──────────────────────────────────
            const theta = p * Math.PI * 2;
            /*
             * The radius must be PERIODIC in theta or the ring cannot close. Indexing bands by p
             * put band 0 at the start of the circle and band 23 at its end, at different radii —
             * a visible gap, which is why the orb rendered as a C. cos(theta) returns the same
             * value at p=0 and p=1, so the curve meets itself exactly.
             */
            const orbBand = bands[Math.floor((0.5 + 0.5 * Math.cos(theta)) * (BAND_COUNT - 1))];
            // Barely reactive at rest: a room's background noise should not make the orb pulse.
            const react = 0.02 + morph * 0.10;

            /*
             * The orb has to be alive without any audio at all.
             *
             * Damping the rest state to stop background noise driving it left a ring that just sat
             * there, which reads as a loading spinner that forgot to spin. So the motion here is
             * intrinsic rather than reactive: it continues in a silent room and the voice only
             * adds to it.
             *
             * Three harmonics at unrelated temporal rates, plus a slow spin and a slower breath.
             * None of the periods divide into one another, so the outline never returns to a pose
             * it has held before — that non-repetition is what separates "living" from "looping".
             */
            const a = theta + t * r.drift * 0.9;
            const undulate =
              Math.sin(a * 2 + t * 0.62 + phase) * 0.055 +
              Math.sin(a * 3 - t * 0.41 + phase * 1.3) * 0.038 +
              Math.sin(a * 5 + t * 0.27) * 0.020;
            const breath = 1 + Math.sin(t * 0.55 + r.phase) * 0.045;

            const wobble = (1 + undulate * fan) * breath + orbBand * react * fan;
            const rr = orbR * wobble * (0.82 + spread * 0.16);
            const ox = cx + Math.cos(theta) * rr;
            const oy = cy + Math.sin(theta) * rr;

            // ── speaking form: a ribbon across the panel ──────────────────────────────
            const envelope = Math.sin(Math.PI * p);   // pinned at both ends
            const amp = height * r.reach * swell * fan;
            const lx = p * width;
            const ly = cy
              + Math.sin(p * Math.PI * 2 * r.waves + phase) * amp * envelope
              + Math.sin(p * Math.PI * 6 * r.waves - phase * 1.7) * amp * envelope * bandEnergy * 0.5
              + spread * height * 0.012 * envelope;

            // The circle unrolls into the line; both are functions of the same p.
            const x = ox + (lx - ox) * morph;
            const y = oy + (ly - oy) * morph;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          if (morph < 0.02) ctx.closePath(); // a circle should not show a seam

          const alpha = 0.10 + (1 - Math.abs(spread)) * 0.16;
          ctx.strokeStyle = `hsla(${r.hue + spread * 12}, 78%, 48%, ${alpha})`;
          ctx.lineWidth = 1.15;
          ctx.stroke();
        }
      }
    };

    rafRef.current = requestAnimationFrame(frame);

    /*
     * Animate only when this is actually on screen AND the tab is visible.
     *
     * A hidden tab was already handled; on-screen was not, which mattered once the same component
     * went onto the landing page. A visitor reading the top of a long page would otherwise be
     * paying for a 60fps canvas sitting far below the fold, on a machine that may be a phone.
     */
    let onScreen = true;
    const resume = () => {
      if (rafRef.current === null && onScreen && !document.hidden) {
        last = performance.now();
        rafRef.current = requestAnimationFrame(frame);
      }
    };
    const pause = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const onVisibility = () => (document.hidden ? pause() : resume());
    document.addEventListener('visibilitychange', onVisibility);

    const viewObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      onScreen ? resume() : pause();
    }, { rootMargin: '120px' });   // start a little before it scrolls in, so it is never caught still
    viewObserver.observe(canvas);

    return () => {
      pause();
      document.removeEventListener('visibilitychange', onVisibility);
      viewObserver.disconnect();
      observer.disconnect();
    };
  }, [readSpectrum]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
};

export default VoiceWaveform;
