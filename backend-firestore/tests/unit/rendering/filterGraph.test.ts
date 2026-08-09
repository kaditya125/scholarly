/**
 * filterGraph.ts tests — validates ffmpeg filter graph construction.
 *
 * Tests the filter graph builder WITHOUT executing ffmpeg. Validates:
 *   - Input ordering (voice, music, ambience, sfx)
 *   - Filter syntax (volume, loop, delay, fades, crossfades)
 *   - Sidechain ducking configuration
 *   - Mastering chain (EQ, compression, loudness)
 *   - Validation (missing inputs, negative durations, etc.)
 *
 * Does NOT test actual audio rendering — that's integration-test territory.
 */

import {
  buildFilterGraph,
  validateFilterInputs,
  type FilterGraphInputs,
} from '../../../src/services/media/rendering/filterGraph';
import type { MusicCue } from '../../../src/services/media/assets/MusicEngine';
import type { AmbienceCue } from '../../../src/services/media/rendering/AmbienceEngine';
import type { SFXCue } from '../../../src/services/media/rendering/SFXEngine';
import type { MasteringSpec } from '../../../src/core/director/schema/audio.schema';

// ── Fixtures ────────────────────────────────────────────────────────────────

const mockMastering = (overrides: Partial<MasteringSpec> = {}): MasteringSpec => ({
  targetLufs: -16,
  truePeakDb: -1,
  voiceBusGainDb: 0,
  duckingDb: -12,
  duckAttackMs: 150,
  duckReleaseMs: 400,
  fadeInMs: 500,
  fadeOutMs: 1500,
  ...overrides,
});

const mockMusicCue = (overrides: Partial<MusicCue> = {}): MusicCue => ({
  eventId: 'music1',
  role: 'bed' as const,
  assetId: 'music-asset',
  localPath: '/tmp/music.mp3',
  startMs: 0,
  durationMs: 60_000,
  assetDurationMs: 60_000,
  loopCount: 1,
  truncated: false,
  volumeDb: -16,
  fadeInMs: 1500,
  fadeOutMs: 1500,
  crossfadeToNextMs: 0,
  category: 'documentary' as const,
  intensity: 0.5,
  ...overrides,
});

const mockAmbienceCue = (overrides: Partial<AmbienceCue> = {}): AmbienceCue => ({
  eventId: 'amb1',
  environmentId: 'forest',
  layers: [
    {
      layerId: 'layer1',
      layerRole: 'base' as const,
      assetId: 'amb-asset',
      localPath: '/tmp/ambience.mp3',
      durationMs: 60_000,
      assetDurationMs: 10_000,
      loopCount: 6,
      volumeDb: -24,
      fadeInMs: 2000,
      fadeOutMs: 2000,
      loopBehavior: 'random_offset' as const,
      jitterMs: 2000,
    },
  ],
  startMs: 0,
  durationMs: 60_000,
  ...overrides,
});

const mockSFXCue = (overrides: Partial<SFXCue> = {}): SFXCue => ({
  eventId: 'sfx1',
  assetId: 'sfx-asset',
  localPath: '/tmp/sfx.mp3',
  effectCategory: 'door' as const,
  startMs: 5_000,
  durationMs: 1_000,
  assetDurationMs: 1_000,
  volumeDb: -10,
  fadeInMs: 0,
  fadeOutMs: 120,
  syncMode: 'after_line' as const,
  ...overrides,
});

