/**
 * Shadow mode + asset layer tests.
 *
 * The single most important property here: the ShadowModeRunner must be
 * incapable of affecting podcast generation. It is the only code path that
 * touches the live pipeline, so these tests assert it stays silent when
 * disabled, never throws when enabled, and never delays the caller in shadow
 * mode.
 */

import { ShadowModeRunner } from '../../../src/core/director/ShadowModeRunner';
import { AssetLibrary } from '../../../src/services/media/assets/AssetLibrary';
import {
  MusicEngine,
  buildCue,
  dbToLinear,
  usableLengthMs,
} from '../../../src/services/media/assets/MusicEngine';
import { AssetManifest } from '../../../src/services/media/assets/AssetManifest';
import type { AIProducer } from '../../../src/core/producer/AIProducer';
import type { ResolvedAsset } from '../../../src/core/director/interfaces';
import type { MusicEvent } from '../../../src/core/director/schema/audio.schema';
import { makeCatalogue, makeTimeline } from './fixtures';

// ---------------------------------------------------------------------------
// ShadowModeRunner — the only pipeline hook
// ---------------------------------------------------------------------------

describe('ShadowModeRunner gating', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  const INPUT = {
    podcastId: 'pod_1',
    userId: 'u1',
    plan: { title: 'T', language: 'English', speakers: [], segments: [] },
    script: { lines: [{ speaker: 'A', text: 'Hello.', chapterIndex: 0 }] },
    brief: { topic: 'T' },
    request: { durationMinutes: 10 },
  };

  it('does NOTHING when AI_DIRECTOR_ENABLED is unset', async () => {
    delete process.env.AI_DIRECTOR_ENABLED;

    const produce = jest.fn();
    const runner = new ShadowModeRunner({ produce } as unknown as AIProducer);

    await runner.run(INPUT);
    // No planning, no writes — a deploy of this code changes nothing.
    expect(produce).not.toHaveBeenCalled();
  });

  it('does nothing when the flag is explicitly false', async () => {
    process.env.AI_DIRECTOR_ENABLED = 'false';
    const produce = jest.fn();
    const runner = new ShadowModeRunner({ produce } as unknown as AIProducer);
    await runner.run(INPUT);
    expect(produce).not.toHaveBeenCalled();
  });

  it('skips the Producer when only the Director is enabled', async () => {
    process.env.AI_DIRECTOR_ENABLED = 'true';
    process.env.AI_DIRECTOR_SHADOW_MODE = 'false'; // await, so we can assert
    delete process.env.AI_PRODUCER_ENABLED;

    const produce = jest.fn();
    const runner = new ShadowModeRunner({ produce } as unknown as AIProducer);

    await runner.run(INPUT);
    // Producer is separately flagged — the Director works without a plan.
    expect(produce).not.toHaveBeenCalled();
  });

  it('never throws when the Producer fails', async () => {
    process.env.AI_DIRECTOR_ENABLED = 'true';
    process.env.AI_DIRECTOR_SHADOW_MODE = 'false';
    process.env.AI_PRODUCER_ENABLED = 'true';

    const runner = new ShadowModeRunner({
      produce: jest.fn().mockRejectedValue(new Error('producer exploded')),
    } as unknown as AIProducer);

    // A planning failure must not surface to the pipeline.
    await expect(runner.run(INPUT)).resolves.toBeUndefined();
  });

  it('never throws on a malformed script', async () => {
    process.env.AI_DIRECTOR_ENABLED = 'true';
    process.env.AI_DIRECTOR_SHADOW_MODE = 'false';

    const runner = new ShadowModeRunner();
    await expect(
      runner.run({ ...INPUT, script: null, plan: null, brief: null })
    ).resolves.toBeUndefined();
  });

  it('returns immediately in shadow mode (fire-and-forget)', async () => {
    process.env.AI_DIRECTOR_ENABLED = 'true';
    process.env.AI_DIRECTOR_SHADOW_MODE = 'true';

    const runner = new ShadowModeRunner();
    const started = Date.now();
    await runner.run(INPUT);
    // Must not await the planning work — generation latency is unaffected.
    expect(Date.now() - started).toBeLessThan(150);
  });

  it('swallows a rejection from the background task', async () => {
    process.env.AI_DIRECTOR_ENABLED = 'true';
    process.env.AI_DIRECTOR_SHADOW_MODE = 'true';

    const runner = new ShadowModeRunner({
      produce: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as AIProducer);

    // No unhandled rejection escapes.
    await expect(runner.run(INPUT)).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 50));
  });
});

