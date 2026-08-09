/**
 * AmbienceEngine geometry and resolution tests.
 *
 * Tests the pure geometry functions (buildLayerCue) and the resolution
 * pipeline (prepare). Validates looping behavior, jitter calculation, and
 * graceful degradation when assets are missing.
 */

import {
  AmbienceEngine,
  buildLayerCue,
  type AmbienceLayerCue,
} from '../../../src/services/media/rendering/AmbienceEngine';
import type { IAssetLibrary, ResolvedAsset } from '../../../src/core/director/interfaces';
import type { MasterTimeline } from '../../../src/core/director/schema/timeline.schema';
import type { AmbienceEvent, AmbienceLayer } from '../../../src/core/director/schema/audio.schema';

// ── Test Doubles ────────────────────────────────────────────────────────────

class FakeAssetLibrary implements IAssetLibrary {
  private assets = new Map<string, ResolvedAsset>();

  addAsset(id: string, asset: ResolvedAsset) {
    this.assets.set(id, asset);
  }

  has(_kind: string, _id: string): boolean {
    return false;
  }

  validateRefs(): any[] {
    return [];
  }

  async resolve(_kind: string, id: string): Promise<ResolvedAsset | null> {
    return this.assets.get(id) || null;
  }

  async resolveAll(): Promise<Map<string, ResolvedAsset>> {
    return new Map();
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const mockAsset = (overrides: Partial<ResolvedAsset> = {}): ResolvedAsset => ({
  id: 'test-asset',
  kind: 'ambience',
  localPath: '/tmp/test.mp3',
  durationMs: 10_000,
  loopable: true,
  licence: 'CC0',
  ...overrides,
});

const mockLayer = (overrides: Partial<AmbienceLayer> = {}): AmbienceLayer => ({
  requirement: {
    kind: 'ambience' as const,
    tags: ['forest'],
    durationMs: 60_000,
  },
  assetId: 'test-asset',
  layerRole: 'base' as const,
  volumeDb: -24,
  fadeInMs: 2000,
  fadeOutMs: 2000,
  loopBehavior: 'random_offset' as const,
  ...overrides,
});

const mockEvent = (overrides: Partial<AmbienceEvent> = {}): AmbienceEvent => ({
  kind: 'ambience' as const,
  id: 'amb1',
  sceneId: 'scene1',
  startMs: 0,
  durationMs: 60_000,
  priority: 30,
  environmentId: 'forest',
  layers: [mockLayer()],
  ...overrides,
});

const mockTimeline = (events: AmbienceEvent[]): MasterTimeline =>
  ({
    tracks: {
      ambience: { events },
    },
    podcastId: 'test-podcast',
  } as any);

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AmbienceEngine', () => {
  describe('buildLayerCue (geometry)', () => {
    it('calculates loop count correctly for short asset', () => {
      const event = mockEvent({ durationMs: 60_000 });
      const layer = mockLayer();
      const asset = mockAsset({ durationMs: 10_000 });

      const cue = buildLayerCue(event, layer, 'layer1', asset);

      expect(cue.loopCount).toBe(6); // 60s / 10s = 6
      expect(cue.durationMs).toBe(60_000);
    });

    it('sets loopCount=1 when asset is longer than needed', () => {
      const event = mockEvent({ durationMs: 5_000 });
      const layer = mockLayer();
      const asset = mockAsset({ durationMs: 10_000 });

      const cue = buildLayerCue(event, layer, 'layer1', asset);

      expect(cue.loopCount).toBe(1);
    });

    it('calculates default jitter as 20% of asset duration, capped at 5s', () => {
      const event = mockEvent();
      const layer = mockLayer({ jitterMs: undefined });

      // Short asset: 10s → 2s jitter
      const asset1 = mockAsset({ durationMs: 10_000 });
      const cue1 = buildLayerCue(event, layer, 'layer1', asset1);
      expect(cue1.jitterMs).toBe(2_000);

      // Long asset: 50s → 5s jitter (capped)
      const asset2 = mockAsset({ durationMs: 50_000 });
      const cue2 = buildLayerCue(event, layer, 'layer2', asset2);
      expect(cue2.jitterMs).toBe(5_000);
    });

    it('respects explicit jitter value', () => {
      const event = mockEvent();
      const layer = mockLayer({ jitterMs: 3000 });
      const asset = mockAsset();

      const cue = buildLayerCue(event, layer, 'layer1', asset);

      expect(cue.jitterMs).toBe(3000);
    });

    it('constrains fade durations to available audio', () => {
      const event = mockEvent({ durationMs: 10_000 });
      const layer = mockLayer({ fadeInMs: 8000, fadeOutMs: 8000 });
      const asset = mockAsset({ durationMs: 10_000 });

      const cue = buildLayerCue(event, layer, 'layer1', asset);

      // Max fade = duration / 2 = 5000ms
      expect(cue.fadeInMs).toBe(5_000);
      expect(cue.fadeOutMs).toBe(5_000);
    });

    it('copies layer metadata correctly', () => {
      const event = mockEvent();
      const layer = mockLayer({
        layerRole: 'texture' as const,
        volumeDb: -18,
        loopBehavior: 'seamless' as const,
      });
      const asset = mockAsset({ id: 'forest-texture' });

      const cue = buildLayerCue(event, layer, 'layer1', asset);

      expect(cue.layerRole).toBe('texture');
      expect(cue.volumeDb).toBe(-18);
      expect(cue.loopBehavior).toBe('seamless');
      expect(cue.assetId).toBe('forest-texture');
    });
  });

  describe('prepare (resolution pipeline)', () => {
    it('resolves all layers in parallel', async () => {
      const library = new FakeAssetLibrary();
      library.addAsset('asset1', mockAsset({ id: 'asset1' }));
      library.addAsset('asset2', mockAsset({ id: 'asset2' }));

      const event = mockEvent({
        layers: [
          mockLayer({ assetId: 'asset1' }),
          mockLayer({ assetId: 'asset2' }),
        ],
      });

      const engine = new AmbienceEngine(library);
      const result = await engine.prepare(mockTimeline([event]));

      expect(result.cues).toHaveLength(1);
      expect(result.cues[0].layers).toHaveLength(2);
      expect(result.totalLayers).toBe(2);
      expect(result.skipped).toHaveLength(0);
    });

    it('skips layers with unresolved assets', async () => {
      const library = new FakeAssetLibrary();
      library.addAsset('asset1', mockAsset({ id: 'asset1' }));
      // asset2 missing

      const event = mockEvent({
        layers: [
          mockLayer({ assetId: 'asset1' }),
          mockLayer({ assetId: 'asset2' }),
        ],
      });

      const engine = new AmbienceEngine(library);
      const result = await engine.prepare(mockTimeline([event]));

      expect(result.cues).toHaveLength(1);
      expect(result.cues[0].layers).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].assetId).toBe('asset2');
    });

    it('skips layers awaiting asset resolver', async () => {
      const library = new FakeAssetLibrary();

      const event = mockEvent({
        layers: [mockLayer({ assetId: undefined })],
      });

      const engine = new AmbienceEngine(library);
      const result = await engine.prepare(mockTimeline([event]));

      expect(result.cues).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('awaiting asset resolver');
    });

    it('drops entire event when all layers unresolved', async () => {
      const library = new FakeAssetLibrary();

      const event = mockEvent({
        layers: [
          mockLayer({ assetId: 'missing1' }),
          mockLayer({ assetId: 'missing2' }),
        ],
      });

      const engine = new AmbienceEngine(library);
      const result = await engine.prepare(mockTimeline([event]));

      expect(result.cues).toHaveLength(0);
      expect(result.skipped).toHaveLength(2);
      expect(result.totalLayers).toBe(0);
    });

    it('handles empty timeline gracefully', async () => {
      const library = new FakeAssetLibrary();
      const engine = new AmbienceEngine(library);

      const result = await engine.prepare(mockTimeline([]));

      expect(result.cues).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
      expect(result.totalLayers).toBe(0);
    });

    it('sorts events by start time', async () => {
      const library = new FakeAssetLibrary();
      library.addAsset('asset1', mockAsset());

      const events = [
        mockEvent({ id: 'amb2', startMs: 20_000, layers: [mockLayer({ assetId: 'asset1' })] }),
        mockEvent({ id: 'amb1', startMs: 0, layers: [mockLayer({ assetId: 'asset1' })] }),
        mockEvent({ id: 'amb3', startMs: 10_000, layers: [mockLayer({ assetId: 'asset1' })] }),
      ];

      const engine = new AmbienceEngine(library);
      const result = await engine.prepare(mockTimeline(events));

      expect(result.cues).toHaveLength(3);
      expect(result.cues[0].eventId).toBe('amb1');
      expect(result.cues[1].eventId).toBe('amb3');
      expect(result.cues[2].eventId).toBe('amb2');
    });

    it('deduplicates asset resolution', async () => {
      const library = new FakeAssetLibrary();
      const resolveSpy = jest.spyOn(library, 'resolve');
      library.addAsset('shared-asset', mockAsset({ id: 'shared-asset' }));

      const event = mockEvent({
        layers: [
          mockLayer({ assetId: 'shared-asset' }),
          mockLayer({ assetId: 'shared-asset' }),
          mockLayer({ assetId: 'shared-asset' }),
        ],
      });

      const engine = new AmbienceEngine(library);
      await engine.prepare(mockTimeline([event]));

      // Should only resolve once per unique asset ID
      expect(resolveSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('requiredAssetIds', () => {
    it('extracts all distinct layer asset IDs', () => {
      const timeline = mockTimeline([
        mockEvent({
          layers: [
            mockLayer({ assetId: 'asset1' }),
            mockLayer({ assetId: 'asset2' }),
          ],
        }),
        mockEvent({
          layers: [
            mockLayer({ assetId: 'asset2' }), // duplicate
            mockLayer({ assetId: 'asset3' }),
          ],
        }),
      ]);

      const engine = new AmbienceEngine(new FakeAssetLibrary());
      const ids = engine.requiredAssetIds(timeline);

      expect(ids).toHaveLength(3);
      expect(ids).toContain('asset1');
      expect(ids).toContain('asset2');
      expect(ids).toContain('asset3');
    });

    it('handles empty timeline', () => {
      const engine = new AmbienceEngine(new FakeAssetLibrary());
      const ids = engine.requiredAssetIds(mockTimeline([]));

      expect(ids).toHaveLength(0);
    });
  });
});
