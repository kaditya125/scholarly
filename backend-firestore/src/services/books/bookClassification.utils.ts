/**
 * Deterministic pieces of book-question classification (phase 2): difficulty scoring, the question
 * fingerprint, validation/normalisation of model output, and verification of syllabus mappings.
 * No I/O and no model calls — the model proposes, these functions decide what is accepted.
 */
import { createHash } from 'crypto';

export const CLASSIFICATION_VERSION = 'taxonomy-v1.0';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'VERY_HARD';

/** Spec §11: difficulty as a vector, not a label. All dimensions are 0–1. */
export interface DifficultyProfile {
  conceptualComplexity: number;
  calculationComplexity: number;
  reasoningDepth: number;
  linguisticComplexity: number;
  distractorDifficulty: number;
  /** How likely the item is to be read two ways — tracked, but not part of the difficulty score. */
  ambiguityRisk: number;
}

export interface ChapterArchetype {
  id: string;            // UPPER_SNAKE, unique within the chapter
  name: string;
  subtopicId: string;
  description: string;
  solutionStrategy: string[];
  answerType: 'NUMERIC' | 'OPTION_TEXT' | 'SEQUENCE_TERM' | 'CODE' | 'RELATION' | 'VERBAL' | 'LOGICAL' | 'OTHER';
}

export interface ChapterTaxonomy {
  subtopics: { id: string; name: string }[];
  archetypes: ChapterArchetype[];
}

export interface QuestionClassification {
  subtopicId: string;
  subtopicName: string;
  archetype: string;
  concepts: string[];
  skills: string[];
  formulas: string[];
  solutionStrategy: string[];
  answerType: ChapterArchetype['answerType'];
  difficultyProfile: DifficultyProfile;
  estimatedDifficultyScore: number;
  difficulty: Difficulty;
  generationConstraints: Record<string, boolean | number | string>;
  fingerprint: string;
}

const WEIGHTS: Record<Exclude<keyof DifficultyProfile, 'ambiguityRisk'>, number> = {
  conceptualComplexity: 0.25,
  calculationComplexity: 0.2,
  reasoningDepth: 0.25,
  linguisticComplexity: 0.1,
  distractorDifficulty: 0.2,
};

const clamp01 = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : NaN;
};

/** Weighted score in [0, 1], rounded to 2 dp. */
export function difficultyScore(p: DifficultyProfile): number {
  const s = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce((acc, k) => acc + WEIGHTS[k] * p[k], 0);
  // + epsilon: 0.575 * 100 is 57.4999… in floating point and would round down.
  return Math.round((s + Number.EPSILON) * 100) / 100;
}

export function difficultyLabel(score: number): Difficulty {
  if (score < 0.35) return 'EASY';
  if (score < 0.6) return 'MEDIUM';
  if (score < 0.8) return 'HARD';
  return 'VERY_HARD';
}

/** Spec §7: same family ⇒ same fingerprint. Order-insensitive in the strategy text's wording. */
export function questionFingerprint(parts: { bookId: string; chapterName: string; archetype: string; solutionStrategy: string[]; difficulty: Difficulty; answerType: string; optionCount: number }): string {
  const strategy = parts.solutionStrategy.map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).join(' > ');
  return createHash('sha256')
    .update([parts.bookId, parts.chapterName.toLowerCase(), parts.archetype, strategy, parts.difficulty, parts.answerType, `mcq${parts.optionCount}`].join('|'))
    .digest('hex')
    .slice(0, 20);
}

const toUpperSnake = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const strList = (v: unknown, max = 8) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : []);

/** Accept a model-proposed chapter taxonomy only if it's well-formed; normalise ids. */
export function normaliseTaxonomy(raw: any): ChapterTaxonomy | { error: string } {
  const subtopics = (Array.isArray(raw?.subtopics) ? raw.subtopics : [])
    .map((s: any) => ({ id: toUpperSnake(s.id || s.name), name: String(s.name || s.id || '').trim() }))
    .filter((s: any) => s.id && s.name);
  const subIds = new Set(subtopics.map((s: any) => s.id));
  const seen = new Set<string>();
  const archetypes: ChapterArchetype[] = [];
  for (const a of Array.isArray(raw?.archetypes) ? raw.archetypes : []) {
    const id = toUpperSnake(a.id || a.name);
    if (!id || seen.has(id)) continue;
    const subtopicId = toUpperSnake(a.subtopicId);
    if (!subIds.has(subtopicId)) continue;
    seen.add(id);
    archetypes.push({
      id, subtopicId,
      name: String(a.name || id).trim(),
      description: String(a.description || '').trim(),
      solutionStrategy: strList(a.solutionStrategy, 6),
      answerType: (['NUMERIC', 'OPTION_TEXT', 'SEQUENCE_TERM', 'CODE', 'RELATION', 'VERBAL', 'LOGICAL', 'OTHER'].includes(a.answerType) ? a.answerType : 'OTHER') as ChapterArchetype['answerType'],
    });
  }
  // One archetype is legitimate for single-format chapters (assertion–reason, cubes & dice); OTHER is
  // always added below, so there are still two buckets.
  if (subtopics.length === 0 || archetypes.length < 1) return { error: `taxonomy too thin: ${subtopics.length} subtopics, ${archetypes.length} archetypes` };
  // Every question must be classifiable: an explicit catch-all keeps unusual items out of forced buckets.
  if (!seen.has('OTHER')) archetypes.push({ id: 'OTHER', name: 'Other', subtopicId: subtopics[0].id, description: 'Does not fit the archetypes above.', solutionStrategy: [], answerType: 'OTHER' });
  return { subtopics, archetypes };
}

