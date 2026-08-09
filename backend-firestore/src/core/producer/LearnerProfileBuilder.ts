/**
 * LearnerProfileBuilder — assembles a LearnerProfile from services that already
 * exist.
 *
 * This is a COMPOSER, not a new source of truth. It reads:
 *   - StudentContextService.aggregateContext()  → profile / memory / analytics / stats
 *   - masteryEngine.getWeakConcepts()           → concepts needing revision
 *
 * Nothing is written. Nothing existing is modified.
 *
 * Failure policy: every external read is best-effort. A learner with no history
 * must still get a usable plan, so a total data blackout degrades to a sane
 * default profile rather than failing the episode.
 */

import { logger } from '../../utils/logger';
import { StudentContextService } from '../../services/studentContext.service';
import { masteryEngine } from '../intelligence/MasteryEngine';
import {
  LearnerProfileSchema,
  type DifficultyBand,
  type LearnerProfile,
  type LearningModality,
} from './schema/producerPlan.schema';

export interface LearnerProfileInput {
  userId: string;
  language: string;
  /** Topics distilled from the source, used when memory has no weak topics. */
  focusTopics?: string[];
}

export class LearnerProfileBuilder {
  constructor(
    private readonly studentContext: StudentContextService = new StudentContextService()
  ) {}

  async build(input: LearnerProfileInput): Promise<LearnerProfile> {
    const { userId, language } = input;

    // Both reads are independent — run them together and tolerate either failing.
    const [context, weakConcepts] = await Promise.all([
      this.studentContext.aggregateContext(userId).catch((err) => {
        logger.warn('[LearnerProfileBuilder] aggregateContext failed', {
          userId,
          error: err?.message,
        });
        return null;
      }),
      masteryEngine.getWeakConcepts(userId, 0.5, 8).catch(() => [] as string[]),
    ]);

    const stats = context?.stats ?? null;
    const memory = context?.memory ?? null;
    const analytics = context?.analytics ?? null;

    // Prefer explicitly-tracked weak topics; fall back to mastery-derived weak
    // concepts; finally fall back to the source's own focus topics.
    const weakTopics = dedupe([
      ...(memory?.weakTopics ?? []),
      ...weakConcepts,
      ...(memory?.weakTopics?.length ? [] : input.focusTopics ?? []),
    ]).slice(0, 8);

    const profile: LearnerProfile = {
      userId,
      activeExam: stats?.activeExam || context?.profile?.targetExam || undefined,
      // `goal` is either an exam ("NEET") or a class ("Class 10") — the closest
      // thing the profile has to a grade level.
      gradeLevel: context?.profile?.goal || undefined,
      difficultyBand: mapDifficultyBand(
        stats?.difficultyLevel,
        memory?.comprehensionDepth,
        context?.profile?.preparationLevel
      ),
      masteryLevel: normalizePercentage(analytics?.masteryPercentage),
      weakTopics,
      strongTopics: dedupe(memory?.strongTopics ?? []).slice(0, 8),
      preferredModalities: mapModalities(memory?.preferredModes),
      attentionSpanMinutes: estimateAttentionSpan(memory?.learningSpeed),
      language,
      personalizationSummary: buildSummary({
        exam: stats?.activeExam,
        difficulty: stats?.difficultyLevel,
        mastery: analytics?.masteryPercentage,
        weakTopics,
      }),
    };

    // Parse so downstream code can rely on defaults being applied.
    return LearnerProfileSchema.parse(profile);
  }

  /** Deterministic fallback for when the Producer must proceed with no data. */
  static fallback(userId: string, language: string): LearnerProfile {
    return LearnerProfileSchema.parse({
      userId,
      language,
      difficultyBand: 'intermediate',
      weakTopics: [],
      strongTopics: [],
      preferredModalities: [],
      personalizationSummary: 'General audience — no learner history available.',
    });
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers (pure — unit-tested directly)
// ---------------------------------------------------------------------------

/**
 * Three sources disagree on casing and authority:
 *   - `stats.difficultyLevel`      capitalised ('Beginner'), user-declared
 *   - `profile.preparationLevel`   lowercase, self-assessed at onboarding
 *   - `memory.comprehensionDepth`  lowercase, inferred from behaviour
 *
 * Precedence is most-explicit first: an active setting beats an onboarding
 * answer, which beats a behavioural inference.
 */
export function mapDifficultyBand(
  statsLevel?: string,
  comprehensionDepth?: string,
  preparationLevel?: string
): DifficultyBand {
  const raw = (statsLevel || preparationLevel || comprehensionDepth || '')
    .trim()
    .toLowerCase();
  switch (raw) {
    case 'beginner':
      return 'beginner';
    case 'advanced':
      return 'advanced';
    case 'expert':
      return 'expert';
    case 'intermediate':
      return 'intermediate';
    default:
      return 'intermediate';
  }
}

/** `memory.preferredModes` is free-form; map only what we recognise. */
export function mapModalities(modes?: string[]): LearningModality[] {
  if (!modes || modes.length === 0) return [];
  const out = new Set<LearningModality>();
  for (const mode of modes) {
    const m = mode.trim().toLowerCase();
    if (/audio|listen|podcast|voice/.test(m)) out.add('auditory');
    if (/visual|diagram|video|image|chart/.test(m)) out.add('visual');
    if (/read|text|note|written/.test(m)) out.add('reading');
    if (/practice|hands|kinesthetic|doing|exercise/.test(m)) out.add('kinesthetic');
  }
  return [...out];
}

/**
 * Attention span drives pacing and recap frequency. These are deliberately
 * conservative: under-estimating produces a tighter episode, which is the safer
 * failure mode for an educational product.
 */
export function estimateAttentionSpan(
  learningSpeed?: 'slow' | 'medium' | 'fast'
): number {
  switch (learningSpeed) {
    case 'slow':
      return 8;
    case 'fast':
      return 20;
    case 'medium':
    default:
      return 12;
  }
}

/** `masteryPercentage` arrives as 0..100; the schema wants 0..1. */
export function normalizePercentage(pct?: number): number | undefined {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return undefined;
  const scaled = pct > 1 ? pct / 100 : pct;
  return Math.max(0, Math.min(1, scaled));
}

function buildSummary(args: {
  exam?: string;
  difficulty?: string;
  mastery?: number;
  weakTopics: string[];
}): string {
  const exam = args.exam || 'general study';
  const parts: string[] = [`Tailored for ${exam}`];
  if (args.difficulty) parts.push(`at ${args.difficulty.toLowerCase()} level`);
  if (typeof args.mastery === 'number' && Number.isFinite(args.mastery)) {
    parts.push(`(~${Math.round(args.mastery > 1 ? args.mastery : args.mastery * 100)}% mastery)`);
  }
  let summary = parts.join(' ') + '.';
  if (args.weakTopics.length) {
    summary += ` Emphasising: ${args.weakTopics.slice(0, 3).join(', ')}.`;
  }
  return summary;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = (item || '').trim();
    if (!key) continue;
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(key);
  }
  return out;
}

export const learnerProfileBuilder = new LearnerProfileBuilder();
