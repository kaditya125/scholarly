import { api } from './client';

/**
 * Previous-year question papers.
 *
 * The backend has exposed `/api/pyq/*` for a while but nothing on the client ever called it, so
 * papers were invisible in the UI even though the registry holds them. The Documents page needs
 * them as a first-class document type alongside curriculum books and a user's own uploads.
 *
 * Only the read endpoints are wrapped here. `/pyq/discover`, `/rights/approve` and `/index` are
 * operator actions that trigger paid work and rights decisions; they do not belong behind a
 * browsing surface.
 */

/** Mirrors PYQSourceEntry in backend-firestore/src/types/pyq.types.ts (read fields only). */
export interface PyqSource {
  sourceId: string;
  examId: string;
  examName: string;
  year: number;
  session?: string;
  paper?: string;
  shift?: string;
  subject?: string;
  language?: string;
  authority?: string;
  sourceTier?: string;
  sourceName?: string;
  sourceUrl?: string;
  documentType?: string;
  availabilityStatus?: 'AVAILABLE' | 'PARTIAL' | 'MISSING' | 'BEHIND_RESTRICTION';
  retrievalStatus?: string;
  rightsStatus?: string;
}

export interface PyqSourceQuery {
  examId?: string;
  year?: number;
  sourceTier?: string;
  retrievalStatus?: string;
}

export interface PyqQuestion {
  questionId: string;
  examId?: string;
  examName?: string;
  year?: number;
  session?: string;
  shift?: string;
  paper?: string;
  subject?: string;
  topic?: string;
  language?: string;
  questionNumber?: number;
  questionText?: string;
  options?: string[] | Record<string, string>;
  correctAnswer?: string;
  marks?: number;
  negativeMarks?: number;
  difficulty?: string;
  verificationStatus?: string;
  rightsStatus?: string;
  corpusBucket?: string;
  sourceUrl?: string;
}

export interface PyqQuestionQuery {
  examId?: string;
  year?: number;
  session?: string;
  shift?: string;
  subject?: string;
  limit?: number;
}

/**
 * What distinguishes one paper from another, without the exam name.
 *
 * Repeating "Joint Entrance Examination (Main)" on all 42 of its papers pushed the year, session
 * and shift — the only fields that tell them apart — past the truncation point, so a grid of
 * papers read as 42 copies of the same tile. Inside an exam the name is already established by
 * the heading, so the label starts where the differences start.
 */
export function paperVariant(s: PyqSource): string {
  return [s.session, s.shift, s.paper, s.subject].filter(Boolean).join(' · ') || 'Paper';
}

/** Full label, for contexts with no exam heading above it (search results). */
export function paperLabel(s: PyqSource): string {
  return [s.examName || s.examId, s.year, paperVariant(s)].filter(Boolean).join(' · ');
}

/** `COMBINED_PAPER_KEY` is a database value, not something to show a student. */
export function documentTypeLabel(t?: string): string {
  if (!t) return '';
  const known: Record<string, string> = {
    QUESTION_PAPER: 'Question paper',
    SOLUTION_SET: 'Solutions',
    ANSWER_KEY: 'Answer key',
    COMBINED_PAPER_KEY: 'Paper + answer key',
    SYLLABUS: 'Syllabus',
    NOTIFICATION: 'Notification',
  };
  return known[t] ?? t.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export const pyqApi = {
  async listSources(query: PyqSourceQuery = {}): Promise<PyqSource[]> {
    const res = await api.get('/pyq/sources', { params: query });
    // The controller answers { sources, count }; tolerate a bare array in case that changes.
    return Array.isArray(res.data) ? res.data : (res.data?.sources ?? []);
  },

  async listQuestions(query: PyqQuestionQuery = {}): Promise<PyqQuestion[]> {
    const res = await api.get('/pyq/questions', { params: { limit: 300, ...query } });
    return Array.isArray(res.data) ? res.data : (res.data?.questions ?? []);
  },

  async availabilityMatrix(examId?: string): Promise<any[]> {
    const res = await api.get('/pyq/matrix', { params: examId ? { examId } : {} });
    return Array.isArray(res.data) ? res.data : (res.data?.matrix ?? []);
  },
};