/**
 * Extend a chapter taxonomy with archetypes found among its OTHER questions. Existing archetypes
 * and ids are kept exactly (already-classified questions stay valid); only genuinely new ids are
 * added, and OTHER stays last as the catch-all.
 */
export function mergeTaxonomy(base: ChapterTaxonomy, extension: any): ChapterTaxonomy {
  const ext = normaliseTaxonomy({
    subtopics: [...base.subtopics, ...(Array.isArray(extension?.subtopics) ? extension.subtopics : [])],
    archetypes: [...(Array.isArray(extension?.archetypes) ? extension.archetypes : []), { id: 'X_PLACEHOLDER_A', subtopicId: base.subtopics[0].id }, { id: 'X_PLACEHOLDER_B', subtopicId: base.subtopics[0].id }],
  });
  if ('error' in ext) return base;
  const subtopics = [...base.subtopics];
  for (const s of ext.subtopics) if (!subtopics.some((x) => x.id === s.id)) subtopics.push(s);
  const kept = base.archetypes.filter((a) => a.id !== 'OTHER');
  const added = ext.archetypes.filter((a) => !a.id.startsWith('X_PLACEHOLDER') && a.id !== 'OTHER' && !kept.some((k) => k.id === a.id));
  const other = base.archetypes.find((a) => a.id === 'OTHER')!;
  return { subtopics, archetypes: [...kept, ...added, other] };
}

/** Accept a model-proposed per-question classification against the chapter's fixed taxonomy. */
export function normaliseClassification(
  raw: any,
  ctx: { bookId: string; chapterName: string; optionCount: number; taxonomy: ChapterTaxonomy },
): QuestionClassification | { error: string } {
  const archetypeId = toUpperSnake(raw?.archetype);
  const archetype = ctx.taxonomy.archetypes.find((a) => a.id === archetypeId);
  if (!archetype) return { error: `unknown archetype "${raw?.archetype}"` };
  const d = raw?.difficultyProfile || {};
  const profile: DifficultyProfile = {
    conceptualComplexity: clamp01(d.conceptualComplexity),
    calculationComplexity: clamp01(d.calculationComplexity),
    reasoningDepth: clamp01(d.reasoningDepth),
    linguisticComplexity: clamp01(d.linguisticComplexity),
    distractorDifficulty: clamp01(d.distractorDifficulty),
    ambiguityRisk: clamp01(d.ambiguityRisk),
  };
  if (Object.values(profile).some((v) => Number.isNaN(v))) return { error: 'difficulty profile incomplete' };
  const concepts = strList(raw?.concepts);
  if (concepts.length === 0) return { error: 'no concepts' };

  const score = difficultyScore(profile);
  const difficulty = difficultyLabel(score);
  const solutionStrategy = strList(raw?.solutionStrategy, 6).length ? strList(raw?.solutionStrategy, 6) : archetype.solutionStrategy;
  const subtopic = ctx.taxonomy.subtopics.find((s) => s.id === archetype.subtopicId)!;
  const constraints: Record<string, boolean | number | string> = {};
  for (const [k, v] of Object.entries(raw?.generationConstraints || {})) {
    if (['boolean', 'number', 'string'].includes(typeof v) && Object.keys(constraints).length < 10) constraints[k] = v as any;
  }
  return {
    subtopicId: subtopic.id,
    subtopicName: subtopic.name,
    archetype: archetype.id,
    concepts,
    skills: strList(raw?.skills),
    formulas: strList(raw?.formulas, 5),
    solutionStrategy,
    answerType: archetype.answerType,
    difficultyProfile: profile,
    estimatedDifficultyScore: score,
    difficulty,
    generationConstraints: constraints,
    fingerprint: questionFingerprint({ bookId: ctx.bookId, chapterName: ctx.chapterName, archetype: archetype.id, solutionStrategy, difficulty, answerType: archetype.answerType, optionCount: ctx.optionCount }),
  };
}

/** Loose text key for phrase verification. */
const loose = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(\w{3,})s\b/g, '$1').replace(/\s+/g, ' ').trim();

/**
 * A syllabus mapping is accepted only if the phrase the model cites actually occurs in the node's
 * text — the model may pick the node, but it can't invent coverage the syllabus doesn't state.
 */
export function phraseInNode(matchedPhrase: string, nodeLabel: string): boolean {
  const p = loose(matchedPhrase);
  return p.length >= 3 && loose(nodeLabel).includes(p);
}
