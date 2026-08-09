/**
 * filterGraph.ts — builds ffmpeg filter chains for cinematic audio mixing.
 *
 * Constructs the complex filter graph that:
 *   1. Loads voice/music/ambience/sfx as separate input streams
 *   2. Applies per-track volume adjustment
 *   3. Crossfades music cues
 *   4. Loops ambience layers with jitter
 *   5. Sidechains background to voice (automatic ducking)
 *   6. Mixes all tracks
 *   7. Applies mastering (EQ, compression, loudness normalization)
 *
 * Uses ffmpeg's `-filter_complex` syntax, which is DECLARATIVE (you describe
 * WHAT you want, not imperative steps) and SINGLE-PASS (no intermediate files).
 *
 * Why single-pass?
 *   - Preserves quality (no repeated encode/decode)
 *   - Faster for short-form (<20min)
 *   - Enables true sidechain (requires simultaneous bus access)
 *
 * Graph structure:
 *
 *   [voice inputs] → concat → [voicebus]
 *   [music inputs] → volume+crossfade → [musicbus]
 *   [ambience inputs] → volume+loop+jitter → [ambiencebus]
 *   [sfx inputs] → volume → [sfxbus]
 *
 *   [musicbus][ambiencebus][sfxbus] → amix → [background]
 *   [voicebus][background] → sidechaincompress → [ducked]
 *   [voicebus][ducked] → amix → [mixed]
 *   [mixed] → EQ → compressor → loudnorm → [out]
 */

import type { MusicCue } from '../../media/assets/MusicEngine';
import type { AmbienceCue } from './AmbienceEngine';
import type { SFXCue } from './SFXEngine';
import type { MasteringSpec } from '../../../core/director/schema/audio.schema';

export interface FilterGraphInputs {
  /** Voice bus: single stitched file. */
  voicePath: string;
  voiceDurationMs: number;

  music: MusicCue[];
  ambience: AmbienceCue[];
  sfx: SFXCue[];

  mastering: MasteringSpec;
  totalDurationMs: number;
}

export interface FilterGraphResult {
  /** The complete filter_complex string. */
  filterComplex: string;
  /** All input file paths in order (voice, music, ambience, sfx). */
  inputPaths: string[];
  /** Total input count for ffmpeg `-i` flags. */
  inputCount: number;
}

/**
 * Build the complete filter graph for cinematic mixing.
 *
 * Returns the filter_complex string plus the ordered input list.
 */
/**
 * Every stream entering an `amix` must share a sample rate and channel layout.
 * Generated assets are .wav files of assorted rates and channel counts, so each
 * background chain is normalised at its head — omitting this is the second way
 * this graph used to fail with "Invalid argument".
 */
const FMT = 'aformat=sample_rates=48000:channel_layouts=stereo';

