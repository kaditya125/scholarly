/**
 * CinematicAudioRenderer integration tests.
 *
 * Tests the complete rendering pipeline with mocked engines and asset library.
 * Validates:
 *   - Engine coordination
 *   - Progress callbacks
 *   - Graceful degradation
 *   - Validation
 *   - Timing estimation
 *
 * Does NOT test actual TTS synthesis or ffmpeg mixing (integration-test territory).
 */

import {
  CinematicAudioRenderer,
  type RenderOptions,
  type RenderStage,
} from '../../../src/services/media/rendering/CinematicAudioRenderer';
import type { IAssetLibrary } from '../../../src/core/director/interfaces';
import type { MasterTimeline } from '../../../src/core/director/schema/timeline.schema';

// ── Test Doubles ────────────────────────────────────────────────────────────

class FakeAssetLibrary implements IAssetLibrary {
  has(): boolean { return true; }
  validateRefs(): any[] { return []; }
  async resolve(): Promise<any> { return null; }
  async resolveAll(): Promise<Map<string, any>> { return new Map(); }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const mockTimeline = (overrides: Partial<MasterTimeline> = {}): MasterTimeline => ({
  id: 'timeline1',
  podcastId: 'podcast1',
  userId: 'user1',
  schemaVersion: 2,
  phase: 'resolved',
  createdAt: Date.now(),
  meta: {
    title: 'Test Podcast',
    language: 'en',
    genre: 'educational',
    narrativeStyle: 'linear',
    cinematicIntensity: 'balanced',
    estimatedMinutes: 1,
  },
  cast: {
    characters: [
      {
        id: 'char1',
        name: 'Narrator',
        voiceRole: 'Host',
        voiceProvider: 'google-cloud-tts',
        voiceId: 'en-US-Journey-F',
        description: 'Main narrator',
        baseEmotion: 'neutral',
        allowedEmotions: ['neutral', 'curious', 'excited'],
        gender: 'female',
        age: 'adult',
      },
    ],
  },
  emotionCurve: {
    keyframes: [{ atProgress: 0, emotion: 'neutral', intensity: 0.5, sceneId: 'scene1' }],
    arcType: 'steady',
  },
  scenes: [
    {
      id: 'scene1',
      index: 0,
      lineRange: { startLine: 0, endLine: 0 },
      title: 'Introduction',
      setting: 'classroom',
      mood: 'calm',
      pacing: 'steady',
      durationMs: 60_000,
      primaryCharacterId: 'char1',
    },
  ],
  tracks: {
    voice: {
      events: [
        {
          kind: 'voice' as const,
          id: 'v1',
          sceneId: 'scene1',
          startMs: 0,
          durationMs: 5_000,
          priority: 100,
          lineIndex: 0,
          characterId: 'char1',
          text: 'Welcome to this test podcast.',
          emotion: 'neutral',
          delivery: {
            emotion: 'neutral',
            intensity: 0.5,
            speakingRate: 1,
            pitch: 0,
            volumeDb: 0,
            emphasisWords: [],
            whisper: false,
            breathBefore: false,
            prosodyUnsupported: false,
          },
        },
      ],
    },
    music: { events: [] },
    ambience: { events: [] },
    sfx: { events: [] },
    pause: { events: [] },
    visual: { events: [] },
  },
  mastering: {
    targetLufs: -16,
    truePeakDb: -1,
    voiceBusGainDb: 0,
    duckingDb: -12,
    duckAttackMs: 150,
    duckReleaseMs: 400,
    fadeInMs: 500,
    fadeOutMs: 1500,
  },
  totalDurationMs: 60_000,
  degradedAssets: [],
  warnings: [],
  ...overrides,
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('CinematicAudioRenderer', () => {
  describe('validateTimeline', () => {
    it('accepts valid timeline', () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline();

      const errors = renderer.validateTimeline(timeline);

      expect(errors).toHaveLength(0);
    });

    it('rejects timeline without voice events', () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline({
        tracks: {
          ...mockTimeline().tracks,
          voice: { events: [] },
        },
      });

      const errors = renderer.validateTimeline(timeline);

      expect(errors).toContain('Timeline has no voice events');
    });

    it('rejects timeline without scenes', () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline({ scenes: [] });

      const errors = renderer.validateTimeline(timeline);

      expect(errors).toContain('Timeline has no scenes');
    });

    it('rejects timeline with non-positive duration', () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline({ totalDurationMs: 0 });

      const errors = renderer.validateTimeline(timeline);

      expect(errors).toContain('Timeline has non-positive duration');
    });

    it('rejects timeline with out-of-order voice events', () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline({
        tracks: {
          ...mockTimeline().tracks,
          voice: {
            events: [
              { ...mockTimeline().tracks.voice.events[0], lineIndex: 2 },
              { ...mockTimeline().tracks.voice.events[0], lineIndex: 1 },
            ],
          },
        },
      });

      const errors = renderer.validateTimeline(timeline);

      expect(errors.some((e) => e.includes('out of order'))).toBe(true);
    });

    it('rejects timeline with unknown character reference', () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline({
        tracks: {
          ...mockTimeline().tracks,
          voice: {
            events: [
              { ...mockTimeline().tracks.voice.events[0], characterId: 'unknown' },
            ],
          },
        },
      });

      const errors = renderer.validateTimeline(timeline);

      expect(errors.some((e) => e.includes('unknown character'))).toBe(true);
    });
  });

  describe('estimateRenderTimeMs', () => {
    it('estimates based on voice event count', () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline({
        tracks: {
          ...mockTimeline().tracks,
          voice: {
            events: Array(10).fill(mockTimeline().tracks.voice.events[0]),
          },
        },
      });

      const estimate = renderer.estimateRenderTimeMs(timeline);

      // 10 lines * 500ms = 5000ms minimum
      expect(estimate).toBeGreaterThan(5_000);
    });

    it('includes asset resolution time', () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline({
        tracks: {
          ...mockTimeline().tracks,
          music: {
            events: Array(5)
              .fill(null)
              .map((_, i) => ({
                kind: 'music' as const,
                id: `m${i}`,
                sceneId: 'scene1',
                startMs: i * 10_000,
                durationMs: 10_000,
                priority: 30,
                requirement: {
                  kind: 'music' as const,
                  category: 'documentary' as const,
                  durationMs: 10_000,
                },
                assetId: `music${i}`,
                category: 'documentary' as const,
                role: 'bed' as const,
                intensity: 0.5,
                tempo: 'moderate' as const,
                volumeDb: -16,
                loopStrategy: 'seamless' as const,
                fadeInMs: 1500,
                fadeOutMs: 1500,
                crossfadeToNextMs: 2000,
                transitionType: 'crossfade' as const,
              })),
          },
        },
      });

      const estimate = renderer.estimateRenderTimeMs(timeline);

      // Should include asset resolution overhead
      expect(estimate).toBeGreaterThan(10_000);
    });

    it('includes mix time based on total duration', () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline({ totalDurationMs: 120_000 });

      const estimate = renderer.estimateRenderTimeMs(timeline);

      // Should include 2x real-time encoding
      expect(estimate).toBeGreaterThan(240_000);
    });
  });

  describe('render (dry run)', () => {
    it('validates timeline is in resolved phase', async () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline({ phase: 'planned' });

      const result = await renderer.render({
        timeline,
        tempDir: '/tmp/test',
        dryRun: true,
      });

      expect(result.warnings.some((w) => w.includes('resolved'))).toBe(true);
    });

    it('reports progress through all stages', async () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline();

      const stages: RenderStage[] = [];
      const percents: number[] = [];

      await renderer.render({
        timeline,
        tempDir: '/tmp/test',
        dryRun: true,
        onProgress: (stage, pct) => {
          stages.push(stage);
          percents.push(pct);
        },
      });

      // Should visit all stages
      expect(stages).toContain('initializing');
      expect(stages).toContain('warming_assets');
      expect(stages).toContain('synthesizing_voice');
      expect(stages).toContain('resolving_music');
      expect(stages).toContain('resolving_ambience');
      expect(stages).toContain('resolving_sfx');
      expect(stages).toContain('mixing');
      expect(stages).toContain('complete');

      // Progress should end at 100
      expect(percents[percents.length - 1]).toBe(100);
    });

    it('collects stats correctly', async () => {
      const library = new FakeAssetLibrary();
      const renderer = new CinematicAudioRenderer(library);
      const timeline = mockTimeline({
        tracks: {
          ...mockTimeline().tracks,
          voice: {
            events: Array(5).fill(mockTimeline().tracks.voice.events[0]),
          },
        },
      });

      const result = await renderer.render({
        timeline,
        tempDir: '/tmp/test',
        dryRun: true,
      });

      expect(result.stats.voiceCues).toBe(5);
      expect(result.stats.musicCues).toBe(0);
      expect(result.stats.ambienceLayers).toBe(0);
      expect(result.stats.sfxCues).toBe(0);
      expect(result.stats.totalTimeMs).toBeGreaterThan(0);
    });
  });
});
