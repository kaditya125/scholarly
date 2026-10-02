/**
 * One entry point for code-generated non-verbal questions, in one normalised shape, so whatever
 * serves them (the question mixer's book-grounded slot) needs no per-archetype handling.
 *
 * Every archetype here computes its answer from figure data; none asks a model. The archetype ids
 * match those assigned to the book's own figure questions (12-ingest-figure-questions), which is
 * how a book seed and the generator that makes variants of it are paired.
 */
import { generateReflectionQuestion } from './mirrorImage';
import { generateFigureSeriesQuestion } from './figureSeries';
import { generatePunchQuestion } from './punchedHoles';
import { generateDiceQuestion } from './dice';
import { generateCountingQuestion } from './countingFigures';

export type FigureArchetype = 'MIRROR_IMAGE' | 'WATER_IMAGE' | 'FIGURE_SERIES' | 'PAPER_CUTTING' | 'CUBES_AND_DICE' | 'FIGURE_COUNTING';

export const FIGURE_ARCHETYPES: FigureArchetype[] = ['MIRROR_IMAGE', 'WATER_IMAGE', 'FIGURE_SERIES', 'PAPER_CUTTING', 'CUBES_AND_DICE', 'FIGURE_COUNTING'];

export interface FigureQuestion {
  archetype: FigureArchetype;
  seed: number;
  prompt: string;
  /** Figures that make up the question, in order (problem figures, fold steps, die positions…). */
  questionSvgs: string[];
  /** Exactly one of optionSvgs / optionTexts is set. */
  optionSvgs?: string[];
  optionTexts?: string[];
  answerIndex: number;
  explanation: string;
  /** How the answer was established — always computed, never model-judged. */
  answerSource: 'computed';
}

export function generateFigureQuestion(archetype: FigureArchetype, seed: number): FigureQuestion {
  const base = { archetype, seed, answerSource: 'computed' as const };
  switch (archetype) {
    case 'MIRROR_IMAGE':
    case 'WATER_IMAGE': {
      const q = generateReflectionQuestion(archetype, seed);
      return { ...base, prompt: q.prompt, questionSvgs: [q.questionSvg], optionSvgs: q.optionSvgs, answerIndex: q.answerIndex, explanation: q.explanation };
    }
    case 'FIGURE_SERIES': {
      const q = generateFigureSeriesQuestion(seed);
      return { ...base, prompt: q.prompt, questionSvgs: q.problemSvgs, optionSvgs: q.optionSvgs, answerIndex: q.answerIndex, explanation: q.explanation };
    }
    case 'PAPER_CUTTING': {
      const q = generatePunchQuestion(seed);
      return { ...base, prompt: q.prompt, questionSvgs: q.stepSvgs, optionSvgs: q.optionSvgs, answerIndex: q.answerIndex, explanation: q.explanation };
    }
    case 'CUBES_AND_DICE': {
      const q = generateDiceQuestion(seed);
      return { ...base, prompt: q.prompt, questionSvgs: q.viewSvgs, optionTexts: q.options.map(String), answerIndex: q.answerIndex, explanation: q.explanation };
    }
    case 'FIGURE_COUNTING': {
      const q = generateCountingQuestion(seed);
      return { ...base, prompt: q.prompt, questionSvgs: [q.figureSvg], optionTexts: q.options.map(String), answerIndex: q.answerIndex, explanation: q.explanation };
    }
  }
}

// ── serving: topic → archetype, and mixer candidates ─────────────────────────────────────────

const TOPIC_ARCHETYPES: [RegExp, FigureArchetype[]][] = [
  [/water[\s-]*image/i, ['WATER_IMAGE']],
  [/mirror/i, ['MIRROR_IMAGE']],
  [/paper\s*(cutting|folding)|punch(ed)?\s*hole/i, ['PAPER_CUTTING']],
  // Not bare "cube": Quant's "Square Roots And Cube Roots" must never become a dice drill.
  [/\bdice\b/i, ['CUBES_AND_DICE']],
  // Not "analytical reasoning": in SSC usage that is also a verbal-puzzle topic.
  [/counting\s*(of\s*)?(figures?|triangles|squares|rectangles)|figure\s*counting/i, ['FIGURE_COUNTING']],
  [/(figure|figural|non[\s-]*verbal)\s*series|series\s*\(?\s*(figure|non[\s-]*verbal)/i, ['FIGURE_SERIES']],
  [/non[\s-]*verbal/i, FIGURE_ARCHETYPES],
];

/** The generator(s) that can serve a drill topic, or null when the topic isn't a figure topic. */
export function figureArchetypesForTopic(topic: string): FigureArchetype[] | null {
  for (const [re, archetypes] of TOPIC_ARCHETYPES) if (re.test(topic || '')) return archetypes;
  return null;
}

const CHAPTER: Record<FigureArchetype, string> = {
  MIRROR_IMAGE: 'Mirror-Images', WATER_IMAGE: 'Water-Images', FIGURE_SERIES: 'Series',
  PAPER_CUTTING: 'Paper Cutting', CUBES_AND_DICE: 'Cubes And Dice', FIGURE_COUNTING: 'Analytical Reasoning',
};

/**
 * `count` generated figure questions as question-mixer candidates. Labelled as book-grounded
 * practice (the S. Chand non-verbal patterns) with the archetype and seed recorded, so any
 * question can be regenerated exactly for audit.
 */
export function figureCandidates(archetypes: FigureArchetype[], count: number, examId: string, subject: string, topic: string, seedSource: () => number) {
  return Array.from({ length: count }, (_, i) => {
    const archetype = archetypes[i % archetypes.length];
    const seed = seedSource();
    const q = generateFigureQuestion(archetype, seed);
    return {
      id: `fig_${archetype.toLowerCase()}_${seed}`,
      text: q.prompt,
      options: q.optionTexts ?? ['A', 'B', 'C', 'D'],
      correctAnswerIndex: q.answerIndex,
      explanation: q.explanation,
      topic,
      subject,
      examId,
      sourceType: 'REFERENCE_BOOK' as const,
      referenceBookId: 'schand_reasoning',
      referenceBookTitle: 'Book-grounded practice (generated)',
      referenceChapter: CHAPTER[archetype],
      referenceChunkId: `figure:${archetype}:${seed}`,
      figure: { archetype, seed, questionSvgs: q.questionSvgs, optionSvgs: q.optionSvgs, answerSource: 'computed' as const },
      dedupeKey: `figure:${archetype}:${seed}`,
    };
  });
}
