/**
 * SFXEngine geometry and resolution tests.
 *
 * Tests the pure geometry functions (buildSFXCue) and the resolution pipeline
 * (prepare). Validates single-shot behavior (no looping), duration truncation,
 * and graceful degradation.
 */

import {
  SFXEngine,
  buildSFXCue,
} from '../../../src/services/media/rendering/SFXEngine';
import type { IAssetLibrary, ResolvedAsset } from '../../../src/core/director/interfaces';
import type { MasterTimeline } from '../../../src/core/director/schema/timeline.schema';
import type { SFXEvent } from '../../../src/core/director/schema/audio.schema';

// ── Test Doubles ────────────────────────────────────────────────────────────

class FakeAssetLibrary implements IAssetLibrary {
  private assets = new Map<string, ResolvedAsset>();

  addAsset(id: string, asset: ResolvedAsset) {
    this.assets.set(id, asset);
  }

  has(): boolean { return false; }
  validateRefs(): any[] { return []; }

  async resolve(_kind: string, id: string): Promise<ResolvedAsset | null> {
    return this.assets.get(id) || null;
  }

  async resolveAll(): Promise<Map<string, ResolvedAsset>> {
    return new Map();
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const mockAsset = (overrides: Partial<ResolvedAsset> = {}): ResolvedAsset => ({
  id: 'test-sfx',
  kind: 'sfx',
  localPath: '/tmp/test.mp3',
  durationMs: 2_000,
  loopable: false,
  licence: 'CC0',
  ...overrides,
});

const mockEvent = (overrides: Partial<SFXEvent> = {}): SFXEvent => ({
  kind: 'sfx' as const,
  id: 'sfx1',
  sceneId: 'scene1',
  startMs: 5_000,
  durationMs: 2_000,
  priority: 50,
  requirement: {
    kind: 'sfx' as const,
    tags: ['door', 'close'],
    durationMs: 2_000,
  },
  assetId: 'test-sfx',
  effectCategory: 'door' as const,
  syncMode: 'after_line' as const,
  offsetMs: 0,
  volumeDb: -10,
  fadeInMs: 0,
  fadeOutMs: 120,
  ...overrides,
});

const mockTimeline = (events: SFXEvent[]): MasterTimeline =>
  ({
    tracks: {
      sfx: { events },
    },
    podcastId: 'test-podcast',
  } as any);

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SFXEngine', () => {
  describe('buildSFXCue (geometry)', () => {
    it('sets duration to asset length when asset is shorter', () => {
      const event = mockEvent({ durationMs: 5_000 });
      const asset = mockAsset({ durationMs: 2_000 });

      const cue = buildSFXCue(event, asset);

      expect(cue.durationMs).toBe(2_000); // Uses asset duration
      expect(cue.assetDurationMs).toBe(2_000);
    });

    it('truncates to slot duration when asset is longer', () => {
      const event = mockEvent({ durationMs: 1_000 });
      const asset = mockAsset({ durationMs: 2_000 });

      const cue = buildSFXCue(event, asset);

      expect(cue.durationMs).toBe(1_000); // Truncated to slot
      expect(cue.assetDurationMs).toBe(2_000);
    });

    it('never loops (SFX are one-shot)', () => {
      const event = mockEvent({ durationMs: 10_000 });
      const asset = mockAsset({ durationMs: 2_000 });

      const cue = buildSFXCue(event, asset);

      // Should use asset duration, not loop to fill 10s
      expect(cue.durationMs).toBe(2_000);
    });

    it('constrains fades to playback duration', () => {
      const event = mockEvent({
        durationMs: 1_000,
        fadeInMs: 800,
        fadeOutMs: 800,
      });
      const asset = mockAsset({ durationMs: 1_000 });

      const cue = buildSFXCue(event, asset);

      // Max fade = duration / 2 = 500ms
      expect(cue.fadeInMs).toBe(500);
      expect(cue.fadeOutMs).toBe(500);
    });

    it('preserves metadata from event', () => {
      const event = mockEvent({
        effectCategory: 'explosion' as const,
        triggerWord: 'bang',
        triggerLineIndex: 42,
        syncMode: 'on_word' as const,
        volumeDb: -8,
      });
      const asset = mockAsset({ id: 'explosion-large' });

      const cue = buildSFXCue(event, asset);

      expect(cue.effectCategory).toBe('explosion');
      expect(cue.triggerWord).toBe('bang');
      expect(cue.triggerLineIndex).toBe(42);
      expect(cue.syncMode).toBe('on_word');
      expect(cue.volumeDb).toBe(-8);
      expect(cue.assetId).toBe('explosion-large');
    });

    it('copies start time correctly', () => {
      const event = mockEvent({ startMs: 12_345 });
      const asset = mockAsset();

      const cue = buildSFXCue(event, asset);

      expect(cue.startMs).toBe(12_345);
    });
  });

  describe('prepare (resolution pipeline)', () => {
    it('resolves all SFX in parallel', async () => {
      const library = new FakeAssetLibrary();
      library.addAsset('sfx1', mockAsset({ id: 'sfx1' }));
      library.addAsset('sfx2', mockAsset({ id: 'sfx2' }));
      library.addAsset('sfx3', mockAsset({ id: 'sfx3' }));

      const events = [
        mockEvent({ id: 'e1', assetId: 'sfx1' }),
        mockEvent({ id: 'e2', assetId: 'sfx2' }),
        mockEvent({ id: 'e3', assetId: 'sfx3' }),
      ];

      const engine = new SFXEngine(library);
      const result = await engine.prepare(mockTimeline(events));

      expect(result.cues).toHaveLength(3);
      expect(result.totalEffects).toBe(3);
      expect(result.skipped).toHaveLength(0);
    });

    it('skips effects with unresolved assets', async () => {
      const library = new FakeAssetLibrary();
      library.addAsset('sfx1', mockAsset({ id: 'sfx1' }));
      // sfx2 missing

      const events = [
        mockEvent({ id: 'e1', assetId: 'sfx1' }),
        mockEvent({ id: 'e2', assetId: 'sfx2' }),
      ];

      const engine = new SFXEngine(library);
      const result = await engine.prepare(mockTimeline(events));

      expect(result.cues).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].assetId).toBe('sfx2');
    });

    it('skips effects awaiting asset resolver', async () => {
      const library = new FakeAssetLibrary();

      const events = [mockEvent({ assetId: undefined })];

      const engine = new SFXEngine(library);
      const result = await engine.prepare(mockTimeline(events));

      expect(result.cues).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('awaiting asset resolver');
    });

    it('handles empty timeline gracefully', async () => {
      const library = new FakeAssetLibrary();
      const engine = new SFXEngine(library);

      const result = await engine.prepare(mockTimeline([]));

      expect(result.cues).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
      expect(result.totalEffects).toBe(0);
    });

    it('sorts events by start time', async () => {
      const library = new FakeAssetLibrary();
      library.addAsset('sfx', mockAsset());

      const events = [
        mockEvent({ id: 'e3', startMs: 30_000, assetId: 'sfx' }),
        mockEvent({ id: 'e1', startMs: 10_000, assetId: 'sfx' }),
        mockEvent({ id: 'e2', startMs: 20_000, assetId: 'sfx' }),
      ];

      const engine = new SFXEngine(library);
      const result = await engine.prepare(mockTimeline(events));

      expect(result.cues).toHaveLength(3);
      expect(result.cues[0].eventId).toBe('e1');
      expect(result.cues[1].eventId).toBe('e2');
      expect(result.cues[2].eventId).toBe('e3');
    });

    it('deduplicates asset resolution', async () => {
      const library = new FakeAssetLibrary();
      const resolveSpy = jest.spyOn(library, 'resolve');
      library.addAsset('shared-sfx', mockAsset({ id: 'shared-sfx' }));

      const events = [
        mockEvent({ id: 'e1', assetId: 'shared-sfx' }),
        mockEvent({ id: 'e2', assetId: 'shared-sfx' }),
        mockEvent({ id: 'e3', assetId: 'shared-sfx' }),
      ];

      const engine = new SFXEngine(library);
      await engine.prepare(mockTimeline(events));

      // Should only resolve once per unique asset ID
      expect(resolveSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('requiredAssetIds', () => {
    it('extracts all distinct SFX asset IDs', () => {
      const timeline = mockTimeline([
        mockEvent({ assetId: 'sfx1' }),
        mockEvent({ assetId: 'sfx2' }),
        mockEvent({ assetId: 'sfx2' }), // duplicate
        mockEvent({ assetId: 'sfx3' }),
      ]);

      const engine = new SFXEngine(new FakeAssetLibrary());
      const ids = engine.requiredAssetIds(timeline);

      expect(ids).toHaveLength(3);
      expect(ids).toContain('sfx1');
      expect(ids).toContain('sfx2');
      expect(ids).toContain('sfx3');
    });

    it('handles empty timeline', () => {
      const engine = new SFXEngine(new FakeAssetLibrary());
      const ids = engine.requiredAssetIds(mockTimeline([]));

      expect(ids).toHaveLength(0);
    });
  });
});
