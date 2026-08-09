/**
 * The architectural guarantee: planners emit REQUIREMENTS regardless of what is
 * in the catalogue.
 *
 * This is the regression that motivated the change. Previously every audio
 * planner began with `if (manifest.list(kind).length === 0) return []`, so an
 * empty catalogue produced no events at all — and a generate-on-demand provider
 * would never be asked for anything. These tests lock that door shut.
 */

import { MusicPlanner, genreRegister, musicRequirement, maybeAssetId } from '../../../src/core/director/planners/MusicPlanner';
import { AmbiencePlanner, ambienceRequirement } from '../../../src/core/director/planners/AmbiencePlanner';
import { SFXPlanner, sfxRequirement } from '../../../src/core/director/planners/SFXPlanner';
import { stingerRequirement } from '../../../src/core/director/planners/ScenePlanner';
import { emptyAssetManifest, AssetManifest } from '../../../src/services/media/assets/AssetManifest';
import { SceneSchema, type Scene } from '../../../src/core/director/schema/scene.schema';
import { AssetRequirementSchema } from '../../../src/core/director/schema/requirement.schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function scene(over: Partial<Scene> = {}, index = 0): Scene {
  return SceneSchema.parse({
    id: `scene_${index}`,
    index,
    title: `Scene ${index}`,
    lineRange: { startLine: index * 2, endLine: index * 2 + 1 },
    estimatedDurationMs: 60_000,
    dominantEmotion: 'curious',
    tensionLevel: 0.4,
    energyLevel: 0.5,
    setting: { location: 'classroom', timeOfDay: 'day', interior: true },
    transitionIn: { style: 'crossfade', durationMs: 1500 },
    transitionOut: { style: 'crossfade', durationMs: 1500 },
    visual: {
      cameraAngle: 'medium',
      cameraMovement: 'static',
      lighting: 'natural',
      visualStyle: 'realistic',
      imagePrompt: 'a classroom',
      animationPrompt: 'a classroom, slow push in',
    },
    ...over,
  });
}

const musicInput = (manifest = emptyAssetManifest) => ({
  scenes: [scene({}, 0), scene({ dominantEmotion: 'suspense' as const }, 1)],
  genre: 'documentary' as const,
  manifest,
  duckFloorDb: -12,
  cinematicIntensity: 'balanced' as const,
  totalEstimatedMs: 120_000,
});

// ---------------------------------------------------------------------------
// MusicPlanner
// ---------------------------------------------------------------------------

describe('MusicPlanner emits requirements with an EMPTY catalogue', () => {
  const planner = new MusicPlanner();

  it('produces music events even though no assets exist', () => {
    const events = planner.fallback(musicInput());
    expect(events.length).toBeGreaterThan(0);
  });

  it('gives every event a requirement', () => {
    for (const e of planner.fallback(musicInput())) {
      expect(e.requirement).toBeDefined();
      expect(e.requirement.kind).toBe('music');
      expect(() => AssetRequirementSchema.parse(e.requirement)).not.toThrow();
    }
  });

  it('omits assetId entirely rather than setting it to undefined', () => {
    // Firestore rejects explicit undefined values.
    for (const e of planner.fallback(musicInput())) {
      expect('assetId' in e).toBe(false);
    }
  });

  it('still emits intro and outro themes', () => {
    const roles = planner.fallback(musicInput()).map((e) => e.role);
    expect(roles).toContain('intro');
    expect(roles).toContain('outro');
    expect(roles).toContain('bed');
  });

  it('marks beds loopable and themes not', () => {
    for (const e of planner.fallback(musicInput())) {
      expect(e.requirement.loopable).toBe(e.role === 'bed');
    }
  });

  it('carries the scene emotion into the requirement', () => {
    const beds = planner.fallback(musicInput()).filter((e) => e.role === 'bed');
    const emotions = beds.map((b) => b.requirement.emotion);
    expect(emotions).toContain('curious');
  });

  it('keeps the no-hard-stop invariant', () => {
    const events = planner
      .fallback(musicInput())
      .sort((a, b) => a.startMs - b.startMs);
    events.slice(0, -1).forEach((e) => {
      expect(e.crossfadeToNextMs).toBeGreaterThan(0);
    });
    expect(events[events.length - 1].crossfadeToNextMs).toBe(0);
  });

  it('sets assetId as a HINT when the catalogue has a match', () => {
    const manifest = new AssetManifest({
      version: 1,
      root: 'r',
      assets: [
        {
          id: 'doc_bed',
          kind: 'music',
          path: 'm.mp3',
          durationMs: 60_000,
          loopable: true,
          licence: 'CC0',
          tags: [],
          category: 'documentary',
          intensity: 0.5,
        },
      ],
    });
    const events = planner.fallback(musicInput(manifest));
    expect(events.some((e) => e.assetId === 'doc_bed')).toBe(true);
    // The requirement is still present — the hint does not replace it.
    expect(events.every((e) => !!e.requirement)).toBe(true);
  });

  it('returns nothing for an empty scene list', () => {
    expect(planner.fallback({ ...musicInput(), scenes: [] })).toEqual([]);
  });
});

