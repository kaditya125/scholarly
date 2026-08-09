/**
 * Public entry point for the AI Director layer.
 *
 * Everything downstream (Phase B producer, Phase C planners, Phase D inspector,
 * Phase E+ renderers) should import from here.
 *
 * Phase A: definitions only — nothing in this directory is wired into the
 * podcast pipeline yet.
 */

export * from './schema';
export * from './interfaces';

// ── Orchestrator + builder ────────────────────────────────────────────────
export { AIDirector, aiDirector, estimateLineTimings, inferGenre, resolveEmphasisTerms } from './AIDirector';
export { TimelineBuilder, timelineBuilder, anchorScenes, parseTrailingIndex } from './TimelineBuilder';

// ── Planners ──────────────────────────────────────────────────────────────
export { NarrativeAnalyzer, narrativeAnalyzer, normalizeSceneCoverage, reconcileCharacters, normalizeName } from './planners/NarrativeAnalyzer';
export type { NarrativeAnalysis, SceneSkeleton, CharacterHint, ScriptLineLike } from './planners/NarrativeAnalyzer';
export { CharacterPlanner, characterPlanner, defaultPersonality, accentForLanguage } from './planners/CharacterPlanner';
export { ScenePlanner, scenePlanner, countWords, wordsPerSecond, estimateSceneDurationMs, environmentFor } from './planners/ScenePlanner';
export { EmotionPlanner, emotionPlanner, interpolateIntensity, emotionAt, intensityFor, expressionScaleFor } from './planners/EmotionPlanner';
export { PausePlanner, pausePlanner, decidePause } from './planners/PausePlanner';
export { MusicPlanner, musicPlanner, sealCrossfades } from './planners/MusicPlanner';
export { AmbiencePlanner, ambiencePlanner } from './planners/AmbiencePlanner';
export { SFXPlanner, sfxPlanner, estimateWordOffset, sfxVolumeDb } from './planners/SFXPlanner';
export { VisualPlanner, visualPlanner } from './planners/VisualPlanner';

// ── Knowledge maps ────────────────────────────────────────────────────────
export { EMOTION_PROFILES, emotionProfile, allowedEmotionsForRole, clampEmotion, assertEmotionCoverage } from './knowledge/emotionProfiles';
export { AMBIENCE_MAP, ambienceStackFor, EDUCATIONAL_LOCATIONS, assertAmbienceCoverage } from './knowledge/ambienceMap';
export { musicCategoryFor, tempoForIntensity, bedVolumeDb, themeVolumeDb, crossfadeMsFor } from './knowledge/musicMap';
export { SFX_TRIGGERS, MAX_SFX_PER_MINUTE, MIN_SFX_GAP_MS, matchTriggers } from './knowledge/sfxTriggers';
export { pickVoice, voiceCharacterForRole, ageBandForRole, inferGenderFromRole, balanceGenders, hashToIndex } from './knowledge/voiceRegistry';
export { paletteFor, lightingFor, visualStyleFor, cameraFor, buildImagePrompt, buildVideoPrompt } from './knowledge/visualStyles';

export {
  parseTimeline,
  validateTimeline,
  validateInvariants,
  validateLineCoverage,
  formatValidationResult,
  type ValidationCode,
  type ValidationIssue,
  type ValidationResult,
} from './validation';
