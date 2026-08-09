/**
 * Shared fixtures for AI Director schema + validation tests.
 *
 * `makeTimeline()` returns a MINIMAL VALID timeline. Tests then mutate one
 * field to prove a specific invariant fires — which keeps each test about
 * exactly one rule.
 */

import {
  MasterTimelineSchema,
  TIMELINE_SCHEMA_VERSION,
  type MasterTimeline,
} from '../../../src/core/director/schema/timeline.schema';
import {
  DEFAULT_MASTERING,
} from '../../../src/core/director/schema/audio.schema';
import type { Character } from '../../../src/core/director/schema/character.schema';
import type { Scene } from '../../../src/core/director/schema/scene.schema';
import type { AssetCatalogue } from '../../../src/services/media/assets/manifest.schema';

export function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: 'char_teacher_abc123',
    displayName: 'Priya',
    role: 'Teacher',
    gender: 'female',
    ageBand: 'adult',
    accent: 'indian_english',
    language: 'English',
    voice: {
      provider: 'elevenlabs',
      voiceId: 'EXAVITQu4vr4xnSDxMaL',
      voiceLabel: 'Sarah',
      baseSpeakingRate: 1,
      basePitch: 0,
      baseEnergy: 0.5,
      supportsProsody: true,
    },
    personality: {
      warmth: 0.8,
      authority: 0.7,
      energy: 0.6,
      humour: 0.3,
      formality: 0.4,
      speakingStyle: 'conversational',
    },
    defaultEmotion: 'calm',
    allowedEmotions: ['neutral', 'calm', 'curious', 'happy', 'hope'],
    createdAt: 1_700_000_000_000,
    lastUsedAt: 1_700_000_000_000,
    episodeCount: 1,
    ...over,
  };
}

export function makeScene(over: Partial<Scene> = {}): Scene {
  return {
    id: 'scene_0',
    index: 0,
    title: 'Introduction',
    chapterIndex: 0,
    lineRange: { startLine: 0, endLine: 1 },
    setting: {
      location: 'classroom',
      locationDescription: 'a sunlit classroom',
      timeOfDay: 'morning',
      environment: 'indoor',
    },
    dominantEmotion: 'curious',
    energyLevel: 0.5,
    tensionLevel: 0.2,
    estimatedDurationMs: 20_000,
    startMs: 0,
    endMs: 20_000,
    transitionIn: { style: 'crossfade', durationMs: 1500 },
    transitionOut: { style: 'crossfade', durationMs: 1500 },
    visual: {
      imagePrompt: 'a sunlit classroom, students at desks',
      videoPrompt: 'slow dolly across a sunlit classroom',
      cameraAngle: 'medium',
      cameraMovement: 'dolly',
      lighting: 'natural',
      visualStyle: 'cinematic',
      colorPalette: {
        primary: '#f5c76b',
        secondary: '#8ab4d8',
        accent: '#ffffff',
        mood: 'warm',
      },
      transitionType: 'dissolve',
    },
    ...over,
  };
}

/**
 * Minimal valid timeline: 1 scene, 2 voice lines, 1 music bed, no other tracks.
 * Deliberately small so a failing assertion is easy to read.
 */
export function makeTimeline(over: Partial<MasterTimeline> = {}): MasterTimeline {
  const character = makeCharacter();
  const scene = makeScene();

  const base: MasterTimeline = {
    id: 'tl_test_1',
    podcastId: 'pod_test_1',
    userId: 'user_test_1',
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    phase: 'planned',
    createdAt: 1_700_000_000_000,

    meta: {
      title: 'Test Episode',
      language: 'English',
      genre: 'educational',
      narrativeStyle: 'linear',
      cinematicIntensity: 'subtle',
      estimatedMinutes: 1,
    },
    cast: {
      characters: [character],
      primarySpeakerId: character.id,
    },
    emotionCurve: {
      keyframes: [
        { atProgress: 0, emotion: 'curious', intensity: 0.4, sceneId: scene.id },
        { atProgress: 1, emotion: 'hope', intensity: 0.6, sceneId: scene.id },
      ],
      arcType: 'rising',
    },
    scenes: [scene],

    tracks: {
      voice: {
        events: [
          {
            id: 'v_0',
            kind: 'voice',
            startMs: 0,
            durationMs: 10_000,
            sceneId: scene.id,
            priority: 90,
            lineIndex: 0,
            characterId: character.id,
            text: 'Welcome to the episode.',
            emotion: 'calm',
            delivery: {
              emotion: 'calm',
              intensity: 0.4,
              speakingRate: 1,
              pitch: 0,
              volumeDb: 0,
              whisper: false,
              breathBefore: false,
              prosodyUnsupported: false,
            },
          },
          {
            id: 'v_1',
            kind: 'voice',
            startMs: 10_000,
            durationMs: 10_000,
            sceneId: scene.id,
            priority: 90,
            lineIndex: 1,
            characterId: character.id,
            text: 'Today we explore photosynthesis.',
            emotion: 'curious',
            delivery: {
              emotion: 'curious',
              intensity: 0.5,
              speakingRate: 1,
              pitch: 0,
              volumeDb: 0,
              whisper: false,
              breathBefore: false,
              prosodyUnsupported: false,
            },
          },
        ],
      },
      music: {
        events: [
          {
            id: 'm_0',
            kind: 'music',
            startMs: 0,
            durationMs: 20_000,
            sceneId: scene.id,
            priority: 20,
            assetId: 'edu_soft_bed_01',
            category: 'educational',
            role: 'bed',
            intensity: 0.3,
            tempo: 'slow',
            volumeDb: -18,
            loopStrategy: 'seamless',
            fadeInMs: 1500,
            fadeOutMs: 1500,
            crossfadeToNextMs: 0, // final event — allowed
            transitionType: 'crossfade',
          },
        ],
      },
      ambience: { events: [] },
      sfx: { events: [] },
      pause: { events: [] },
      visual: { events: [] },
    },

    mastering: DEFAULT_MASTERING,
    totalDurationMs: 20_000,
    degradedAssets: [],
    warnings: [],
    ...over,
  };

  // Parse so fixtures are guaranteed schema-valid (catches fixture rot early).
  return MasterTimelineSchema.parse(base);
}

/** Small but representative asset catalogue. */
export function makeCatalogue(over: Partial<AssetCatalogue> = {}): AssetCatalogue {
  return {
    version: 1,
    root: 'audio-assets',
    assets: [
      {
        id: 'edu_soft_bed_01',
        kind: 'music',
        path: 'music/educational/soft_bed_01.mp3',
        durationMs: 90_000,
        loopable: true,
        licence: 'CC0',
        tags: ['soft', 'neutral'],
        category: 'educational',
        intensity: 0.3,
        tempo: 'slow',
      },
      {
        id: 'edu_bright_bed_01',
        kind: 'music',
        path: 'music/educational/bright_bed_01.mp3',
        durationMs: 80_000,
        loopable: true,
        licence: 'CC0',
        tags: ['bright'],
        category: 'educational',
        intensity: 0.8,
        tempo: 'upbeat',
      },
      {
        id: 'classroom_base',
        kind: 'ambience',
        path: 'ambience/classroom/base.mp3',
        durationMs: 60_000,
        loopable: true,
        licence: 'CC0',
        tags: ['room'],
        environment: 'classroom',
        layerRole: 'base',
      },
      {
        id: 'bell_single',
        kind: 'sfx',
        path: 'sfx/bell_single.mp3',
        durationMs: 1800,
        loopable: false,
        licence: 'CC0',
        tags: ['bell'],
        effectCategory: 'bell',
      },
    ],
    ...over,
  };
}
