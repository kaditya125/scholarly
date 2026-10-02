import { z } from 'zod';
import { Provenance } from '../runtime/agent.types';

/**
 * Artifacts — the durable things an agent produces (Phase 3).
 *
 * A document artifact is a STRUCTURED spec plus the file rendered from it. Keeping the spec is
 * what makes an artifact re-renderable, quotable and checkable later: Phase 5 verifies a formula
 * chart against chapter text before it is rendered, and "make flashcards from this chart" reads
 * the spec rather than parsing a PDF back.
 */

export const MAX_SECTIONS = 30;
export const MAX_BLOCKS_PER_SECTION = 20;
export const MAX_ITEMS_PER_BLOCK = 60;
export const MAX_SPEC_CHARS = 60_000;

const text = (max: number) => z.string().trim().min(1).max(max);

export const documentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: text(2_000) }),
  z.object({ type: z.literal('bullets'), items: z.array(text(500)).min(1).max(MAX_ITEMS_PER_BLOCK) }),
  z.object({
    type: z.literal('formulae'),
    items: z
      .array(
        z.object({
          formula: text(300),
          meaning: z.string().trim().max(400).optional(),
          /** Where the formula was verified, e.g. "Found in §4.5 of the chapter". */
          note: z.string().trim().max(200).optional(),
        }),
      )
      .min(1)
      .max(MAX_ITEMS_PER_BLOCK),
  }),
  z.object({
    type: z.literal('keyValue'),
    items: z.array(z.object({ label: text(120), value: text(400) })).min(1).max(MAX_ITEMS_PER_BLOCK),
  }),
]);

export const documentSpecSchema = z.object({
  title: text(120),
  subtitle: z.string().trim().max(160).optional(),
  sections: z
    .array(
      z.object({
        heading: text(120),
        blocks: z.array(documentBlockSchema).min(1).max(MAX_BLOCKS_PER_SECTION),
      }),
    )
    .min(1)
    .max(MAX_SECTIONS),
  /** Where the content came from. Rendered on every page footer — never omitted silently. */
  sourceNote: z.string().trim().max(300).optional(),
  footerNote: z.string().trim().max(300).optional(),
});

export type DocumentBlock = z.infer<typeof documentBlockSchema>;
export type DocumentSpec = z.infer<typeof documentSpecSchema>;

export const MAX_CARDS = 60;

/**
 * A flashcard deck. Structured data with no file: the workspace renders it as cards, and a later
 * "quiz me on these" reads it back as it is. `front`/`back` may carry the renderer's formula
 * markup (F_x, v^2), which the card viewer draws as sub- and superscripts.
 */
