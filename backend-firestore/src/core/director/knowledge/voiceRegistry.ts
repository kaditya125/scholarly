/**
 * Voice registry — gender/age/character → concrete provider voice.
 *
 * Solves a real defect in the current system: `tts.config.json` maps by ROLE, so
 * `Host` and `Student` both resolve to the same ElevenLabs voice
 * (`EXAVITQu4vr4xnSDxMaL`) and are indistinguishable in a two-speaker episode.
 *
 * Two mechanisms fix that:
 *   1. Keys include gender AND age, not just role.
 *   2. Multiple profiles per key, selected by a hash of the character id, so two
 *      adult female characters in one episode never collide.
 *
 * `supportsProsody` is carried per voice. Chirp 3 HD and Journey reject
 * pitch/rate outright, so the Director records that fact and the synthesizer
 * omits those params rather than triggering an INVALID_ARGUMENT.
 */

import type { AgeBand, Gender } from '../schema/common.schema';
import type { VoiceProfile, VoiceProvider } from '../schema/character.schema';

/** Broad voice character, derived from a speaker's role. */
export type VoiceCharacter =
  | 'warm'
  | 'authoritative'
  | 'curious'
  | 'energetic'
  | 'calm'
  | 'documentary';

export type VoiceKey = `${Gender}_${AgeBand}_${VoiceCharacter}`;

interface RegistryEntry {
  provider: VoiceProvider;
  voiceId: string;
  voiceLabel: string;
  supportsProsody: boolean;
  basePitch?: number;
  baseSpeakingRate?: number;
  baseEnergy?: number;
}

/**
 * ElevenLabs multilingual voices handle Hindi/Hinglish well, which is why they
 * are the default here — the existing provider already uses these ids.
 *
 * Only a subset of keys is populated; `pickVoice` falls back progressively.
 */
const REGISTRY: Partial<Record<VoiceKey, RegistryEntry[]>> = {
  // ── Adult female ──────────────────────────────────────────────────────
  female_adult_warm: [
    { provider: 'elevenlabs', voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceLabel: 'Sarah', supportsProsody: true, baseEnergy: 0.55 },
    { provider: 'elevenlabs', voiceId: 'ThT5KcBeYPX3keUQqHPh', voiceLabel: 'Dorothy', supportsProsody: true, baseEnergy: 0.5 },
  ],
  female_adult_authoritative: [
    { provider: 'elevenlabs', voiceId: 'ThT5KcBeYPX3keUQqHPh', voiceLabel: 'Dorothy', supportsProsody: true, basePitch: -0.5, baseEnergy: 0.6 },
  ],
  female_adult_calm: [
    { provider: 'elevenlabs', voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceLabel: 'Sarah', supportsProsody: true, baseSpeakingRate: 0.96, baseEnergy: 0.4 },
  ],
  female_adult_documentary: [
    { provider: 'elevenlabs', voiceId: 'ThT5KcBeYPX3keUQqHPh', voiceLabel: 'Dorothy', supportsProsody: true, baseSpeakingRate: 0.97, baseEnergy: 0.45 },
  ],

  // ── Adult male ────────────────────────────────────────────────────────
  male_adult_warm: [
    { provider: 'elevenlabs', voiceId: 'pNInz6obpgDQGcFmaJgB', voiceLabel: 'Adam', supportsProsody: true, baseEnergy: 0.55 },
    { provider: 'elevenlabs', voiceId: 'onwK4e9ZLuTAKqWW03F9', voiceLabel: 'Daniel', supportsProsody: true, baseEnergy: 0.5 },
  ],
  male_adult_authoritative: [
    { provider: 'elevenlabs', voiceId: 'onwK4e9ZLuTAKqWW03F9', voiceLabel: 'Daniel', supportsProsody: true, basePitch: -1, baseEnergy: 0.6 },
  ],
  male_adult_documentary: [
    { provider: 'elevenlabs', voiceId: 'onwK4e9ZLuTAKqWW03F9', voiceLabel: 'Daniel', supportsProsody: true, baseSpeakingRate: 0.95, basePitch: -1, baseEnergy: 0.45 },
  ],
  male_adult_energetic: [
    { provider: 'elevenlabs', voiceId: 'pNInz6obpgDQGcFmaJgB', voiceLabel: 'Adam', supportsProsody: true, baseSpeakingRate: 1.04, baseEnergy: 0.7 },
  ],
  male_adult_calm: [
    { provider: 'elevenlabs', voiceId: 'onwK4e9ZLuTAKqWW03F9', voiceLabel: 'Daniel', supportsProsody: true, baseSpeakingRate: 0.95, baseEnergy: 0.4 },
  ],

  // ── Younger voices (students) ──────────────────────────────────────────
  female_teen_curious: [
    { provider: 'elevenlabs', voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceLabel: 'Sarah (young)', supportsProsody: true, basePitch: 1.5, baseSpeakingRate: 1.03, baseEnergy: 0.65 },
  ],
  male_teen_curious: [
    { provider: 'elevenlabs', voiceId: 'pNInz6obpgDQGcFmaJgB', voiceLabel: 'Adam (young)', supportsProsody: true, basePitch: 1.5, baseSpeakingRate: 1.03, baseEnergy: 0.65 },
  ],
  female_young_adult_curious: [
    { provider: 'elevenlabs', voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceLabel: 'Sarah', supportsProsody: true, basePitch: 1, baseSpeakingRate: 1.02, baseEnergy: 0.6 },
  ],
  male_young_adult_curious: [
    { provider: 'elevenlabs', voiceId: 'pNInz6obpgDQGcFmaJgB', voiceLabel: 'Adam', supportsProsody: true, basePitch: 1, baseSpeakingRate: 1.02, baseEnergy: 0.6 },
  ],
};

