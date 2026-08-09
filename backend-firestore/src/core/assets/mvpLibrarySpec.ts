/**
 * MVP asset library specification — 10 music, 10 ambience, 10 SFX.
 *
 * Declarative on purpose: this is the *manifest of intent*, and the generator
 * script merely executes it. Keeping it as data means the library can be
 * reviewed, diffed and re-run without reading procedural code, and the same
 * spec drives both generation and coverage reporting.
 *
 * Each entry becomes an `AssetRequirement`, which is then satisfied by whichever
 * provider the resolver picks. Nothing here mentions Lyria — regenerating the
 * library against a licensed library later requires no edits to this file.
 */

import {
  AssetRequirementSchema,
  type AssetRequirement,
} from '../director/schema/requirement.schema';

export interface LibrarySpecEntry {
  /** Human label used in the coverage report. */
  label: string;
  requirement: AssetRequirement;
}

/** Beds are 30s loopable clips — the generative ceiling is ~32s. */
const BED_MS = 30_000;
/** Ambience beds are the same length for the same reason. */
const AMBIENCE_MS = 30_000;
/** One-shots. Real length comes from the returned audio. */
const SFX_MS = 2_000;

function music(
  label: string,
  category: string,
  emotion: AssetRequirement['emotion'],
  intensity: number,
  tempo: AssetRequirement['tempo'],
  genre = 'cinematic_documentary'
): LibrarySpecEntry {
  return {
    label,
    requirement: AssetRequirementSchema.parse({
      kind: 'music',
      category,
      emotion,
      genre,
      intensity,
      tempo,
      durationMs: BED_MS,
      loopable: true,
      tags: ['bed', 'mvp'],
      description: `${label} music bed`,
    }),
  };
}

function ambience(label: string, location: string): LibrarySpecEntry {
  return {
    label,
    requirement: AssetRequirementSchema.parse({
      kind: 'ambience',
      category: location,
      layerRole: 'base',
      durationMs: AMBIENCE_MS,
      loopable: true,
      tags: ['base', 'mvp'],
      description: `${label} ambience bed`,
    }),
  };
}

function sfx(label: string, category: string, triggerWord: string): LibrarySpecEntry {
  return {
    label,
    requirement: AssetRequirementSchema.parse({
      kind: 'sfx',
      category,
      durationMs: SFX_MS,
      loopable: false,
      triggerWord,
      tags: ['one_shot', 'mvp'],
      description: `${label} sound effect`,
    }),
  };
}

// ---------------------------------------------------------------------------
// Music — 10
// ---------------------------------------------------------------------------

export const MVP_MUSIC: LibrarySpecEntry[] = [
  music('Calm educational', 'educational', 'calm', 0.25, 'slow', 'educational_underscore'),
  music('Curious / wonder', 'science', 'curious', 0.4, 'moderate'),
  music('Suspense', 'mystery', 'suspense', 0.7, 'moderate'),
  music('Mystery', 'mystery', 'mystery', 0.5, 'slow'),
  music('Emotional / sad', 'sad', 'sad', 0.35, 'slow'),
  music('Inspirational', 'inspirational', 'hope', 0.55, 'moderate'),
  music('Epic', 'epic', 'heroic', 0.85, 'driving'),
  music('Adventure', 'adventure', 'excited', 0.7, 'upbeat'),
  music('Science / futuristic', 'science', 'wonder', 0.5, 'moderate'),
  music('Historical documentary', 'historical', 'neutral', 0.4, 'slow'),
];

// ---------------------------------------------------------------------------
// Ambience — 10
// ---------------------------------------------------------------------------

export const MVP_AMBIENCE: LibrarySpecEntry[] = [
  ambience('Classroom', 'classroom'),
  ambience('Forest', 'forest'),
  ambience('Rain', 'rain'),
  ambience('Storm', 'storm'),
  ambience('City', 'city'),
  ambience('Marketplace', 'marketplace'),
  ambience('Ocean', 'ocean'),
  ambience('Space', 'space'),
  ambience('Laboratory', 'laboratory'),
  ambience('Library', 'library'),
];

