/**
 * UserMetadataOverrideGuard
 * Phase 2D: User Override Protection Layer
 *
 * Guarantees that user-provided metadata always takes priority over
 * AI-generated metadata. User values are tagged with source: 'user'
 * and are NEVER overwritten during automated reprocessing.
 *
 * Contract:
 *   USER METADATA > AI METADATA
 *
 * On every reprocessing run, this guard:
 *   1. Loads existing user overrides from Firestore (if persisted)
 *   2. Merges AI metadata into the result
 *   3. Stamps user overrides on top, unconditionally
 *   4. Never touches a field that has source: 'user'
 */

import { EducationalMetadata, UserMetadataOverrides, ConfidentValue } from '../types';

export class UserMetadataOverrideGuard {
  /**
   * Merges AI-extracted metadata with user overrides.
   * User-provided values win unconditionally and are tagged source: 'user'.
   * AI values for non-overridden fields are preserved with their original
   * confidence and source: 'ai'.
   *
   * @param aiMetadata   AI-extracted metadata (source: 'ai')
   * @param userOverrides User-provided values map (plain key→value)
   * @returns Merged EducationalMetadata where user values take precedence
   */
  merge(
    aiMetadata: EducationalMetadata,
    userOverrides: UserMetadataOverrides
  ): {
    resolved: EducationalMetadata;
    overriddenFields: string[];
  } {
    const resolved: EducationalMetadata = { ...aiMetadata };
    const overriddenFields: string[] = [];

    for (const [key, userValue] of Object.entries(userOverrides)) {
      // User value wins regardless of what AI found
      resolved[key] = {
        value: userValue,
        confidence: 1.0, // User overrides are treated as ground truth
        source: 'user',
      } as ConfidentValue<any>;
      overriddenFields.push(key);
    }

    return { resolved, overriddenFields };
  }

  /**
   * Protects existing user overrides during a reprocessing run.
   * Given previously resolved metadata (which may contain source: 'user' entries)
   * and fresh AI metadata, returns merged metadata that never overwrites user values.
   *
   * @param previousMetadata Existing resolved metadata (may contain user entries)
   * @param freshAiMetadata  Newly extracted AI metadata
   */
  protect(
    previousMetadata: EducationalMetadata,
    freshAiMetadata: EducationalMetadata
  ): {
    resolved: EducationalMetadata;
    protectedFields: string[];
  } {
    const resolved: EducationalMetadata = { ...freshAiMetadata };
    const protectedFields: string[] = [];

    for (const [key, entry] of Object.entries(previousMetadata)) {
      if (entry.source === 'user') {
        // Never overwrite a user-provided field
        resolved[key] = entry;
        protectedFields.push(key);
      }
    }

    return { resolved, protectedFields };
  }

  /**
   * Extracts only user-provided entries from a resolved metadata map.
   * Useful for persisting user overrides independently of AI metadata.
   */
  extractUserOverrides(resolvedMetadata: EducationalMetadata): UserMetadataOverrides {
    const overrides: UserMetadataOverrides = {};
    for (const [key, entry] of Object.entries(resolvedMetadata)) {
      if (entry.source === 'user') {
        overrides[key] = entry.value as string | string[] | number;
      }
    }
    return overrides;
  }
}
