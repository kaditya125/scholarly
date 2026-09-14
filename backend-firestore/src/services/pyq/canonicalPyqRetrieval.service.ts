/**
 * Canonical PYQ retrieval — structured lookup of real papers from the verified corpus.
 *
 * This is a retrieval *source*, not an orchestrator: `RetrievalOrchestrator` calls it the same way
 * it calls `referenceBooksService`. There is still exactly one orchestration path.
 *
 * ── Why this is not vector search ───────────────────────────────────────────────────────────
 * "Give me the complete SSC CGL 2022 Shift 1 paper" is a request for a specific, ordered set of
 * records. Nearest-neighbour search answers a different question — it returns whatever is
 * semantically closest, in similarity order, from any sitting. Assembling a "paper" that way
 * produces a plausible-looking set of questions that never sat together, which is a fabrication
 * even when every individual question is real. So exact requests go to Firestore by
 * `canonicalPaperId` and come back ordered by `questionNumber`. Semantic search keeps its place
 * for topic discovery, where "close enough" is exactly what the student wants.
 *
 * ── Why it reports partial papers ───────────────────────────────────────────────────────────
 * Some sittings are only partly ingested. Returning 73 of 100 questions under the heading of a
 * complete paper is the same class of error as inventing the other 27 — the student cannot tell.
 * Every result therefore carries counts and an explicit status.
 */
import { db } from '../../config/firebase';
import { logger } from '../../utils/logger';
import { CanonicalPYQQuestion } from '../../types/pyq.types';

export type CanonicalRetrievalStatus =
  | 'CANONICAL_RETRIEVED'
  | 'PARTIAL_CANONICAL_PAPER'
  | 'AMBIGUOUS_PAPER'
  | 'NOT_AVAILABLE_IN_VERIFIED_CORPUS';

export interface CanonicalPaperSummary {
  canonicalPaperId: string | null;
  examId: string;
  year: number | null;
  session: string | null;
  shift: string | null;
  paper: string | null;
  questionCount: number;
}

export interface CanonicalPyqResult {
  status: CanonicalRetrievalStatus;
  /** Papers that matched the request. More than one means the student must narrow it. */
  papers: CanonicalPaperSummary[];
  /** Ordered questions, present only when exactly one paper resolved. */
  questions: CanonicalPYQQuestion[];
  retrievedCount: number;
  /** What the corpus believes the paper should hold, when the registry records it. */
  expectedCount: number | null;
  missingCount: number | null;
  /** Records present but lacking question text — counted, never silently filled in. */
  incompleteCount: number;
  diagnostics: string;
}

const MAX_PAPER_QUESTIONS = 400;

/**
 * How many questions go into one prompt.
 *
 * A full SSC CGL 2022 Shift 1 group is 299 records — 137KB of context, which made generation fail
 * outright: the student got citations and then silence. A capped, explicitly-labelled slice is
 * both answerable and honest; the count of what was withheld is stated so nothing looks complete
 * when it is not.
 */
const MAX_CONTEXT_QUESTIONS = 40;

/** Firestore equality queries only; no ordering constraint that would need a composite index. */
async function queryQuestions(
  filters: Array<[string, FirebaseFirestore.WhereFilterOp, any]>,
  limit: number,
): Promise<CanonicalPYQQuestion[]> {
  let q: FirebaseFirestore.Query = db.collection('pyq_questions');
  for (const [field, op, value] of filters) q = q.where(field, op, value);
  const snap = await q.limit(limit).get();
  return snap.docs.map((d) => d.data() as CanonicalPYQQuestion);
}

/**
 * Canonical exam order.
 *
 * `questionNumber` is the paper's own numbering and is the only defensible order. Records without
 * one sort last rather than being dropped — a question with no number is still a real question,
 * and discarding it would understate the paper.
 */
function byQuestionNumber(a: CanonicalPYQQuestion, b: CanonicalPYQQuestion): number {
  const an = typeof a.questionNumber === 'number' ? a.questionNumber : Number.MAX_SAFE_INTEGER;
  const bn = typeof b.questionNumber === 'number' ? b.questionNumber : Number.MAX_SAFE_INTEGER;
  if (an !== bn) return an - bn;
  return String(a.questionId).localeCompare(String(b.questionId));
}