// ---------------------------------------------------------------------------
// SFX — 10
// ---------------------------------------------------------------------------

export const MVP_SFX: LibrarySpecEntry[] = [
  sfx('Door', 'door', 'door'),
  sfx('Footsteps', 'footsteps', 'footsteps'),
  sfx('Thunder', 'weather', 'thunder'),
  sfx('Bell', 'bell', 'bell'),
  sfx('Clock', 'time', 'clock'),
  sfx('Paper', 'paper', 'paper'),
  sfx('Typing', 'typing', 'typing'),
  sfx('Crowd', 'crowd', 'crowd'),
  sfx('Water', 'water', 'water'),
  sfx('Wind', 'wind', 'wind'),
];

// ---------------------------------------------------------------------------
// SFX phase 2 — the categories the trigger table can produce but the library
// could not satisfy.
//
// Ten of the twenty SFXCategory values had NO asset: explosion, vehicle, fire,
// glass, weapon, animal, body, phone, magic, ui. A trigger firing on one of them
// resolved to nothing, and the binder's fallback substituted something wrong —
// `vehicle -> crowd` played a crowd murmur for a rocket launch. Silence would
// have been better.
//
// Several categories carry more than one entry because one clip cannot cover the
// range: a rocket launch, an engine rumble and a landing thud are all `vehicle`
// but are not interchangeable. The distinct `triggerWord` and description give
// each its own requirement fingerprint, so they generate and cache separately,
// and the binder scores them against the cue's own trigger word.
// ---------------------------------------------------------------------------

export const SFX_PHASE2: LibrarySpecEntry[] = [
  // Vehicle / spacecraft — the Apollo case that started this.
  sfx('Rocket launch', 'vehicle', 'rocket'),
  sfx('Engine rumble', 'vehicle', 'engine'),
  sfx('Landing thud', 'vehicle', 'touchdown'),
  sfx('Train passing', 'vehicle', 'train'),

  // Impact and destruction.
  sfx('Explosion', 'explosion', 'explosion'),
  sfx('Deep rumble', 'explosion', 'rumble'),
  sfx('Glass shatter', 'glass', 'shattered'),

  // Fire.
  sfx('Fire crackle', 'fire', 'fire crackle'),

  // Conflict and creatures.
  sfx('Sword clash', 'weapon', 'sword'),
  sfx('Horse gallop', 'animal', 'gallop'),

  // Human body.
  sfx('Heartbeat', 'body', 'heartbeat'),

  // Communications — radio static is essential for any mission narrative.
  sfx('Radio static', 'phone', 'radio static'),
  sfx('Phone ring', 'phone', 'phone ring'),

  // Instruments and interfaces: countdowns, alarms, computer beeps. Common in
  // science and exploration stories and previously impossible to sound.
  sfx('Countdown beep', 'ui', 'countdown'),
  sfx('Alarm', 'ui', 'alarm'),
  sfx('Machine beep', 'ui', 'computer'),

  // Transitions.
  sfx('Whoosh', 'magic', 'whoosh'),
];

/** Everything the SFX layer can currently ask for. */
export const ALL_SFX: LibrarySpecEntry[] = [...MVP_SFX, ...SFX_PHASE2];

export const MVP_LIBRARY: LibrarySpecEntry[] = [
  ...MVP_MUSIC,
  ...MVP_AMBIENCE,
  ...MVP_SFX,
];

/** Total requirements in the ORIGINAL MVP library. Asserted by tests to stay at 30. */
export const MVP_LIBRARY_SIZE = MVP_LIBRARY.length;

/** The full library including the phase-2 SFX. */
export const FULL_LIBRARY: LibrarySpecEntry[] = [
  ...MVP_MUSIC,
  ...MVP_AMBIENCE,
  ...ALL_SFX,
];
