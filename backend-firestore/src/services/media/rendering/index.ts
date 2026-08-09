/**
 * Cinematic Audio Rendering Pipeline
 *
 * Exports:
 *   - CinematicAudioRenderer (main orchestrator)
 *   - Individual engines (for testing / custom workflows)
 *   - Types and interfaces
 */

// Main orchestrator
export { CinematicAudioRenderer, createCinematicAudioRenderer } from './CinematicAudioRenderer';
export type {
  RenderOptions,
  RenderResult,
  RenderStats,
  RenderStage,
} from './CinematicAudioRenderer';

// Engines
export { VoiceEngine, createVoiceEngine } from './VoiceEngine';
export type { VoiceCue, VoiceSynthesisResult, VoiceSynthesisOptions } from './VoiceEngine';

export { AmbienceEngine, createAmbienceEngine } from './AmbienceEngine';
export type {
  AmbienceCue,
  AmbienceLayerCue,
  AmbiencePlanResult,
} from './AmbienceEngine';

export { SFXEngine, createSFXEngine } from './SFXEngine';
export type { SFXCue, SFXPlanResult } from './SFXEngine';

export { AudioMixer, createAudioMixer } from './AudioMixer';
export type { MixInputs, MixResult, MixStats, MixOptions } from './AudioMixer';

// Filter graph utilities
export { buildFilterGraph, validateFilterInputs } from './filterGraph';
export type { FilterGraphInputs, FilterGraphResult } from './filterGraph';

// Re-export MusicEngine from its existing location for convenience
export { MusicEngine, createMusicEngine } from '../../media/assets/MusicEngine';
export type { MusicCue, MusicPlanResult } from '../../media/assets/MusicEngine';

// Shadow mode integration
export { CinematicShadowRunner, cinematicShadowRunner } from './CinematicShadowRunner';
export type {
  CinematicRenderInput,
  CinematicRenderResult,
} from './CinematicShadowRunner';