describe('musicRequirement', () => {
  it('makes beds loopable and themes one-shot', () => {
    const bed = musicRequirement({
      category: 'documentary',
      emotion: 'curious',
      genre: 'documentary',
      intensity: 0.5,
      durationMs: 60_000,
      role: 'bed',
    });
    const intro = musicRequirement({
      category: 'documentary',
      emotion: 'curious',
      genre: 'documentary',
      intensity: 0.5,
      durationMs: 6000,
      role: 'intro',
    });
    expect(bed.loopable).toBe(true);
    expect(intro.loopable).toBe(false);
  });

  it('clamps and rounds intensity', () => {
    const r = musicRequirement({
      category: 'x',
      emotion: 'curious',
      genre: 'documentary',
      intensity: 1.7,
      durationMs: 1000,
      role: 'bed',
    });
    expect(r.intensity).toBe(1);
  });

  it('enforces a minimum duration', () => {
    const r = musicRequirement({
      category: 'x',
      emotion: 'curious',
      genre: 'documentary',
      intensity: 0.5,
      durationMs: 5,
      role: 'bed',
    });
    expect(r.durationMs).toBe(1000);
  });
});

describe('genreRegister', () => {
  it('maps known genres to a stylistic register', () => {
    expect(genreRegister('documentary')).toBe('cinematic_documentary');
    expect(genreRegister('educational')).toBe('educational_underscore');
  });

  it('falls back for an unknown genre', () => {
    expect(genreRegister('interpretive_dance')).toBe('educational_underscore');
  });
});

describe('maybeAssetId', () => {
  it('returns an empty object for null', () => {
    expect(maybeAssetId(null)).toEqual({});
  });
  it('returns the id when present', () => {
    expect(maybeAssetId('a')).toEqual({ assetId: 'a' });
  });
});

// ---------------------------------------------------------------------------
// AmbiencePlanner
// ---------------------------------------------------------------------------

describe('AmbiencePlanner emits requirements with an EMPTY catalogue', () => {
  const planner = new AmbiencePlanner();
  const input = {
    scenes: [scene({}, 0), scene({}, 1)],
    manifest: emptyAssetManifest,
    duckFloorDb: -12,
    cinematicIntensity: 'balanced' as const,
  };

  it('produces ambience events with no assets available', () => {
    expect(planner.fallback(input).length).toBeGreaterThan(0);
  });

  it('gives every layer a requirement', () => {
    for (const e of planner.fallback(input)) {
      expect(e.layers.length).toBeGreaterThan(0);
      for (const l of e.layers) {
        expect(l.requirement.kind).toBe('ambience');
        expect(l.requirement.category).toBe('classroom');
        expect(l.requirement.loopable).toBe(true);
        expect('assetId' in l).toBe(false);
      }
    }
  });

  it('keeps ambience below the duck floor', () => {
    for (const e of planner.fallback(input)) {
      for (const l of e.layers) expect(l.volumeDb).toBeLessThan(-12);
    }
  });

  it('STILL suppresses ambience entirely for reduceBackground', () => {
    // Accessibility must win over the new always-emit behaviour.
    expect(planner.fallback({ ...input, reduceBackground: true })).toEqual([]);
  });

  it('carries the layer role into the requirement', () => {
    const roles = planner
      .fallback(input)
      .flatMap((e) => e.layers.map((l) => l.requirement.layerRole));
    expect(roles).toContain('base');
  });
});

