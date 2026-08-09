/**
 * Visual style templates.
 *
 * Composes scene metadata into image/video prompts and cinematography for a
 * FUTURE renderer. Nothing consumes this in v1.
 *
 * Worth doing now because the expensive decision in video generation is
 * deciding *what to show*, and the script context needed to decide it is
 * already loaded here. Capturing it costs one deterministic function call;
 * reconstructing it later would cost another LLM pass over the whole script.
 */

import type { Emotion, MediaGenre } from '../schema/common.schema';
import type {
  CameraAngle,
  CameraMovement,
  ColorPalette,
  Lighting,
  VisualStyle,
  VisualTransition,
} from '../schema/visual.schema';
import type { SceneSetting, TimeOfDay } from '../schema/scene.schema';

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

const EMOTION_PALETTES: Record<Emotion, ColorPalette> = {
  neutral:   { primary: '#6b7280', secondary: '#d1d5db', accent: '#ffffff', mood: 'balanced' },
  happy:     { primary: '#fbbf24', secondary: '#fde68a', accent: '#ffffff', mood: 'bright' },
  sad:       { primary: '#3b5f7a', secondary: '#94a3b8', accent: '#e2e8f0', mood: 'muted' },
  fear:      { primary: '#1f2937', secondary: '#4b5563', accent: '#9ca3af', mood: 'cold' },
  excited:   { primary: '#f97316', secondary: '#fdba74', accent: '#fff7ed', mood: 'vivid' },
  calm:      { primary: '#7dd3c0', secondary: '#cffafe', accent: '#ffffff', mood: 'serene' },
  hope:      { primary: '#fcd34d', secondary: '#a7f3d0', accent: '#ffffff', mood: 'warm' },
  angry:     { primary: '#b91c1c', secondary: '#f87171', accent: '#fee2e2', mood: 'intense' },
  curious:   { primary: '#6366f1', secondary: '#a5b4fc', accent: '#eef2ff', mood: 'inquisitive' },
  suspense:  { primary: '#312e5f', secondary: '#4c1d95', accent: '#c4b5fd', mood: 'tense' },
  mystery:   { primary: '#1e1b4b', secondary: '#4338ca', accent: '#a5b4fc', mood: 'enigmatic' },
  romantic:  { primary: '#be185d', secondary: '#fbcfe8', accent: '#fff1f2', mood: 'soft' },
  heroic:    { primary: '#b45309', secondary: '#fcd34d', accent: '#fffbeb', mood: 'grand' },
  victory:   { primary: '#15803d', secondary: '#86efac', accent: '#f0fdf4', mood: 'triumphant' },
  failure:   { primary: '#44403c', secondary: '#78716c', accent: '#d6d3d1', mood: 'subdued' },
  wonder:    { primary: '#7c3aed', secondary: '#c4b5fd', accent: '#f5f3ff', mood: 'awed' },
  surprise:  { primary: '#0891b2', secondary: '#67e8f9', accent: '#ecfeff', mood: 'sudden' },
};

export function paletteFor(emotion: Emotion): ColorPalette {
  return EMOTION_PALETTES[emotion] ?? EMOTION_PALETTES.neutral;
}

// ---------------------------------------------------------------------------
// Lighting & style
// ---------------------------------------------------------------------------

const TIME_LIGHTING: Record<TimeOfDay, Lighting> = {
  dawn: 'blue_hour',
  morning: 'natural',
  midday: 'harsh',
  afternoon: 'golden_hour',
  evening: 'golden_hour',
  night: 'low_key',
  neutral: 'soft',
};

export function lightingFor(setting: SceneSetting, emotion: Emotion): Lighting {
  // Emotion overrides time of day when it is strongly expressive.
  if (emotion === 'mystery' || emotion === 'fear' || emotion === 'suspense') return 'low_key';
  if (emotion === 'victory' || emotion === 'heroic') return 'dramatic';
  if (emotion === 'happy' || emotion === 'hope') return 'high_key';
  return TIME_LIGHTING[setting.timeOfDay] ?? 'natural';
}