export function buildFilterGraph(inputs: FilterGraphInputs): FilterGraphResult {
  const filters: string[] = [];
  const inputPaths: string[] = [];

  // Index 0: voice bus (already stitched)
  inputPaths.push(inputs.voicePath);
  const voiceIdx = 0;

  // Music inputs start at index 1
  const musicStartIdx = inputPaths.length;
  inputs.music.forEach((cue) => inputPaths.push(cue.localPath));

  // Ambience inputs (one per layer, flattened)
  const ambienceStartIdx = inputPaths.length;
  inputs.ambience.forEach((cue) => {
    cue.layers.forEach((layer) => inputPaths.push(layer.localPath));
  });

  // SFX inputs
  const sfxStartIdx = inputPaths.length;
  inputs.sfx.forEach((cue) => inputPaths.push(cue.localPath));

  // ── Voice Bus ────────────────────────────────────────────────────────────
  // Voice is already stitched — normalise it, then SPLIT it.
  //
  // The split is mandatory, not an optimisation: ffmpeg allows each filter
  // output label to be consumed exactly ONCE. The voice bus is needed twice —
  // as the sidechain trigger for ducking, and again in the final mix — and
  // referencing [voicebus] in both places is what produced
  // "Error initializing complex filters: Invalid argument".
  filters.push(`[${voiceIdx}:a]${FMT}[voicenorm]`);
  filters.push(`[voicenorm]asplit=2[voicebus][voicesidechain]`);

  // ── Music Bus ────────────────────────────────────────────────────────────
  let musicBus = 'silentmusic';
  if (inputs.music.length > 0) {
    const musicFilters: string[] = [];

    inputs.music.forEach((cue, i) => {
      const idx = musicStartIdx + i;
      const vol = dbToLinear(cue.volumeDb);

      // Apply volume, loop if needed, trim to duration, add fades
      let chain = `[${idx}:a]${FMT},`;

      // Loop
      if (cue.loopCount > 1) {
        chain += `aloop=loop=${cue.loopCount - 1}:size=2e9,`;
      }

      // Volume
      chain += `volume=${vol},`;

      // Trim to exact duration, then rebase timestamps. Without asetpts the
      // trimmed segment keeps its original PTS and adelay would offset from the
      // wrong origin, scattering cues across the timeline.
      //
      // The `/TB` is REQUIRED. `asetpts=N/SR` produces a PTS in the wrong units
      // for audio — N counts FRAMES, not samples — so timestamps advance roughly
      // 1024x too slowly. Every following `afade=t=in:d=X` then needs 1024*X
      // seconds of audio to finish, leaving the whole cue stuck at the silent
      // start of the fade curve. Measured effect: the background bus rendered at
      // -82 dB (inaudible) instead of -40 dB. See scripts/isolate_mix_attenuation.
      chain += `atrim=0:${cue.durationMs / 1000},asetpts=N/SR/TB,`;

      // Fade in
      if (cue.fadeInMs > 0) {
        chain += `afade=t=in:st=0:d=${cue.fadeInMs / 1000},`;
      }

      // Fade out
      if (cue.fadeOutMs > 0) {
        const fadeStart = Math.max(0, cue.durationMs - cue.fadeOutMs) / 1000;
        chain += `afade=t=out:st=${fadeStart}:d=${cue.fadeOutMs / 1000},`;
      }

      // Delay to absolute start time
      chain += `adelay=${cue.startMs}|${cue.startMs}`;

      // Output label
      chain += `[music${i}]`;
      musicFilters.push(chain);
    });

    // Mix all music cues
    const musicLabels = inputs.music.map((_, i) => `[music${i}]`).join('');
    musicFilters.push(
      `${musicLabels}amix=inputs=${inputs.music.length}:duration=longest:normalize=0[musicbus]`
    );

    filters.push(...musicFilters);
    musicBus = 'musicbus';
  } else {
    // Silent placeholder when no music
    filters.push(
      `anullsrc=r=48000:cl=stereo:d=${inputs.totalDurationMs / 1000}[silentmusic]`
    );
  }

  // ── Ambience Bus ─────────────────────────────────────────────────────────
  let ambienceBus = 'silentambience';
  if (inputs.ambience.length > 0) {
    const ambienceFilters: string[] = [];
    let layerIdx = 0;

    inputs.ambience.forEach((cue) => {
      cue.layers.forEach((layer) => {
        const idx = ambienceStartIdx + layerIdx;
        const vol = dbToLinear(layer.volumeDb);

        let chain = `[${idx}:a]${FMT},`;

        // Loop with jitter (random_offset simulated via adelay with computed offset)
        if (layer.loopCount > 1) {
          chain += `aloop=loop=${layer.loopCount - 1}:size=2e9,`;
        }

        // Volume
        chain += `volume=${vol},`;

        // Trim to duration, then rebase timestamps (see the music bus for why
        // `/TB` is mandatory — without it the fades silence the layer).
        chain += `atrim=0:${layer.durationMs / 1000},asetpts=N/SR/TB,`;

        // Fade in
        if (layer.fadeInMs > 0) {
          chain += `afade=t=in:st=0:d=${layer.fadeInMs / 1000},`;
        }

        // Fade out
        if (layer.fadeOutMs > 0) {
          const fadeStart = Math.max(0, layer.durationMs - layer.fadeOutMs) / 1000;
          chain += `afade=t=out:st=${fadeStart}:d=${layer.fadeOutMs / 1000},`;
        }

        // Jitter: random offset within [0, jitterMs]. Use a pseudo-random offset
        // based on layer index to keep it deterministic across renders.
        const jitterOffset = layer.jitterMs > 0 ? (layerIdx * 317) % layer.jitterMs : 0;

        // Delay to absolute start time + jitter
        const totalDelay = cue.startMs + jitterOffset;
        chain += `adelay=${totalDelay}|${totalDelay}`;

        chain += `[amb${layerIdx}]`;
        ambienceFilters.push(chain);
        layerIdx++;
      });
    });

    // Mix all ambience layers
    const ambLabels = Array.from({ length: layerIdx }, (_, i) => `[amb${i}]`).join('');
    ambienceFilters.push(
      `${ambLabels}amix=inputs=${layerIdx}:duration=longest:normalize=0[ambiencebus]`
    );

    filters.push(...ambienceFilters);
    ambienceBus = 'ambiencebus';
  } else {
    filters.push(
      `anullsrc=r=48000:cl=stereo:d=${inputs.totalDurationMs / 1000}[silentambience]`
    );
  }

  // ── SFX Bus ──────────────────────────────────────────────────────────────
  let sfxBus = 'silentsfx';
  if (inputs.sfx.length > 0) {
    const sfxFilters: string[] = [];

    inputs.sfx.forEach((cue, i) => {
      const idx = sfxStartIdx + i;
      const vol = dbToLinear(cue.volumeDb);

      let chain = `[${idx}:a]${FMT},`;

      // Volume
      chain += `volume=${vol},`;

      // Trim to duration (SFX never loop), then rebase timestamps (`/TB` — see
      // the music bus).
      chain += `atrim=0:${cue.durationMs / 1000},asetpts=N/SR/TB,`;

      // Fade in (typically very short for SFX)
      if (cue.fadeInMs > 0) {
        chain += `afade=t=in:st=0:d=${cue.fadeInMs / 1000},`;
      }

      // Fade out
      if (cue.fadeOutMs > 0) {
        const fadeStart = Math.max(0, cue.durationMs - cue.fadeOutMs) / 1000;
        chain += `afade=t=out:st=${fadeStart}:d=${cue.fadeOutMs / 1000},`;
      }

      // Delay to absolute start time
      chain += `adelay=${cue.startMs}|${cue.startMs}`;

      chain += `[sfx${i}]`;
      sfxFilters.push(chain);
    });

    // Mix all SFX
    const sfxLabels = inputs.sfx.map((_, i) => `[sfx${i}]`).join('');
    sfxFilters.push(
      `${sfxLabels}amix=inputs=${inputs.sfx.length}:duration=longest:normalize=0[sfxbus]`
    );

    filters.push(...sfxFilters);
    sfxBus = 'sfxbus';
  } else {
    filters.push(`anullsrc=r=48000:cl=stereo:d=${inputs.totalDurationMs / 1000}[silentsfx]`);
  }

  // ── Background Mix (music + ambience + sfx) ──────────────────────────────
  filters.push(
    `[${musicBus}][${ambienceBus}][${sfxBus}]amix=inputs=3:duration=longest:normalize=0[background]`
  );

  // ── Sidechain Ducking ────────────────────────────────────────────────────
  // Voice triggers automatic gain reduction on background.
  const duckDb = inputs.mastering.duckingDb;
  // Approximate ratio for the target reduction, clamped to sidechaincompress's
  // accepted range. The raw formula divides by zero at -40dB and goes negative
  // beyond it, which ffmpeg rejects outright.
  const rawRatio = 1 / (1 - Math.min(Math.abs(duckDb), 36) / 40);
  const duckRatio = Math.min(20, Math.max(1, rawRatio));
  const attackMs = inputs.mastering.duckAttackMs;
  const releaseMs = inputs.mastering.duckReleaseMs;

  filters.push(
    `[background][voicesidechain]sidechaincompress=` +
      `threshold=0.01:` +
      `ratio=${duckRatio.toFixed(1)}:` +
      `attack=${attackMs}:` +
      `release=${releaseMs}:` +
      `makeup=1[duckedbackground]`
  );

  // ── Final Mix (voice + ducked background) ────────────────────────────────
  const voiceGain = dbToLinear(inputs.mastering.voiceBusGainDb);
  filters.push(`[voicebus]volume=${voiceGain}[voicegain]`);
  filters.push(
    `[voicegain][duckedbackground]amix=inputs=2:duration=longest:normalize=0[premix]`
  );

  // ── Mastering ────────────────────────────────────────────────────────────
  let masterChain = '[premix]';

  // High-pass filter (remove rumble)
  if (inputs.mastering.eq?.highPassHz) {
    masterChain += `highpass=f=${inputs.mastering.eq.highPassHz},`;
  }

  // Presence boost (enhance voice clarity)
  if (inputs.mastering.eq?.presenceBoostDb) {
    const boost = inputs.mastering.eq.presenceBoostDb;
    masterChain += `equalizer=f=3000:width_type=h:width=2000:g=${boost},`;
  }

  // Compression (dynamic range control)
  if (inputs.mastering.compression) {
    const { threshold, ratio } = inputs.mastering.compression;
    masterChain += `acompressor=threshold=${threshold}dB:ratio=${ratio}:attack=5:release=50,`;
  }

  // Fade in/out
  const fadeInSec = inputs.mastering.fadeInMs / 1000;
  const fadeOutSec = inputs.mastering.fadeOutMs / 1000;
  const fadeOutStart = Math.max(0, inputs.totalDurationMs / 1000 - fadeOutSec);

  masterChain += `afade=t=in:st=0:d=${fadeInSec},`;
  masterChain += `afade=t=out:st=${fadeOutStart}:d=${fadeOutSec},`;

  // Loudness normalization (EBU R128 two-pass)
  // Note: ffmpeg's loudnorm requires two passes for accurate measurement.
  // For MVP, we use single-pass with target LUFS. Production should implement
  // two-pass: first pass measures, second pass normalizes to exact target.
  const targetLufs = inputs.mastering.targetLufs;
  const truePeak = inputs.mastering.truePeakDb;

  masterChain += `loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=11`;

  masterChain += '[out]';
  filters.push(masterChain);

  return {
    filterComplex: filters.join(';'),
    inputPaths,
    inputCount: inputPaths.length,
  };
}