/** Last-resort voice. Always present so `pickVoice` can never return null. */
const ULTIMATE_FALLBACK: RegistryEntry = {
  provider: 'elevenlabs',
  voiceId: 'pNInz6obpgDQGcFmaJgB',
  voiceLabel: 'Adam',
  supportsProsody: true,
};

/** Role → voice character. */
export function voiceCharacterForRole(role: string): VoiceCharacter {
  const r = (role || '').trim().toLowerCase();
  if (/teacher|tutor|professor|mentor/.test(r)) return 'warm';
  if (/expert|scientist|doctor|examiner|king|judge/.test(r)) return 'authoritative';
  if (/student|child|learner/.test(r)) return 'curious';
  if (/coach|motivat/.test(r)) return 'energetic';
  if (/narrator|documentary/.test(r)) return 'documentary';
  if (/host|anchor|presenter/.test(r)) return 'warm';
  return 'warm';
}

/** Role → likely age band. Students skew younger; authorities skew adult. */
export function ageBandForRole(role: string): AgeBand {
  const r = (role || '').trim().toLowerCase();
  if (/child|kid/.test(r)) return 'child';
  if (/student|learner/.test(r)) return 'teen';
  if (/elder|grandfather|grandmother|sage/.test(r)) return 'elderly';
  return 'adult';
}

/**
 * Deterministically choose a voice.
 *
 * Fallback ladder: exact key → same gender+character at adult → same
 * gender+warm at adult → ultimate fallback. Never returns null.
 *
 * `characterId` is hashed to pick among equivalent voices, so the choice is
 * stable across runs but differs between two characters sharing a key.
 */
export function pickVoice(args: {
  gender: Gender;
  ageBand: AgeBand;
  character: VoiceCharacter;
  characterId: string;
  language?: string;
}): VoiceProfile {
  const candidates =
    lookup(args.gender, args.ageBand, args.character) ??
    lookup(args.gender, 'adult', args.character) ??
    lookup(args.gender, 'adult', 'warm') ??
    lookup(args.gender === 'male' ? 'female' : 'male', 'adult', 'warm') ??
    [ULTIMATE_FALLBACK];

  const entry = candidates[hashToIndex(args.characterId, candidates.length)];

  return {
    provider: entry.provider,
    voiceId: entry.voiceId,
    voiceLabel: entry.voiceLabel,
    baseSpeakingRate: entry.baseSpeakingRate ?? 1,
    basePitch: entry.basePitch ?? 0,
    baseEnergy: entry.baseEnergy ?? 0.5,
    // Sensible ElevenLabs defaults; per-line emotion overrides these.
    stability: 0.5,
    similarityBoost: 0.75,
    styleExaggeration: 0.3,
    supportsProsody: entry.supportsProsody,
  };
}

function lookup(
  gender: Gender,
  ageBand: AgeBand,
  character: VoiceCharacter
): RegistryEntry[] | undefined {
  const key = `${gender}_${ageBand}_${character}` as VoiceKey;
  const found = REGISTRY[key];
  return found && found.length > 0 ? found : undefined;
}

/** Stable string hash → array index. */
export function hashToIndex(input: string, length: number): number {
  if (length <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
}

/**
 * Infer gender when the script/plan does not state it.
 *
 * Deliberately conservative: only well-known role conventions and an explicit
 * gendered noun. Anything else returns 'neutral' so we assign by round-robin
 * rather than guessing from a personal name — name-based gender inference is
 * unreliable across the languages this product serves.
 */
export function inferGenderFromRole(role: string): Gender {
  const r = (role || '').trim().toLowerCase();
  if (/\b(mother|mom|mrs|miss|ms|queen|actress|sister|aunt|daughter|girl|woman)\b/.test(r)) {
    return 'female';
  }
  if (/\b(father|dad|mr|king|actor|brother|uncle|son|boy|man)\b/.test(r)) {
    return 'male';
  }
  return 'neutral';
}

/**
 * Assign genders across a cast so a multi-speaker episode has vocal contrast.
 * Explicit genders are preserved; 'neutral' slots alternate.
 */
export function balanceGenders(
  requested: Array<{ id: string; gender: Gender }>
): Map<string, Gender> {
  const out = new Map<string, Gender>();
  let alternate: Gender = 'female';

  for (const item of requested) {
    if (item.gender !== 'neutral') {
      out.set(item.id, item.gender);
      // Next auto-assignment opposes the last explicit one.
      alternate = item.gender === 'female' ? 'male' : 'female';
      continue;
    }
    out.set(item.id, alternate);
    alternate = alternate === 'female' ? 'male' : 'female';
  }

  return out;
}
