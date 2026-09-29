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
