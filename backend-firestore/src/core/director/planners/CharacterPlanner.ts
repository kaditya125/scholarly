/**
 * CharacterPlanner — resolves the cast and binds each member to a concrete voice.
 *
 * Resolution order (AI_DIRECTOR_ARCHITECTURE §7.1):
 *   1. exact match on (displayName + role) in memory  → reuse voice
 *   2. fuzzy match on (role + gender + ageBand)       → reuse voice, new name
 *   3. no match                                      → assign from VoiceRegistry
 *
 * Memory is an OPTIMISATION for cross-episode consistency. The resolved cast is
 * embedded in the timeline, so a re-render reproduces the original voices even
 * if memory is later mutated — memory is never a render dependency.
 *
 * Gender assignment deliberately avoids inferring from personal names: name→
 * gender inference is unreliable across the languages this product serves, so
 * unspecified genders are alternated for vocal contrast instead.
 */

import { logger } from '../../../utils/logger';
import { CharacterRepository } from '../../../repositories/character.repository';
import type { IPlanner } from '../interfaces';
import {
  CharacterCastSchema,
  buildCharacterId,
  type Character,
  type CharacterCast,
  type PersonalityProfile,
} from '../schema/character.schema';
import type { AgeBand, Gender } from '../schema/common.schema';
import { allowedEmotionsForRole } from '../knowledge/emotionProfiles';
import {
  ageBandForRole,
  balanceGenders,
  inferGenderFromRole,
  pickVoice,
  voiceCharacterForRole,
} from '../knowledge/voiceRegistry';
import type { CharacterHint } from './NarrativeAnalyzer';

export interface CharacterPlannerInput {
  userId: string;
  language: string;
  hints: CharacterHint[];
  /** Existing memory. Injected so the planner stays pure and testable. */
  existingCharacters?: Character[];
  /** Cap on speaking rate from the Producer's accessibility strategy. */
  maxSpeakingRate?: number;
}

