import { api } from './client';

/**
 * Syllabus coverage — Stage 3.
 *
 * The state union and thresholds are OWNED BY THE SERVER. This client re-exports the type but
 * never re-derives a state from a score: a component that decided for itself what counts as
 * "weak" would drift from the API's answer, and the student would see one node described two
 * ways in the same session.
 */

export type CoverageState = 'UNTOUCHED' | 'LEARNING' | 'WEAK' | 'STRONG' | 'MASTERED';

export interface CoverageNode {
  nodeId: string;
  label: string;
  nodeType: string;
  parentId: string | null;
  state: CoverageState;
  /** Null when UNTOUCHED. Absence of evidence is not a score of zero. */
  masteryScore: number | null;
  attempts: number;
  accuracy: number | null;
  lastSeenAt: number | null;
  isLeaf: boolean;
  children: CoverageNode[];
}

export interface CoverageTotals {
  addressable: number;
  untouched: number;
  learning: number;
  weak: number;
  strong: number;
  mastered: number;
}

export interface SyllabusCoverage {
  examId: string;
  examName?: string;
  syllabusId: string | null;
  coveragePercent: number;
  masteredPercent: number;
  totals: CoverageTotals;
  subjects: CoverageNode[];
  generatedAt: number;
  tookMs?: number;
}

export const coverageApi = {
  /** `depth` keeps the first payload small on mobile; totals are unaffected by pruning. */
  async get(examId: string, depth?: number): Promise<SyllabusCoverage> {
    const res = await api.get(`/coverage/${encodeURIComponent(examId)}${depth ? `?depth=${depth}` : ''}`);
    return res.data;
  },

  async getNode(examId: string, nodeId: string): Promise<CoverageNode> {
    const res = await api.get(`/coverage/${encodeURIComponent(examId)}/node/${encodeURIComponent(nodeId)}`);
    return res.data;
  },
};