// ---------------------------------------------------------------------------
// AssetLibrary
// ---------------------------------------------------------------------------

describe('AssetLibrary', () => {
  it('delegates membership checks to the manifest', () => {
    const { manifest } = AssetManifest.from(makeCatalogue());
    const library = new AssetLibrary({ manifest });

    expect(library.has('music', 'edu_soft_bed_01')).toBe(true);
    expect(library.has('music', 'nope')).toBe(false);
    // Kind matters, not just id.
    expect(library.has('sfx', 'edu_soft_bed_01')).toBe(false);
  });

  it('reports unresolvable refs without throwing', () => {
    const { manifest } = AssetManifest.from(makeCatalogue());
    const library = new AssetLibrary({ manifest });

    const missing = library.validateRefs([
      { kind: 'music', id: 'edu_soft_bed_01' },
      { kind: 'music', id: 'ghost' },
    ]);
    expect(missing).toHaveLength(1);
    expect(missing[0].id).toBe('ghost');
  });

  it('returns null for an unknown asset rather than throwing', async () => {
    const { manifest } = AssetManifest.from(makeCatalogue());
    const library = new AssetLibrary({ manifest });
    await expect(library.resolve('music', 'ghost')).resolves.toBeNull();
  });

  it('keeps an explicitly-injected manifest instead of hitting Firestore', async () => {
    const { manifest } = AssetManifest.from(makeCatalogue());
    const library = new AssetLibrary({ manifest });
    // force=true must NOT replace an injected manifest.
    await expect(library.loadManifest(true)).resolves.toBe(manifest);
  });

  it('validates a catalogue without installing it', () => {
    const ok = AssetLibrary.validateCatalogue(makeCatalogue());
    expect(ok.valid).toBe(true);
    expect(ok.stats?.total).toBe(4);

    const bad = AssetLibrary.validateCatalogue({ version: 99, assets: 'nope' });
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it('rejects a catalogue with duplicate ids', () => {
    const cat = makeCatalogue();
    cat.assets.push({ ...cat.assets[0] });
    const result = AssetLibrary.validateCatalogue(cat);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/duplicate/i);
  });

  it('reports cache stats for a directory that does not exist yet', () => {
    const library = new AssetLibrary({
      manifest: AssetManifest.from(makeCatalogue()).manifest,
      cacheDir: '/tmp/definitely-not-created-by-tests',
    });
    const stats = library.cacheStats();
    expect(stats.files).toBe(0);
    expect(stats.bytes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MusicEngine geometry
// ---------------------------------------------------------------------------

function asset(over: Partial<ResolvedAsset> = {}): ResolvedAsset {
  return {
    id: 'bed',
    kind: 'music',
    localPath: '/tmp/bed.mp3',
    durationMs: 90_000,
    loopable: true,
    licence: 'CC0',
    ...over,
  };
}

function event(over: Partial<MusicEvent> = {}): MusicEvent {
  return {
    id: 'm_0',
    kind: 'music',
    startMs: 0,
    durationMs: 60_000,
    sceneId: 'scene_0',
    priority: 20,
    assetId: 'bed',
    category: 'educational',
    role: 'bed',
    intensity: 0.4,
    tempo: 'slow',
    volumeDb: -18,
    loopStrategy: 'seamless',
    fadeInMs: 1500,
    fadeOutMs: 1500,
    crossfadeToNextMs: 2000,
    transitionType: 'crossfade',
    ...over,
  };
}

describe('MusicEngine loop geometry', () => {
  it('plays once when the asset covers the slot', () => {
    const cue = buildCue(event({ durationMs: 60_000 }), asset({ durationMs: 90_000 }));
    expect(cue.loopCount).toBe(1);
    expect(cue.truncated).toBe(false);
  });

  it('loops a short loopable asset enough times to cover the slot', () => {
    // 30s asset under a 100s scene needs 4 passes.
    const cue = buildCue(event({ durationMs: 100_000 }), asset({ durationMs: 30_000 }));
    expect(cue.loopCount).toBe(4);
    expect(cue.truncated).toBe(false);
  });

  it('marks a short NON-loopable asset truncated instead of looping it', () => {
    // Looping a non-loopable file produces an audible seam — better to fade.
    const cue = buildCue(
      event({ durationMs: 100_000 }),
      asset({ durationMs: 30_000, loopable: false })
    );
    expect(cue.loopCount).toBe(1);
    expect(cue.truncated).toBe(true);
  });

  it('respects loopStrategy: none', () => {
    const cue = buildCue(
      event({ durationMs: 100_000, loopStrategy: 'none' }),
      asset({ durationMs: 30_000 })
    );
    expect(cue.loopCount).toBe(1);
    expect(cue.truncated).toBe(true);
  });

  it('uses only the region between explicit loop points', () => {
    // Tiling the whole file would replay its intro on every pass.
    const withPoints = asset({ durationMs: 90_000, loopStartMs: 10_000, loopEndMs: 40_000 });
    expect(usableLengthMs(withPoints)).toBe(30_000);
    expect(buildCue(event({ durationMs: 90_000 }), withPoints).loopCount).toBe(3);
  });

  it('falls back to full duration when loop points are invalid', () => {
    expect(usableLengthMs(asset({ loopStartMs: 40_000, loopEndMs: 10_000 }))).toBe(90_000);
    expect(usableLengthMs(asset({ loopStartMs: undefined, loopEndMs: undefined }))).toBe(90_000);
  });

  it('clamps a fade so it cannot exceed half the audible length', () => {
    // An over-long fade makes ffmpeg output near-silence.
    const cue = buildCue(
      event({ durationMs: 4000, fadeInMs: 10_000, fadeOutMs: 10_000 }),
      asset({ durationMs: 4000 })
    );
    expect(cue.fadeInMs).toBeLessThanOrEqual(2000);
    expect(cue.fadeOutMs).toBeLessThanOrEqual(2000);
  });

  it('carries planner decisions through unchanged', () => {
    const cue = buildCue(event({ volumeDb: -20, crossfadeToNextMs: 2500, role: 'intro' }), asset());
    expect(cue.volumeDb).toBe(-20);
    expect(cue.crossfadeToNextMs).toBe(2500);
    expect(cue.role).toBe('intro');
  });

  it('handles a zero-duration event without dividing by zero', () => {
    const cue = buildCue(event({ durationMs: 0 }), asset());
    expect(cue.loopCount).toBe(1);
    expect(cue.fadeInMs).toBe(0);
  });
});

describe('dbToLinear', () => {
  it('maps 0dB to unity', () => {
    expect(dbToLinear(0)).toBe(1);
  });

  it('maps -6dB to about half amplitude', () => {
    expect(dbToLinear(-6)).toBeCloseTo(0.5, 1);
  });

  it('maps -20dB to a tenth', () => {
    expect(dbToLinear(-20)).toBeCloseTo(0.1, 2);
  });

  it('stays positive for very quiet levels', () => {
    expect(dbToLinear(-45)).toBeGreaterThan(0);
  });
});

describe('MusicEngine.prepare', () => {
  it('returns no cues for a timeline with no music', async () => {
    const library = new AssetLibrary({
      manifest: AssetManifest.from(makeCatalogue()).manifest,
    });
    const timeline = makeTimeline();
    timeline.tracks.music.events = [];

    const result = await new MusicEngine(library).prepare(timeline);
    expect(result.cues).toEqual([]);
    expect(result.totalMusicMs).toBe(0);
  });

  it('skips an unresolvable cue and records why', async () => {
    // Empty manifest → nothing resolves, but prepare must not throw.
    const library = new AssetLibrary({
      manifest: AssetManifest.from({ version: 1, root: 'a', assets: [] }).manifest,
    });
    const result = await new MusicEngine(library).prepare(makeTimeline());

    expect(result.cues).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].assetId).toBe('edu_soft_bed_01');
    expect(result.skipped[0].reason).toMatch(/unresolved/i);
  });

  it('lists the distinct assets a timeline needs for pre-warming', () => {
    const library = new AssetLibrary({
      manifest: AssetManifest.from(makeCatalogue()).manifest,
    });
    const timeline = makeTimeline();
    // Two events, same asset → one download.
    timeline.tracks.music.events.push({
      ...timeline.tracks.music.events[0],
      id: 'm_1',
      startMs: 20_000,
    });

    expect(new MusicEngine(library).requiredAssetIds(timeline)).toEqual([
      'edu_soft_bed_01',
    ]);
  });

  it('prewarm never throws even when everything is missing', async () => {
    const library = new AssetLibrary({
      manifest: AssetManifest.from({ version: 1, root: 'a', assets: [] }).manifest,
    });
    await expect(new MusicEngine(library).prewarm(makeTimeline())).resolves.toBeUndefined();
  });
});
