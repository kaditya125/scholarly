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

/** A paper's display label: "JEE Main 2025 · Session 1 · Shift 2 · Physics". */
export function paperLabel(s: PyqSource): string {
  return [s.examName || s.examId, s.year, s.session, s.shift, s.paper, s.subject]
    .filter(Boolean)
    .join(' · ');
}

export const pyqApi = {
  async listSources(query: PyqSourceQuery = {}): Promise<PyqSource[]> {
    const res = await api.get('/pyq/sources', { params: query });
    // The controller answers { sources, count }; tolerate a bare array in case that changes.
    return Array.isArray(res.data) ? res.data : (res.data?.sources ?? []);
  },

  async availabilityMatrix(examId?: string): Promise<any[]> {
    const res = await api.get('/pyq/matrix', { params: examId ? { examId } : {} });
    return Array.isArray(res.data) ? res.data : (res.data?.matrix ?? []);
  },
};