const mockInputs = (overrides: Partial<FilterGraphInputs> = {}): FilterGraphInputs => ({
  voicePath: '/tmp/voice.mp3',
  voiceDurationMs: 60_000,
  music: [],
  ambience: [],
  sfx: [],
  mastering: mockMastering(),
  totalDurationMs: 60_000,
  ...overrides,
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('filterGraph', () => {
  describe('buildFilterGraph', () => {
    it('builds minimal graph with voice only', () => {
      const inputs = mockInputs();
      const graph = buildFilterGraph(inputs);

      expect(graph.inputPaths).toEqual(['/tmp/voice.mp3']);
      expect(graph.inputCount).toBe(1);
      expect(graph.filterComplex).toContain('[voicebus]');
      expect(graph.filterComplex).toContain('[out]');
    });

    it('orders inputs correctly: voice, music, ambience, sfx', () => {
      const inputs = mockInputs({
        music: [mockMusicCue({ localPath: '/tmp/music1.mp3' })],
        ambience: [
          mockAmbienceCue({
            layers: [
              { ...mockAmbienceCue().layers[0], localPath: '/tmp/amb1.mp3' },
              { ...mockAmbienceCue().layers[0], localPath: '/tmp/amb2.mp3' },
            ],
          }),
        ],
        sfx: [mockSFXCue({ localPath: '/tmp/sfx1.mp3' })],
      });

      const graph = buildFilterGraph(inputs);

      expect(graph.inputPaths).toEqual([
        '/tmp/voice.mp3', // index 0
        '/tmp/music1.mp3', // index 1
        '/tmp/amb1.mp3', // index 2
        '/tmp/amb2.mp3', // index 3
        '/tmp/sfx1.mp3', // index 4
      ]);
      expect(graph.inputCount).toBe(5);
    });

    it('applies volume adjustments', () => {
      const inputs = mockInputs({
        music: [mockMusicCue({ volumeDb: -16 })],
      });

      const graph = buildFilterGraph(inputs);

      // -16dB = ~0.1585 linear
      expect(graph.filterComplex).toMatch(/volume=0\.\d+/);
    });

    it('applies looping for music cues', () => {
      const inputs = mockInputs({
        music: [mockMusicCue({ loopCount: 3 })],
      });

      const graph = buildFilterGraph(inputs);

      expect(graph.filterComplex).toContain('aloop=loop=2'); // loopCount-1
    });

    it('applies delay for start times', () => {
      const inputs = mockInputs({
        music: [mockMusicCue({ startMs: 5000 })],
      });

      const graph = buildFilterGraph(inputs);

      expect(graph.filterComplex).toContain('adelay=5000|5000');
    });

    it('applies fades to music cues', () => {
      const inputs = mockInputs({
        music: [mockMusicCue({ fadeInMs: 2000, fadeOutMs: 3000, durationMs: 10_000 })],
      });

      const graph = buildFilterGraph(inputs);

      expect(graph.filterComplex).toContain('afade=t=in:st=0:d=2');
      expect(graph.filterComplex).toMatch(/afade=t=out:st=\d+(\.\d+)?:d=3/);
    });

    it('includes sidechain compression for ducking', () => {
      const inputs = mockInputs({
        mastering: mockMastering({
          duckingDb: -12,
          duckAttackMs: 150,
          duckReleaseMs: 400,
        }),
      });

      const graph = buildFilterGraph(inputs);

      expect(graph.filterComplex).toContain('sidechaincompress');
      expect(graph.filterComplex).toContain('attack=150');
      expect(graph.filterComplex).toContain('release=400');
    });

    it('applies mastering chain', () => {
      const inputs = mockInputs({
        mastering: mockMastering({
          targetLufs: -16,
          truePeakDb: -1,
        }),
      });

      const graph = buildFilterGraph(inputs);

      expect(graph.filterComplex).toContain('loudnorm=I=-16:TP=-1');
    });

    it('applies high-pass filter when configured', () => {
      const inputs = mockInputs({
        mastering: mockMastering({
          eq: { highPassHz: 80 },
        }),
      });

      const graph = buildFilterGraph(inputs);

      expect(graph.filterComplex).toContain('highpass=f=80');
    });

    it('applies presence boost when configured', () => {
      const inputs = mockInputs({
        mastering: mockMastering({
          eq: { presenceBoostDb: 2 },
        }),
      });

      const graph = buildFilterGraph(inputs);

      expect(graph.filterComplex).toContain('equalizer=f=3000');
      expect(graph.filterComplex).toContain('g=2');
    });

    it('applies compression when configured', () => {
      const inputs = mockInputs({
        mastering: mockMastering({
          compression: { threshold: -20, ratio: 4 },
        }),
      });

      const graph = buildFilterGraph(inputs);

      expect(graph.filterComplex).toContain('acompressor');
      expect(graph.filterComplex).toContain('threshold=-20dB');
      expect(graph.filterComplex).toContain('ratio=4');
    });

    it('creates silent buses for missing tracks', () => {
      const inputs = mockInputs(); // No music, ambience, or sfx

      const graph = buildFilterGraph(inputs);

      expect(graph.filterComplex).toContain('anullsrc'); // Silent placeholders
      expect(graph.filterComplex).toContain('[silentmusic]');
      expect(graph.filterComplex).toContain('[silentambience]');
      expect(graph.filterComplex).toContain('[silentsfx]');
    });

    it('handles multiple music cues with mixing', () => {
      const inputs = mockInputs({
        music: [
          mockMusicCue({ eventId: 'm1', localPath: '/tmp/m1.mp3' }),
          mockMusicCue({ eventId: 'm2', localPath: '/tmp/m2.mp3' }),
        ],
      });

      const graph = buildFilterGraph(inputs);

      expect(graph.filterComplex).toContain('[music0]');
      expect(graph.filterComplex).toContain('[music1]');
      expect(graph.filterComplex).toContain('amix=inputs=2');
    });

    it('handles multiple ambience layers with mixing', () => {
      const inputs = mockInputs({
        ambience: [
          mockAmbienceCue({
            layers: [
              { ...mockAmbienceCue().layers[0], localPath: '/tmp/amb1.mp3' },
              { ...mockAmbienceCue().layers[0], localPath: '/tmp/amb2.mp3' },
            ],
          }),
        ],
      });

      const graph = buildFilterGraph(inputs);

      expect(graph.filterComplex).toContain('[amb0]');
      expect(graph.filterComplex).toContain('[amb1]');
      expect(graph.filterComplex).toContain('amix=inputs=2');
    });

    it('applies jitter offset to ambience layers', () => {
      const inputs = mockInputs({
        ambience: [
          mockAmbienceCue({
            startMs: 0,
            layers: [
              { ...mockAmbienceCue().layers[0], jitterMs: 2000 },
            ],
          }),
        ],
      });

      const graph = buildFilterGraph(inputs);

      // Jitter should be added to delay (deterministic based on layer index)
      expect(graph.filterComplex).toMatch(/adelay=\d+\|\d+/);
    });
  });

  describe('validateFilterInputs', () => {
    it('validates voice bus presence', () => {
      const inputs = mockInputs({ voicePath: '' });
      const errors = validateFilterInputs(inputs);

      expect(errors).toContain('Voice bus is required and must have positive duration');
    });

    it('validates positive voice duration', () => {
      const inputs = mockInputs({ voiceDurationMs: 0 });
      const errors = validateFilterInputs(inputs);

      expect(errors).toContain('Voice bus is required and must have positive duration');
    });

    it('validates positive total duration', () => {
      const inputs = mockInputs({ totalDurationMs: -1 });
      const errors = validateFilterInputs(inputs);

      expect(errors).toContain('Total duration must be positive');
    });

    it('validates music cue paths', () => {
      const inputs = mockInputs({
        music: [mockMusicCue({ localPath: '' })],
      });
      const errors = validateFilterInputs(inputs);

      expect(errors.some((e) => e.includes('missing local path'))).toBe(true);
    });

    it('validates music cue durations', () => {
      const inputs = mockInputs({
        music: [mockMusicCue({ durationMs: -1 })],
      });
      const errors = validateFilterInputs(inputs);

      expect(errors.some((e) => e.includes('negative duration'))).toBe(true);
    });

    it('validates ambience layer paths', () => {
      const inputs = mockInputs({
        ambience: [
          mockAmbienceCue({
            layers: [{ ...mockAmbienceCue().layers[0], localPath: '' }],
          }),
        ],
      });
      const errors = validateFilterInputs(inputs);

      expect(errors.some((e) => e.includes('missing local path'))).toBe(true);
    });

    it('validates SFX cue paths', () => {
      const inputs = mockInputs({
        sfx: [mockSFXCue({ localPath: '' })],
      });
      const errors = validateFilterInputs(inputs);

      expect(errors.some((e) => e.includes('missing local path'))).toBe(true);
    });

    it('returns empty array for valid inputs', () => {
      const inputs = mockInputs({
        music: [mockMusicCue()],
        ambience: [mockAmbienceCue()],
        sfx: [mockSFXCue()],
      });
      const errors = validateFilterInputs(inputs);

      expect(errors).toHaveLength(0);
    });
  });
});

// ── Regression: the silent-background bug ───────────────────────────────────
//
// `asetpts=N/SR` (without `/TB`) produces audio timestamps in the wrong units —
// N counts FRAMES, not samples — so PTS advances roughly 1024x too slowly. Every
// following `afade=t=in:d=X` then needs 1024*X seconds of audio to complete, so
// each cue stays pinned to the silent start of its fade curve.
//
// Measured on a real episode: the background bus rendered at -82 dB (inaudible)
// instead of -20 dB. ffmpeg exits 0 and the mixer logs "Mix complete", so nothing
// upstream catches it — only a level measurement or a listener does. Hence a test
// on the emitted filter string.
describe('asetpts units (silent-background regression)', () => {
  const everyTrack = () =>
    buildFilterGraph(
      mockInputs({
        music: [mockMusicCue()],
        ambience: [mockAmbienceCue()],
        sfx: [mockSFXCue()],
      })
    ).filterComplex;

  it('rebases audio timestamps with /TB on every track', () => {
    const graph = everyTrack();
    // music, ambience layer, sfx
    const matches = graph.match(/asetpts=N\/SR\/TB/g) || [];
    expect(matches).toHaveLength(3);
  });

  it('never emits a bare asetpts=N/SR', () => {
    const graph = everyTrack();
    // Must not appear followed by a delimiter rather than `/TB`.
    expect(graph).not.toMatch(/asetpts=N\/SR[,;\][]/);
    expect(graph).not.toMatch(/asetpts=N\/SR$/);
  });

  it('still places a fade-in after the timestamp rebase on each track', () => {
    const graph = everyTrack();
    // The ordering is what made the bug possible, so assert it stays intentional:
    // a rebase must always be followed by correctly-scaled fades, never bare.
    for (const segment of graph.split(';')) {
      if (!segment.includes('afade=t=in')) continue;
      if (!segment.includes('asetpts')) continue;
      expect(segment).toContain('asetpts=N/SR/TB');
    }
  });
});