/** Convert dB to linear amplitude for ffmpeg volume filter. */
function dbToLinear(db: number): number {
  return Math.round(Math.pow(10, db / 20) * 10_000) / 10_000;
}

/**
 * Validate filter graph inputs before construction.
 * Returns error messages if inputs are invalid.
 */
export function validateFilterInputs(inputs: FilterGraphInputs): string[] {
  const errors: string[] = [];

  if (!inputs.voicePath || inputs.voiceDurationMs <= 0) {
    errors.push('Voice bus is required and must have positive duration');
  }

  if (inputs.totalDurationMs <= 0) {
    errors.push('Total duration must be positive');
  }

  // Check music cues
  inputs.music.forEach((cue, i) => {
    if (!cue.localPath) errors.push(`Music cue ${i}: missing local path`);
    if (cue.durationMs < 0) errors.push(`Music cue ${i}: negative duration`);
    if (cue.startMs < 0) errors.push(`Music cue ${i}: negative start time`);
  });

  // Check ambience layers
  inputs.ambience.forEach((cue, i) => {
    cue.layers.forEach((layer, j) => {
      if (!layer.localPath) {
        errors.push(`Ambience cue ${i} layer ${j}: missing local path`);
      }
      if (layer.durationMs < 0) {
        errors.push(`Ambience cue ${i} layer ${j}: negative duration`);
      }
    });
  });

  // Check SFX cues
  inputs.sfx.forEach((cue, i) => {
    if (!cue.localPath) errors.push(`SFX cue ${i}: missing local path`);
    if (cue.durationMs < 0) errors.push(`SFX cue ${i}: negative duration`);
    if (cue.startMs < 0) errors.push(`SFX cue ${i}: negative start time`);
  });

  return errors;
}