export const flashcardsSpecSchema = z.object({
  title: text(120),
  /** The artifact these cards were made from, when they were made from one. */
  sourceArtifactId: z.string().optional(),
  cards: z
    .array(
      z.object({
        front: text(300),
        back: text(500),
        /** Marks formula cards, whose text is drawn as notation. */
        kind: z.enum(['formula', 'definition', 'symbol']).optional(),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(MAX_CARDS),
});
export type FlashcardsSpec = z.infer<typeof flashcardsSpecSchema>;

/** The most a student can ask for in one quiz. */
export const MAX_QUIZ_QUESTIONS = 50;
/** A whole real paper's multiple-choice part (a mock test) — kept as the paper has it, not cut to the quiz cap. */
export const MAX_PAPER_QUESTIONS = 90;

/**
 * A quiz (Phase 6). The questions and their answer key live in the student's quiz attempt
 * (`quiz_attempts`, owned by QuizAttemptsService) — the same record the existing quiz page takes,
 * scores server-side and rolls into their stats and weak topics. The artifact never copies the key;
 * it says what the quiz is, how it was made and what the validator checked.
 */
export const quizSpecSchema = z.object({
  title: text(120),
  attemptId: text(120),
  questionCount: z.number().int().min(1).max(MAX_PAPER_QUESTIONS),
  durationMinutes: z.number().int().min(1).max(300),
  topics: z.array(z.object({ topic: text(200), count: z.number().int().min(1) })).min(1).max(40),
  /** How the questions were made, in the student's words ("From your formula chart"). */
  origin: z.array(z.object({ label: text(120), count: z.number().int().min(1) })).min(1).max(8),
  sourceArtifactId: z.string().optional(),
  /** What the validator checked, and how many candidates it rejected for each reason. */
  validation: z
    .object({
      checked: z.number().int().min(0),
      accepted: z.number().int().min(0),
      rejected: z.record(z.string(), z.number().int().min(0)),
    })
    .optional(),
  sourceNote: z.string().trim().max(300).optional(),
});
export type QuizSpec = z.infer<typeof quizSpecSchema>;

/** A place in the material a weak area points back to: "§4.10 Circular motion, p. 15". */
const refSchema = z.object({ label: text(200), page: z.number().int().min(1).optional() });

/**
 * A weakness analysis (Phase 6): what went wrong, where, and how sure the analysis is. Kept as data
 * so "make a revision plan for those weak areas" plans from exactly these areas.
 */
export const reportSpecSchema = z.object({
  title: text(120),
  basis: z.object({
    attempts: z
      .array(z.object({ attemptId: text(120), title: text(200), completedAt: z.string().optional(), accuracy: z.number().min(0).max(100), questions: z.number().int().min(0) }))
      .min(1)
      .max(20),
    questionsAnswered: z.number().int().min(0),
  }),
  weakAreas: z
    .array(
      z.object({
        topic: text(200),
        accuracy: z.number().min(0).max(100),
        correct: z.number().int().min(0),
        total: z.number().int().min(1),
        /** 0–1: how much evidence stands behind this row (few questions → low). */
        confidence: z.number().min(0).max(1),
        examId: z.string().optional(),
        syllabusNodeId: z.string().optional(),
        /** The official syllabus location, when the topic maps onto one. */
        syllabusPath: z.array(text(300)).max(6).optional(),
        /** How the location was found: the questions' own syllabus node, or the topic's name. */
        syllabusMatch: z.enum(['exact', 'name']).optional(),
        refs: z.array(refSchema).max(8).optional(),
      }),
    )
    .max(30),
  strongAreas: z.array(z.object({ topic: text(200), accuracy: z.number().min(0).max(100), total: z.number().int().min(1) })).max(30),
  mistakes: z
    .array(
      z.object({
        question: text(600),
        topic: text(200),
        yourAnswer: z.string().trim().max(400).optional(),
        correctAnswer: text(400),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .max(60),
  recommendations: z.array(z.object({ action: text(300), topic: z.string().trim().max(200).optional() })).max(20),
  sourceArtifactIds: z.array(z.string()).max(10).optional(),
});
export type ReportSpec = z.infer<typeof reportSpecSchema>;

export const STUDY_TASK_KINDS = ['learn', 'revise', 'flashcards', 'practice', 'review', 'test'] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A revision or study plan (Phase 6): dated days of concrete, timed tasks. */
export const studyPlanSpecSchema = z.object({
  title: text(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyMinutes: z.number().int().min(10).max(600),
  days: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        tasks: z
          .array(
            z.object({
              kind: z.enum(STUDY_TASK_KINDS),
              title: text(240),
              minutes: z.number().int().min(5).max(240),
              topic: z.string().trim().max(200).optional(),
              /** Where to do it: a page of the chapter, a flashcard deck, a quiz. */
              ref: z.string().trim().max(240).optional(),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(1)
    .max(90),
  focus: z.array(z.object({ topic: text(200), reason: text(300) })).min(1).max(20),
  sourceArtifactId: z.string().optional(),

  // ── Phase 7: a whole exam's preparation ("Prepare me for SSC CGL in 90 days") ──────────────
  // The dated `days` above are then the first week in detail; the rest is planned week by week.
  exam: z.object({ examId: text(60), name: text(200), scope: z.array(text(200)).max(8), notIncluded: z.array(text(200)).max(8) }).optional(),
  /** How long the plan runs, and where that number came from — never an invented exam date. */
  horizon: z.object({ days: z.number().int().min(1).max(400), endDate: isoDate, source: z.enum(['goal', 'saved_goal', 'default']) }).optional(),
  /** Honest arithmetic: whether a first pass over the syllabus fits the time available. */
  outlook: z
    .object({
      units: z.number().int().min(0),
      scheduled: z.number().int().min(0),
      firstPassHours: z.number().min(0),
      availableHours: z.number().min(0),
      fitsInTime: z.boolean(),
      note: text(500).optional(),
    })
    .optional(),
  weeks: z
    .array(
      z.object({
        week: z.number().int().min(1),
        startDate: isoDate,
        endDate: isoDate,
        phase: z.enum(['learn', 'practise', 'revise']),
        focus: z.array(z.object({ subject: text(160), minutes: z.number().int().min(0), units: z.array(text(200)).max(24) })).max(12),
        milestone: text(600),
      }),
    )
    .max(60)
    .optional(),
  strategy: z.array(z.object({ title: text(120), detail: text(700) })).max(10).optional(),
  sources: z.array(z.object({ label: text(240), url: z.string().url().max(500).optional(), detail: text(300).optional() })).max(8).optional(),
});
export type StudyPlanSpec = z.infer<typeof studyPlanSpecSchema>;

export type ArtifactKind = 'document' | 'flashcards' | 'quiz' | 'report' | 'studyplan';

/** Structured kinds: the spec is the whole artifact (no rendered file). */
export const STRUCTURED_SCHEMAS = {
  flashcards: flashcardsSpecSchema,
  quiz: quizSpecSchema,
  report: reportSpecSchema,
  studyplan: studyPlanSpecSchema,
} as const;
export type StructuredKind = keyof typeof STRUCTURED_SCHEMAS;
export type ArtifactStatus = 'ready' | 'failed';

export interface ArtifactVersion {
  version: number;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  pageCount: number;
  createdAt: number;
}

export interface ArtifactDoc {
  artifactId: string;
  userId: string;
  runId?: string;
  kind: ArtifactKind;
  title: string;
  status: ArtifactStatus;
  /** Provenance of the CONTENT, carried from the tools that produced it. */
  provenance: Provenance;
  /** The structured source of truth; a document's file is a rendering of it. */
  spec: DocumentSpec | FlashcardsSpec | QuizSpec | ReportSpec | StudyPlanSpec;
  currentVersion: number;
  /** Rendered files, one per version. Empty for kinds with no file (flashcards). */
  versions: ArtifactVersion[];
  createdAt: number;
  updatedAt: number;
}

/** What an owner sees. Storage paths stay server-side — files are served through the API only. */
export interface PublicArtifact {
  artifactId: string;
  kind: ArtifactKind;
  title: string;
  status: ArtifactStatus;
  provenance: Provenance;
  runId?: string;
  currentVersion: number;
  pageCount: number;
  sizeBytes: number;
  /** Flashcard decks only. */
  cardCount?: number;
  /** Quizzes only. */
  questionCount?: number;
  /** Reports only: how many weak areas the analysis found. */
  weakAreaCount?: number;
  /** Study plans only. */
  dayCount?: number;
  /** Exam preparation plans only: how many weeks it runs. */
  weekCount?: number;
  createdAt: number;
  updatedAt: number;
  /** Absent for kinds with no file. */
  fileUrl?: string;
}

export function isDocumentSpec(doc: ArtifactDoc): doc is ArtifactDoc & { spec: DocumentSpec } {
  return doc.kind === 'document';
}

export function toPublicArtifact(doc: ArtifactDoc): PublicArtifact {
  const current = doc.versions.find((v) => v.version === doc.currentVersion) ?? doc.versions[doc.versions.length - 1];
  return {
    artifactId: doc.artifactId,
    kind: doc.kind,
    title: doc.title,
    status: doc.status,
    provenance: doc.provenance,
    runId: doc.runId,
    currentVersion: doc.currentVersion,
    pageCount: current?.pageCount ?? 0,
    sizeBytes: current?.sizeBytes ?? 0,
    ...(doc.kind === 'flashcards' ? { cardCount: (doc.spec as FlashcardsSpec).cards.length } : {}),
    ...(doc.kind === 'quiz' ? { questionCount: (doc.spec as QuizSpec).questionCount } : {}),
    ...(doc.kind === 'report' ? { weakAreaCount: (doc.spec as ReportSpec).weakAreas.length } : {}),
    ...(doc.kind === 'studyplan' ? { dayCount: (doc.spec as StudyPlanSpec).days.length } : {}),
    ...(doc.kind === 'studyplan' && (doc.spec as StudyPlanSpec).weeks?.length ? { weekCount: (doc.spec as StudyPlanSpec).weeks!.length } : {}),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(current ? { fileUrl: `/api/agent/artifacts/${doc.artifactId}/file` } : {}),
  };
}