describe('ambienceRequirement', () => {
  it('puts the location in category so matching is uniform across kinds', () => {
    const r = ambienceRequirement({
      location: 'forest',
      layerRole: 'texture',
      emotion: 'calm',
      durationMs: 30_000,
    });
    expect(r.category).toBe('forest');
    expect(r.layerRole).toBe('texture');
    expect(r.loopable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SFXPlanner
// ---------------------------------------------------------------------------

describe('SFXPlanner emits requirements with an EMPTY catalogue', () => {
  const planner = new SFXPlanner();
  const lines = [
    { speaker: 'Narrator', text: 'The door creaked open slowly.' },
    { speaker: 'Narrator', text: 'Thunder rolled across the valley.' },
  ];
  const input = {
    scenes: [scene({ lineRange: { startLine: 0, endLine: 1 } }, 0)],
    lines,
    manifest: emptyAssetManifest,
    duckFloorDb: -12,
    cinematicIntensity: 'balanced' as const,
    lineDurationsMs: { 0: 3000, 1: 3000 },
    lineStartsMs: { 0: 0, 1: 3000 },
    totalEstimatedMs: 60_000,
  };

  it('produces cues with no assets available', () => {
    const events = planner.fallback(input);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.requirement.kind).toBe('sfx');
      expect(e.requirement.loopable).toBe(false);
      expect('assetId' in e).toBe(false);
    }
  });

  it('carries the trigger word into the requirement for better prompting', () => {
    const words = planner.fallback(input).map((e) => e.requirement.triggerWord);
    expect(words.some((w) => !!w)).toBe(true);
  });

  it('STILL emits nothing in subtle mode', () => {
    expect(planner.fallback({ ...input, cinematicIntensity: 'subtle' })).toEqual([]);
  });

  it('STILL respects reduceBackground', () => {
    expect(planner.fallback({ ...input, reduceBackground: true })).toEqual([]);
  });

  it('STILL drops startle categories when asked', () => {
    const events = planner.fallback({ ...input, avoidStartleEffects: true });
    expect(events.every((e) => e.effectCategory !== 'weather')).toBe(true);
  });
});

describe('sfxRequirement', () => {
  it('is never loopable', () => {
    expect(sfxRequirement({ category: 'door', durationMs: 1500 }).loopable).toBe(false);
  });
  it('enforces a minimum duration', () => {
    expect(sfxRequirement({ category: 'door', durationMs: 1 }).durationMs).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Stinger
// ---------------------------------------------------------------------------

describe('stingerRequirement', () => {
  it('is a short non-loopable transition accent', () => {
    const r = stingerRequirement(1500, 'balanced');
    expect(r.kind).toBe('stinger');
    expect(r.category).toBe('transition');
    expect(r.loopable).toBe(false);
    expect(r.durationMs).toBe(1500);
  });

  it('is punchier in dramatic mode', () => {
    expect(stingerRequirement(1200, 'dramatic').intensity).toBeGreaterThan(
      stingerRequirement(1500, 'balanced').intensity!
    );
  });

  it('enforces a floor duration', () => {
    expect(stingerRequirement(10, 'balanced').durationMs).toBe(300);
  });
});
