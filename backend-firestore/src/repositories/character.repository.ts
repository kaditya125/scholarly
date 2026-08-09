/**
 * Persistent character memory.
 *
 * Stored per-user at `users/{userId}/characters/{characterId}` so a recurring
 * character ("Teacher Priya") keeps the same voice across episodes.
 *
 * IMPORTANT: this is an OPTIMISATION, never a render dependency. Every
 * MasterTimeline embeds a full cast snapshot, so a deleted or mutated memory
 * document cannot change how an existing episode re-renders
 * (AI_DIRECTOR_ARCHITECTURE.md §7.1).
 */

import { db } from '../config/firebase';
import { logger } from '../utils/logger';
import {
  CharacterSchema,
  type Character,
} from '../core/director/schema/character.schema';

export interface CharacterMatchCriteria {
  displayName?: string;
  role?: string;
  gender?: Character['gender'];
  ageBand?: Character['ageBand'];
  language?: string;
}

export class CharacterRepository {
  private collection(userId: string) {
    return db.collection('users').doc(userId).collection('characters');
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  async save(userId: string, character: Character): Promise<void> {
    const sanitized = JSON.parse(JSON.stringify(character));
    await this.collection(userId).doc(character.id).set(sanitized);
  }

  /** Upsert several characters. Failures are logged, never thrown. */
  async saveMany(userId: string, characters: Character[]): Promise<void> {
    await Promise.all(
      characters.map((c) =>
        this.save(userId, c).catch((err) =>
          logger.warn('[CharacterRepository] Failed to persist character', {
            userId,
            characterId: c.id,
            error: err?.message,
          })
        )
      )
    );
  }

  /** Record that a character was used in another episode. */
  async touch(userId: string, characterId: string): Promise<void> {
    try {
      const existing = await this.get(userId, characterId);
      if (!existing) return;
      await this.collection(userId)
        .doc(characterId)
        .set(
          {
            lastUsedAt: Date.now(),
            episodeCount: (existing.episodeCount ?? 0) + 1,
          },
          { merge: true }
        );
    } catch (err: any) {
      logger.warn('[CharacterRepository] touch failed', {
        userId,
        characterId,
        error: err?.message,
      });
    }
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async get(userId: string, characterId: string): Promise<Character | null> {
    const doc = await this.collection(userId).doc(characterId).get();
    if (!doc.exists) return null;

    const parsed = CharacterSchema.safeParse(doc.data());
    if (!parsed.success) {
      logger.warn('[CharacterRepository] Stored character failed validation', {
        userId,
        characterId,
      });
      return null;
    }
    return parsed.data;
  }

  /**
   * All characters for a user. Returns an empty array on any failure so the
   * CharacterPlanner can always proceed by creating a fresh cast.
   */
  async listByUser(userId: string): Promise<Character[]> {
    try {
      const snap = await this.collection(userId).get();
      const out: Character[] = [];
      for (const doc of snap.docs) {
        const parsed = CharacterSchema.safeParse(doc.data());
        if (parsed.success) out.push(parsed.data);
      }
      return out.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
    } catch (err: any) {
      logger.warn('[CharacterRepository] listByUser failed', {
        userId,
        error: err?.message,
      });
      return [];
    }
  }

  async delete(userId: string, characterId: string): Promise<void> {
    await this.collection(userId).doc(characterId).delete();
  }

  // ── Matching ──────────────────────────────────────────────────────────────

  /**
   * Resolution order from AI_DIRECTOR_ARCHITECTURE.md §7.1:
   *   1. exact (displayName + role)
   *   2. fuzzy (role + gender + ageBand)  — reuse the voice, adopt the new name
   *   3. null → caller creates a new character
   *
   * Pure over a supplied list so it is unit-testable without Firestore.
   */
  static match(
    candidates: Character[],
    criteria: CharacterMatchCriteria
  ): Character | null {
    const norm = (s?: string) => (s || '').trim().toLowerCase();

    if (criteria.displayName && criteria.role) {
      const exact = candidates.find(
        (c) =>
          norm(c.displayName) === norm(criteria.displayName) &&
          norm(c.role) === norm(criteria.role)
      );
      if (exact) return exact;
    }

    if (criteria.role) {
      const fuzzy = candidates.find(
        (c) =>
          norm(c.role) === norm(criteria.role) &&
          (criteria.gender ? c.gender === criteria.gender : true) &&
          (criteria.ageBand ? c.ageBand === criteria.ageBand : true) &&
          (criteria.language ? norm(c.language) === norm(criteria.language) : true)
      );
      if (fuzzy) return fuzzy;
    }

    return null;
  }

  /** Instance convenience wrapper over the static matcher. */
  async findMatch(
    userId: string,
    criteria: CharacterMatchCriteria
  ): Promise<Character | null> {
    const all = await this.listByUser(userId);
    return CharacterRepository.match(all, criteria);
  }
}

export const characterRepository = new CharacterRepository();