export class CanonicalPyqRetrievalService {
  /**
   * Find the papers matching a request, narrowing only by what the student actually specified.
   *
   * Candidates come from the questions themselves (grouped by `canonicalPaperId`) rather than from
   * the registry, because the registry describes documents while the student is asking for
   * content. A sitting with no resolved identity is still reported, so a request never silently
   * misses questions that exist but are unattributed.
   */
  async resolvePapers(params: {
    examId: string;
    year?: number | null;
    shift?: number | null;
    paper?: string | null;
  }): Promise<CanonicalPaperSummary[]> {
    const { examId, year, shift, paper } = params;
    const filters: Array<[string, FirebaseFirestore.WhereFilterOp, any]> = [['examId', '==', examId]];
    if (year) filters.push(['year', '==', year]);

    const rows = await queryQuestions(filters, 5000);
    if (rows.length === 0) return [];

    const groups = new Map<string, CanonicalPaperSummary>();
    for (const r of rows as any[]) {
      // Narrow by the question's own normalized shift/paper, which the identity backfill wrote.
      if (shift !== null && shift !== undefined && r.normalizedShift !== shift) continue;
      if (paper && r.normalizedPaper && r.normalizedPaper !== paper) continue;

      const key = r.canonicalPaperId ?? `unresolved:${examId}:${r.year}:${r.normalizedShift ?? 'na'}`;
      const existing = groups.get(key);
      if (existing) existing.questionCount++;
      else groups.set(key, {
        canonicalPaperId: r.canonicalPaperId ?? null,
        examId: r.examId, year: r.year ?? null, session: r.session ?? null,
        shift: r.shift ?? null, paper: r.paper ?? null, questionCount: 1,
      });
    }
    return [...groups.values()].sort((a, b) => b.questionCount - a.questionCount);
  }

  /** Every question on one canonical paper, in exam order. */
  async fetchPaper(canonicalPaperId: string): Promise<CanonicalPYQQuestion[]> {
    const rows = await queryQuestions([['canonicalPaperId', '==', canonicalPaperId]], MAX_PAPER_QUESTIONS);
    return rows.sort(byQuestionNumber);
  }

  /** The registry's own expectation for a paper, when it records one. */
  private async expectedCountFor(examId: string, year: number | null): Promise<number | null> {
    if (!year) return null;
    try {
      const snap = await db.collection('pyq_source_registry')
        .where('examId', '==', examId).where('year', '==', year).limit(20).get();
      const counts = snap.docs
        .map((d) => (d.data() as any).questionCountDiscovered)
        .filter((n) => typeof n === 'number' && n > 0);
      return counts.length ? Math.max(...counts) : null;
    } catch {
      return null;
    }
  }

