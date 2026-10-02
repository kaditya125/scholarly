/**
 * The Question Mixer's internal contract — a declarative blueprint in, a validated, sourced
 * question set out. This is the "one QuestionMixer, not SSCCGLQuestionMixer/JEEMainQuestionMixer"
 * layer: every type here is exam-agnostic by construction (an examId string, never a union of
 * known exams), and behavior comes from data resolved at request time (syllabus, PYQ corpus,
 * pattern analytics), never from a branch on which exam was asked for.
 */

/** How a question actually entered the test. Never inferred after the fact — assigned once, at
 *  the point where the mixer knows the true answer, and carried verbatim from there on. */
export type QuestionSourceType =
  | 'CANONICAL_PYQ'      // Retrieved verbatim from the verified PYQ corpus. Never generated.
  | 'PYQ_PATTERN'        // Newly generated, but grounded in real historical questions' pattern.
  | 'REFERENCE_BOOK'     // Generated/retrieved using actual reference-book passages.
  | 'GENERATED';         // No PYQ or reference evidence was available; model's own knowledge.

/**
 * Where a piece of blueprint data actually came from. The same field ("35 questions in Section A")
 * means something different depending on this — an OFFICIAL count is a contract with the exam
 * body; an OBSERVED count is what the corpus happened to show; an INFERRED count is a guess this
 * system made to fill a gap. Mixing these up is exactly how an inferred number ends up presented
 * as an official one.
 */
export type PatternProvenance = 'OFFICIAL' | 'OBSERVED' | 'INFERRED' | 'UNKNOWN';

export type TestMode =
  | 'PRACTICE'
  | 'PYQ_PRACTICE'
  | 'SMART_MIXED'
  | 'FULL_MOCK'
  | 'WEAK_AREA_DRILL';

export interface SourceDistribution {
  canonicalPyq: number;   // 0-1 fraction
  pyqPattern: number;
  referenceBook: number;
  generated: number;
  /** Where this specific mix came from — a caller-supplied override, the blueprint resolver's
   *  per-mode default, or the last-resort system fallback when nothing else applies. */
  provenance: PatternProvenance;
}

export interface DifficultyDistribution {
  easy: number;    // question counts, not fractions — a blueprint is a concrete allocation
  medium: number;
  hard: number;
  provenance: PatternProvenance;
}

export interface SectionBlueprint {
  sectionId: string;
  name: string;              // e.g. "Quantitative Aptitude", "General Intelligence & Reasoning"
  subjectId?: string;
  syllabusNodeId?: string;   // when the section maps onto a real canonical syllabus node
  questionCount: number;
  marksPerQuestion?: number;
  negativeMarksPerQuestion?: number;
  difficultyDistribution?: DifficultyDistribution;
  sourceDistribution?: SourceDistribution;
  /** Narrowest scope this section's candidates must satisfy, when known. */
  syllabusNodeIds?: string[];
  topicNames?: string[];
}

export interface TestBlueprint {
  examId: string;
  examResolved: boolean;     // false means examId is the caller's raw text — mixer must be honest
  mode: TestMode;
  totalQuestions: number;
  durationMinutes?: number;
  sections: SectionBlueprint[];
  difficultyDistribution?: DifficultyDistribution;
  sourceDistribution?: SourceDistribution;
  questionTypeDistribution?: Record<string, number>;
  markingScheme?: { positiveMark: number; negativeMark: number } | 'UNKNOWN';
  /** Where the section/subject/count structure itself came from. */
  structureProvenance: PatternProvenance;
}

/** A question candidate moving through the mixer — the internal working shape, richer than the
 *  final StoredQuizQuestion it gets narrowed into once accepted. */
export interface QuestionCandidate {
  id: string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  topic: string;
  subject?: string;
  examId?: string;
  syllabusNodeId?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  sourceType: QuestionSourceType;

  // CANONICAL_PYQ / PYQ_PATTERN provenance
  sourcePyqId?: string;
  sourceYear?: number;
  sourceShift?: string;
  sourcePaper?: string;
  canonicalPaperId?: string;
  /** For PYQ_PATTERN: which real questions' pattern informed this one. Never claims to BE them. */
  groundingQuestionIds?: string[];

  // REFERENCE_BOOK provenance
  referenceBookId?: string;
  referenceBookTitle?: string;
  referenceChapter?: string;
  referenceChunkId?: string;

  /** A stable string used for exact/near-duplicate detection — normalized question text, or the
   *  corpus's own contentHash when the candidate is a CANONICAL_PYQ. */
  dedupeKey: string;
}

export interface QuestionMixRequest {
  examQuery: string;              // free text or an already-canonical id; the mixer resolves it
  mode: TestMode;
  questionCount?: number;         // ignored for FULL_MOCK, which takes its count from the blueprint
  subjectIds?: string[];
  syllabusNodeIds?: string[];
  topicNames?: string[];
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  sourceDistribution?: Partial<SourceDistribution>;
  excludeQuestionIds?: string[];
  /** Weak syllabus nodes driving a WEAK_AREA_DRILL — narrows retrieval to exactly these. */
  studentWeakAreas?: { syllabusNodeId?: string; topic: string; subject?: string }[];
  userId: string;
}

export interface MixerTrace {
  examId: string;
  examResolved: boolean;
  mode: TestMode;
  requestedCount: number;
  finalCount: number;
  bySource: Record<QuestionSourceType, number>;
  bySection?: Record<string, number>;
  /** What the (last) section resolved to in the corpus's own vocabulary — for diagnosing "why
   *  did this drill get no PYQs". */
  scope?: { subject: string; topic: string; topicResolved: boolean; subjectOnly: boolean };
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
  retrievalMs: number;
  rankingMs: number;
  generationMs: number;
  validationMs: number;
  totalMs: number;
}

/** Code-generated non-verbal question figures (server-generated SVG; render as <img>). */
export interface QuestionFigure {
  archetype: string;
  seed: number;
  questionSvgs: string[];
  /** Present when the options are figures; `options` then hold their labels (A–D). */
  optionSvgs?: string[];
  answerSource: 'computed';
}