const GENRE_STYLE: Record<MediaGenre, VisualStyle> = {
  educational: 'illustration',
  documentary: 'documentary',
  storytelling: 'cinematic',
  interview: 'documentary',
  debate: 'documentary',
  news: 'documentary',
  meditation: 'watercolour',
  drama: 'cinematic',
};

export function visualStyleFor(genre: MediaGenre): VisualStyle {
  return GENRE_STYLE[genre] ?? 'cinematic';
}

// ---------------------------------------------------------------------------
// Cinematography
// ---------------------------------------------------------------------------

/**
 * Establishing shots go wide; later scenes tighten. Mirrors how a documentary
 * editor would cut: place the viewer, then move closer as ideas develop.
 */
export function cameraFor(
  sceneIndex: number,
  totalScenes: number,
  emotion: Emotion
): { angle: CameraAngle; movement: CameraMovement } {
  const isFirst = sceneIndex === 0;
  const isLast = totalScenes > 1 && sceneIndex === totalScenes - 1;

  if (isFirst) return { angle: 'wide', movement: 'dolly' };
  if (isLast) return { angle: 'medium', movement: 'zoom_out' };

  if (emotion === 'suspense' || emotion === 'fear') {
    return { angle: 'close_up', movement: 'handheld' };
  }
  if (emotion === 'wonder' || emotion === 'heroic') {
    return { angle: 'low', movement: 'orbit' };
  }
  if (emotion === 'curious') return { angle: 'medium', movement: 'pan_right' };

  return { angle: 'medium', movement: 'static' };
}

export function transitionFor(emotion: Emotion, isFirst: boolean): VisualTransition {
  if (isFirst) return 'fade_black';
  if (emotion === 'surprise' || emotion === 'excited') return 'zoom_blur';
  if (emotion === 'mystery' || emotion === 'suspense') return 'dissolve';
  return 'dissolve';
}

// ---------------------------------------------------------------------------
// Prompt composition
// ---------------------------------------------------------------------------

/**
 * Build the still-image prompt for a scene.
 *
 * Ends with hard negatives against text and collage. Text rendered into a
 * generated frame is the single most common artefact that makes AI imagery look
 * broken, and it is worse in an educational context where wrong words mislead.
 */
export function buildImagePrompt(args: {
  setting: SceneSetting;
  emotion: Emotion;
  genre: MediaGenre;
  sceneTitle: string;
  topic: string;
}): string {
  const { setting, emotion, genre, sceneTitle, topic } = args;
  const palette = paletteFor(emotion);
  const lighting = lightingFor(setting, emotion);
  const style = visualStyleFor(genre);

  const place =
    setting.locationDescription?.trim() ||
    setting.location.replace(/_/g, ' ');

  const parts = [
    `${style} depiction of ${place}`,
    setting.timeOfDay !== 'neutral' ? `at ${setting.timeOfDay.replace(/_/g, ' ')}` : '',
    setting.weather ? `with ${setting.weather} weather` : '',
    `conveying a ${palette.mood} mood`,
    `${lighting.replace(/_/g, ' ')} lighting`,
    `subject matter: ${sceneTitle} (${topic})`,
    'professional composition, high detail, landscape orientation',
    'no text, no words, no letters, no captions, no watermarks, no collage',
  ];

  return parts.filter(Boolean).join(', ');
}

/** Motion prompt for a future video model, adding camera movement. */
export function buildVideoPrompt(args: {
  setting: SceneSetting;
  emotion: Emotion;
  genre: MediaGenre;
  sceneTitle: string;
  topic: string;
  movement: CameraMovement;
}): string {
  const base = buildImagePrompt(args);
  const move = args.movement.replace(/_/g, ' ');
  return `${base}, slow ${move} camera movement, subtle natural motion, cinematic`;
}

/** Animation prompt for 2D/educational explainer output. */
export function buildAnimationPrompt(args: {
  sceneTitle: string;
  topic: string;
  emotion: Emotion;
}): string {
  const palette = paletteFor(args.emotion);
  return (
    `Clean 2D educational animation explaining ${args.sceneTitle} (${args.topic}), ` +
    `flat vector style, ${palette.mood} palette, clear diagrammatic shapes, ` +
    'smooth transitions, no text labels'
  );
}
