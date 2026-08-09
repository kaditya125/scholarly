/**
 * Requirement → text-to-music prompt.
 *
 * Isolated from the provider so prompt tuning never touches transport code, and
 * so the mapping is unit-testable with no network. Deterministic by design: the
 * same requirement must always yield the same prompt string, because the prompt
 * seeds generation and therefore decides cache identity.
 *
 * Editorial stance encoded here: this is UNDERSCORE music for an educational
 * podcast. Every prompt asks for restraint, no vocals, and space in the
 * mid-range where speech lives. Music that draws attention to itself is a
 * defect, not a feature.
 */

import type { Emotion } from '../../director/schema/common.schema';
import type { AssetRequirement } from '../../director/schema/requirement.schema';

/**
 * Applied to every request. Vocals and percussive transients are the two things
 * that most damage narration intelligibility.
 */
export const NEGATIVE_PROMPT =
  'vocals, singing, lyrics, choir, spoken word, sudden loud hits, ' +
  'harsh distortion, heavy drums, dense busy arrangement, dominant melody';

/** Instrumentation and register per music category. */
const CATEGORY_STYLE: Record<string, string> = {
  educational: 'warm minimal piano and soft pads, gentle and unobtrusive',
  documentary: 'sparse cinematic strings and low piano, observational and measured',
  calm_piano: 'solo felt piano, intimate and slow',
  strings: 'sustained string ensemble, legato and warm',
  ambient_synth: 'slow evolving analog synth pads, wide and airy',
  science: 'clean minimal synth arpeggios and glassy textures, curious and precise',
  space: 'vast reverberant synth drones and distant bells, weightless',
  nature: 'soft acoustic guitar and airy flute textures, open and organic',
  mystery: 'muted pizzicato strings and low pulsing bass, questioning and restrained',
  horror: 'dissonant low strings and hollow metallic textures, tense and sparse',
  sad: 'slow cello and piano in minor key, tender and spacious',
  epic: 'broad orchestral brass and timpani swells, grand but controlled',
  adventure: 'rhythmic strings and light brass, forward-moving and bright',
  fantasy: 'harp, celeste and soft woodwinds, wondrous and light',
  historical: 'period-appropriate strings and low woodwinds, dignified and restrained',
  inspirational: 'rising piano arpeggios with warm strings, hopeful and open',
  victory: 'bright sustained brass and warm strings resolving upward',
  meditation: 'single sustained drone with soft harmonic overtones, extremely still',
};

/**
 * How the emotion colours the arrangement, layered on top of the category.
 * Exhaustive over the closed Emotion union — a missing key is a compile error,
 * which is what stops a new emotion silently producing a generic prompt.
 */
const EMOTION_COLOUR: Record<Emotion, string> = {
  neutral: 'emotionally even',
  happy: 'warm and bright',
  sad: 'melancholic and slow',
  fear: 'cold and unstable',
  excited: 'energetic but controlled',
  calm: 'still and unhurried',
  hope: 'gently uplifting',
  angry: 'harsh and driving, without percussion',
  curious: 'inquisitive and light',
  suspense: 'withheld, building without release',
  mystery: 'unresolved and questioning',
  romantic: 'tender and intimate',
  heroic: 'broad and resolute',
  victory: 'resolving upward with weight',
  failure: 'deflating and hollow',
  wonder: 'expansive and awed',
  surprise: 'suspended, mid-breath',
};

const TEMPO_WORDS: Record<string, string> = {
  slow: 'slow tempo around 60-75 BPM',
  moderate: 'moderate tempo around 85-100 BPM',
  upbeat: 'upbeat tempo around 110-125 BPM',
  driving: 'driving tempo around 130-145 BPM',
};

/**
 * Intensity → dynamic description. Capped at 'moderate' language even for high
 * intensity: a bed at 0.9 should feel urgent through harmony and rhythm, not
 * through volume, because the mixer ducks it under speech anyway.
 */
function intensityWords(intensity: number): string {
  if (intensity < 0.2) return 'extremely quiet and sparse, almost ambient';
  if (intensity < 0.4) return 'quiet and sparse, plenty of space between notes';
  if (intensity < 0.6) return 'moderate density, steady underlying movement';
  if (intensity < 0.8) return 'fuller arrangement with clear forward momentum';
  return 'dense and urgent, but with controlled dynamics and no sudden peaks';
}

/**
 * Build the generation prompt for a music requirement.
 *
 * Deterministic: no randomness, no timestamps, no locale-dependent formatting.
 */
export function buildMusicPrompt(requirement: AssetRequirement): string {
  const style =
    CATEGORY_STYLE[requirement.category.toLowerCase()] ??
    CATEGORY_STYLE.educational;

  const parts: string[] = ['Instrumental background music for an educational podcast.'];
  parts.push(style + '.');

  if (requirement.emotion) {
    const colour = EMOTION_COLOUR[requirement.emotion];
    if (colour) parts.push(`Mood: ${colour}.`);
  }

  if (requirement.genre) {
    parts.push(`Style reference: ${requirement.genre.replace(/_/g, ' ')}.`);
  }

  parts.push(intensityWords(requirement.intensity ?? 0.5) + '.');

  if (requirement.tempo) {
    parts.push(TEMPO_WORDS[requirement.tempo] + '.');
  }

  if (requirement.loopable) {
    parts.push('Seamlessly loopable, consistent texture throughout, no intro or outro.');
  }

  // Non-negotiable mix constraints — this is underscore, not a feature track.
  parts.push(
    'Leave the mid-range open for a speaking voice. No vocals. ' +
      'Consistent dynamics with no sudden transients.'
  );

  return parts.join(' ');
}

/**
 * Build a prompt for ambience or SFX. Kept alongside music prompts because the
 * editorial constraints (no music, no vocals, steady) are the same family of
 * concern, and a single file makes the whole prompt surface reviewable at once.
 */
export function buildSoundPrompt(requirement: AssetRequirement): string {
  const subject = requirement.category.replace(/_/g, ' ');

  if (requirement.kind === 'ambience') {
    const role = requirement.layerRole ?? 'base';
    const roleWords =
      role === 'base'
        ? 'continuous steady background bed, no distinct foreground events'
        : role === 'texture'
          ? 'subtle recurring textural detail, gentle and non-distracting'
          : role === 'detail'
            ? 'occasional sparse incidental sounds with long gaps of near-silence'
            : 'single distinct accent sound';

    return [
      `Ambient environmental sound recording of a ${subject}.`,
      `${roleWords}.`,
      'Seamlessly loopable. No music, no speech, no vocals.',
      'Low dynamic range, no sudden loud events.',
    ].join(' ');
  }

  // SFX
  //
  // Lead with the TRIGGER WORD, not the category. Categories are taxonomy labels
  // ('body', 'ui', 'magic', 'vehicle'), not descriptions of a sound: asking for
  // "sound effect: body in the context of heartbeat" produced a 400 from the
  // generator, and "sound effect: vehicle ... rocket" made the model lead on the
  // wrong noun. The trigger word is the actual thing the listener should hear, so
  // it becomes the subject and the category is demoted to a disambiguating hint.
  const event = requirement.triggerWord?.trim();
  const headline = event
    ? `${event} — ${subject} sound`
    : `${subject} sound`;

  return [
    `Isolated sound effect: ${headline}.`,
    'Clean single-event recording, dry with minimal reverb, no background noise.',
    'No music, no speech, no vocals.',
  ].join(' ');
}
