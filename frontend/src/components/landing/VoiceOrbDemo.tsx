import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import VoiceWaveform from '../chat/VoiceWaveform';
import type { VoiceState } from '../../hooks/useVoiceSession';

/**
 * Landing-page demonstration of voice mode.
 *
 * Renders the REAL VoiceWaveform the product uses, not a mock or a recording. If the visual
 * changes in the app it changes here, so this cannot quietly become a picture of something we no
 * longer ship — which is the usual fate of a hand-built marketing replica.
 *
 * What IS simulated is the audio: it feeds a synthetic spectrum on a scripted turn cycle instead
 * of asking a visitor for their microphone. Nobody should have to grant mic access to see what a
 * feature looks like, and a landing page that requests it on load is one people leave. The
 * caption says so plainly rather than implying a live session is running.
 */

const SPECTRUM_BINS = 128;

/** A turn cycle at a conversational pace, in milliseconds. */
const SCRIPT: Array<{ state: VoiceState; caption: string; ms: number }> = [
  { state: 'LISTENING', caption: 'Listening…', ms: 2600 },
  { state: 'USER_SPEAKING', caption: '“What’s in the SSC CGL quant syllabus?”', ms: 3400 },
  { state: 'AI_SPEAKING', caption: 'Sadhya answers — from the official notice', ms: 5200 },
  { state: 'LISTENING', caption: 'Listening…', ms: 2200 },
];

export const VoiceOrbDemo: React.FC<{ className?: string }> = ({ className }) => {
  const [step, setStep] = useState(0);
  const stateRef = useRef<VoiceState>('LISTENING');
  const startedRef = useRef(performance.now());

  const current = SCRIPT[step % SCRIPT.length];
  stateRef.current = current.state;

  useEffect(() => {
    const id = setTimeout(() => setStep((s) => s + 1), current.ms);
    return () => clearTimeout(id);
  }, [step, current.ms]);

  /*
   * Stands in for the analyser. Shaped like speech rather than like noise: energy concentrated in
   * the low bins, an envelope that rises and falls across a phrase, and enough per-bin variation
   * that the ribbon articulates instead of pulsing as one block.
   */
  const readSpectrum = useCallback((out: Uint8Array): boolean => {
    const speaking = stateRef.current === 'USER_SPEAKING' || stateRef.current === 'AI_SPEAKING';
    if (!speaking) { out.fill(0); return false; }

    const t = (performance.now() - startedRef.current) / 1000;
    // Syllable-rate envelope — roughly four a second, which is ordinary speech.
    const syllable = 0.55 + 0.45 * Math.sin(t * 8.2);
    const phrase = 0.6 + 0.4 * Math.sin(t * 1.1);
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const tilt = Math.exp(-i / 22);                      // voice energy sits low
      const detail = 0.75 + 0.25 * Math.sin(i * 0.7 + t * 5.5);
      out[i] = Math.max(0, Math.min(255, tilt * detail * syllable * phrase * 255));
    }
    return true;
  }, []);

  return (
    /*
      No card. The waveform is transparent and draws with straight alpha, so it sits on the page
      the same way it does in the app — and a border around it only drew attention to the box
      rather than to the shape moving inside it.
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
        <p className="mt-1 text-[12px] text-slate-400 dark:text-slate-500">
          Illustration — no microphone is used on this page
        </p>
      </div>
    </div>
  );
};

export default VoiceOrbDemo;