export class CharacterPlanner
  implements IPlanner<CharacterPlannerInput, CharacterCast>
{
  readonly name = 'CharacterPlanner';

  async plan(input: CharacterPlannerInput): Promise<CharacterCast> {
    try {
      return this.resolve(input);
    } catch (err: any) {
      logger.warn('[Director] CharacterPlanner failed; using fallback', {
        error: err?.message,
      });
      return this.fallback(input);
    }
  }

  /** Single narrator, neutral voice. Always valid. */
  fallback(input: CharacterPlannerInput): CharacterCast {
    const now = Date.now();
    const id = buildCharacterId('Narrator', 'Narrator');
    const character: Character = {
      id,
      displayName: 'Narrator',
      role: 'Narrator',
      gender: 'neutral',
      ageBand: 'adult',
      accent: 'neutral',
      language: input.language,
      voice: pickVoice({
        gender: 'female',
        ageBand: 'adult',
        character: 'documentary',
        characterId: id,
      }),
      personality: defaultPersonality('Narrator'),
      defaultEmotion: 'neutral',
      allowedEmotions: allowedEmotionsForRole('Narrator'),
      createdAt: now,
      lastUsedAt: now,
      episodeCount: 0,
    };

    return CharacterCastSchema.parse({
      characters: [character],
      narratorId: id,
      primarySpeakerId: id,
    });
  }

  // ── Core resolution ─────────────────────────────────────────────────────

  private resolve(input: CharacterPlannerInput): CharacterCast {
    const hints = input.hints.length ? input.hints : [
      { name: 'Narrator', role: 'Narrator', gender: 'neutral' as const, ageBand: 'adult' as const, personalityNote: '' },
    ];
    const memory = input.existingCharacters ?? [];
    const now = Date.now();

    // Pass 1 — decide gender for every hint, so contrast is balanced across the
    // whole cast rather than chosen per-character in isolation.
    const withGender = hints.map((h) => {
      const explicit: Gender =
        h.gender !== 'neutral' ? h.gender : inferGenderFromRole(h.role);
      return { hint: h, id: buildCharacterId(h.name, h.role), gender: explicit };
    });
    const genderById = balanceGenders(
      withGender.map((w) => ({ id: w.id, gender: w.gender }))
    );

    // Pass 2 — build each character, reusing memory where possible.
    const characters: Character[] = withGender.map(({ hint, id }) => {
      const gender = genderById.get(id) ?? 'neutral';
      const ageBand: AgeBand =
        hint.ageBand !== 'adult' ? hint.ageBand : ageBandForRole(hint.role);

      const remembered = CharacterRepository.match(memory, {
        displayName: hint.name,
        role: hint.role,
        gender,
        ageBand,
        language: input.language,
      });

      // Reuse the remembered VOICE (that is the consistency guarantee) while
      // adopting the current episode's name and emotion range.
      const voice = remembered
        ? remembered.voice
        : pickVoice({
            gender,
            ageBand,
            character: voiceCharacterForRole(hint.role),
            characterId: id,
            language: input.language,
          });

      // Honour the Producer's accessibility cap.
      const cappedVoice =
        typeof input.maxSpeakingRate === 'number'
          ? { ...voice, baseSpeakingRate: Math.min(voice.baseSpeakingRate, input.maxSpeakingRate) }
          : voice;

      return {
        id: remembered?.id ?? id,
        displayName: hint.name,
        role: hint.role,
        gender,
        ageBand,
        accent: remembered?.accent ?? accentForLanguage(input.language),
        language: input.language,
        voice: cappedVoice,
        personality: remembered?.personality ?? defaultPersonality(hint.role, hint.personalityNote),
        defaultEmotion: remembered?.defaultEmotion ?? 'neutral',
        allowedEmotions: allowedEmotionsForRole(hint.role),
        avatar: remembered?.avatar ?? {
          appearancePrompt: buildAppearancePrompt(hint, gender, ageBand),
        },
        createdAt: remembered?.createdAt ?? now,
        lastUsedAt: now,
        episodeCount: (remembered?.episodeCount ?? 0) + 1,
      };
    });

    // Narrator preference: an explicit Narrator role, else the first speaker.
    const narrator = characters.find((c) => /narrator/i.test(c.role));
    // Primary speaker: whoever is most likely to carry the episode.
    const primary =
      characters.find((c) => /teacher|host|narrator|tutor|mentor/i.test(c.role)) ??
      characters[0];

    return CharacterCastSchema.parse({
      characters,
      narratorId: narrator?.id,
      primarySpeakerId: primary.id,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Role → baseline personality. Overridden by remembered characters. */
export function defaultPersonality(
  role: string,
  note = ''
): PersonalityProfile {
  const r = (role || '').toLowerCase();

  if (/teacher|tutor|professor/.test(r)) {
    return { warmth: 0.8, authority: 0.75, energy: 0.55, humour: 0.3, formality: 0.45, speakingStyle: 'conversational', ...(note ? { verbalTics: [] } : {}) };
  }
  if (/student|learner|child/.test(r)) {
    return { warmth: 0.7, authority: 0.2, energy: 0.7, humour: 0.4, formality: 0.25, speakingStyle: 'conversational' };
  }
  if (/narrator/.test(r)) {
    return { warmth: 0.55, authority: 0.7, energy: 0.45, humour: 0.15, formality: 0.7, speakingStyle: 'storytelling' };
  }
  if (/expert|scientist|doctor/.test(r)) {
    return { warmth: 0.5, authority: 0.85, energy: 0.45, humour: 0.15, formality: 0.75, speakingStyle: 'lecturing' };
  }
  if (/host|anchor|presenter/.test(r)) {
    return { warmth: 0.75, authority: 0.5, energy: 0.7, humour: 0.45, formality: 0.4, speakingStyle: 'interviewing' };
  }
  if (/coach/.test(r)) {
    return { warmth: 0.7, authority: 0.6, energy: 0.85, humour: 0.35, formality: 0.3, speakingStyle: 'conversational' };
  }

  return { warmth: 0.6, authority: 0.5, energy: 0.5, humour: 0.3, formality: 0.5, speakingStyle: 'conversational' };
}

/** Accent hint for the voice layer, from the episode language. */
export function accentForLanguage(language: string): string {
  const l = (language || '').toLowerCase();
  if (l === 'hindi' || l === 'hinglish' || l === 'sanskrit') return 'indian';
  return 'neutral';
}

/** Future avatar prompt — captured now, unused in v1. */
function buildAppearancePrompt(
  hint: CharacterHint,
  gender: Gender,
  ageBand: AgeBand
): string {
  const age = ageBand.replace(/_/g, ' ');
  const genderWord =
    gender === 'neutral' ? 'person' : gender === 'male' ? 'man' : 'woman';
  const note = hint.personalityNote ? `, ${hint.personalityNote}` : '';
  return `Portrait of a ${age} ${genderWord} playing the role of ${hint.role}${note}, neutral background, soft lighting, photorealistic`;
}

export const characterPlanner = new CharacterPlanner();