  /**
   * The entry point the orchestrator calls.
   *
   * Returns NOT_AVAILABLE_IN_VERIFIED_CORPUS rather than an empty success when the corpus holds
   * nothing — the caller must be able to tell "we have none" from "we found none this time", so
   * that the prompt can forbid reconstruction instead of inviting it.
   */
  async retrieve(params: {
    examId: string;
    year?: number | null;
    shift?: number | null;
    paper?: string | null;
    wantsFullPaper?: boolean;
  }): Promise<CanonicalPyqResult> {
    const { examId, year = null, shift = null, paper = null } = params;
    const empty = (diagnostics: string): CanonicalPyqResult => ({
      status: 'NOT_AVAILABLE_IN_VERIFIED_CORPUS',
      papers: [], questions: [], retrievedCount: 0,
      expectedCount: null, missingCount: null, incompleteCount: 0, diagnostics,
    });

    const papers = await this.resolvePapers({ examId, year, shift, paper });
    if (papers.length === 0) {
      return empty(`No ${examId}${year ? ` ${year}` : ''} questions in the verified corpus.`);
    }

    // More than one sitting matched and the student did not say which.
    if (papers.length > 1 && shift === null && !paper) {
      return {
        status: 'AMBIGUOUS_PAPER',
        papers, questions: [], retrievedCount: 0,
        expectedCount: null, missingCount: null, incompleteCount: 0,
        diagnostics: `${papers.length} ${examId}${year ? ` ${year}` : ''} papers are available; the request did not name one.`,
      };
    }

    const chosen = papers[0];
    if (!chosen.canonicalPaperId) {
      // Questions exist for this sitting but carry no resolved paper identity, so an ordered
      // "complete paper" cannot be honestly assembled. Say so rather than approximate it.
      return {
        status: 'PARTIAL_CANONICAL_PAPER',
        papers, questions: [], retrievedCount: 0,
        expectedCount: await this.expectedCountFor(examId, year),
        missingCount: null, incompleteCount: chosen.questionCount,
        diagnostics: `${chosen.questionCount} ${examId}${year ? ` ${year}` : ''} questions exist but are not yet attributed to a specific paper, so an ordered paper cannot be assembled.`,
      };
    }

    const questions = await this.fetchPaper(chosen.canonicalPaperId);
    const incompleteCount = questions.filter((q) => !q.questionText || String(q.questionText).trim().length < 5).length;
    const expectedCount = await this.expectedCountFor(examId, year);
    const missingCount = expectedCount ? Math.max(0, expectedCount - questions.length) : null;

    const status: CanonicalRetrievalStatus =
      questions.length === 0 ? 'NOT_AVAILABLE_IN_VERIFIED_CORPUS'
        : (missingCount && missingCount > 0) || incompleteCount > 0 ? 'PARTIAL_CANONICAL_PAPER'
          : 'CANONICAL_RETRIEVED';

    logger.info('[CanonicalPYQ] retrieval', {
      examId, year, shift, paper: chosen.canonicalPaperId,
      retrieved: questions.length, expected: expectedCount, incomplete: incompleteCount, status,
    });

    return {
      status, papers, questions,
      retrievedCount: questions.length,
      expectedCount, missingCount, incompleteCount,
      diagnostics: `${questions.length} canonical questions from ${chosen.canonicalPaperId}` +
        (expectedCount ? `; registry expects ${expectedCount}` : '') +
        (incompleteCount ? `; ${incompleteCount} record(s) lack question text` : ''),
    };
  }

  /**
   * Renders retrieved questions for the model, preserving the fields that make them canonical.
   *
   * Metadata is kept inline rather than flattened away: the model is being asked to present
   * records, not to recall them, and the question number, options, answer and source are the
   * difference between presenting and reciting.
   */
  toContextBlock(result: CanonicalPyqResult, maxQuestions = MAX_CONTEXT_QUESTIONS): string {
    if (result.questions.length === 0) return '';
    const first = result.questions[0] as any;
    const header = [
      first.examName || first.examId,
      first.year,
      first.session,
      first.shift ? (/shift/i.test(String(first.shift)) ? first.shift : `Shift ${first.shift}`) : null,
      first.paper,
    ].filter(Boolean).join(' · ');

    let out = `=== CANONICAL PREVIOUS-YEAR QUESTIONS (VERIFIED CORPUS) ===\n`;
    out += `Paper: ${header}\n`;
    out += `Canonical paper id: ${first.canonicalPaperId}\n`;
    out += `Records retrieved: ${result.retrievedCount}`;
    if (result.expectedCount) out += ` of ${result.expectedCount} expected`;
    out += `\nStatus: ${result.status}\n\n`;

    for (const q of result.questions as any[]) {
      out += `Q${q.questionNumber ?? '?'}. ${q.questionText ?? '(question text not extracted)'}\n`;
      const opts = Array.isArray(q.options)
        ? q.options.map((t: string, i: number) => `${String.fromCharCode(65 + i)}. ${t}`)
        : Object.entries(q.options ?? {}).map(([k, v]) => `${String(k).toUpperCase()}. ${v}`);
      for (const o of opts) out += `   ${o}\n`;
      if (q.correctAnswer) out += `   Answer: ${q.correctAnswer}\n`;
      const meta = [q.subject, q.topic, q.difficulty, q.verificationStatus].filter(Boolean).join(' | ');
      if (meta) out += `   [${meta}]\n`;
      out += `   [questionId: ${q.questionId}]\n\n`;
    }
    return out;
  }
}

export const canonicalPyqRetrievalService = new CanonicalPyqRetrievalService();
