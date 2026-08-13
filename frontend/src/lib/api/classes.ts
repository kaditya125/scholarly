import { api } from './client';

/**
 * Mirrors backend-firestore/src/types/class.ts.
 *
 * Server-owned fields (id, ownerUid, status, counts, timestamps) appear on the response type but
 * never on the update type — the API ignores them in a request body, and leaving them out here
 * means a mistake is a compile error rather than a silently dropped field.
 */

export const CLASS_STATUSES = ['draft', 'published', 'active', 'completed', 'archived'] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

export const CLASS_MODES = ['online', 'offline', 'hybrid'] as const;
export type ClassMode = (typeof CLASS_MODES)[number];

export type SyllabusTopicStatus = 'not_started' | 'in_progress' | 'completed';

export interface SyllabusTopic {
  id: string;
  title: string;
  status: SyllabusTopicStatus;
}

export interface ClassSchedule {
  days: string[];
  startTime: string | null;
  endTime: string | null;
}

export interface ClassPricing {
  type: 'free' | 'paid';
  amountINR: number;
  currency: 'INR';
}

export interface ClassRecord {
  id: string;
  ownerUid: string;
  title: string;
  description: string | null;
  subject: string | null;
  grade: string | null;
  board: string | null;
  exam: string | null;
  language: string | null;
  syllabus: SyllabusTopic[];
  startDate: string | null;
  endDate: string | null;
  schedule: ClassSchedule | null;
  mode: ClassMode;
  capacity: number | null;
  pricing: ClassPricing;
  status: ClassStatus;
  counts: { enrolled: number };
  publishedAt: unknown;
}

/** Everything a teacher may send. `status` is absent by design — it moves via setStatus. */
export interface ClassUpdate {
  title?: string;
  description?: string | null;
  subject?: string | null;
  grade?: string | null;
  board?: string | null;
  exam?: string | null;
  language?: string | null;
  syllabus?: { id?: string; title: string; status?: SyllabusTopicStatus }[];
  startDate?: string | null;
  endDate?: string | null;
  schedule?: { days?: string[]; startTime?: string | null; endTime?: string | null } | null;
  mode?: ClassMode;
  capacity?: number | null;
  /** Accepted only while the class is a draft — the server refuses it afterwards. */
  pricing?: { type?: 'free' | 'paid'; amountINR?: number };
}

/** Thrown shape for a publish that failed its completeness checks (HTTP 422). */
export interface PublishProblems {
  error: string;
  problems: string[];
}

export const classesApi = {
  async listMine(): Promise<ClassRecord[]> {
    const { data } = await api.get('/classes/mine');
    return data.classes ?? [];
  },

  async get(id: string): Promise<ClassRecord> {
    const { data } = await api.get(`/classes/${id}`);
    return data;
  },

  async create(patch: ClassUpdate): Promise<ClassRecord> {
    const { data } = await api.post('/classes', patch);
    return data;
  },

  async update(id: string, patch: ClassUpdate): Promise<ClassRecord> {
    const { data } = await api.patch(`/classes/${id}`, patch);
    return data;
  },

  async setStatus(id: string, status: ClassStatus): Promise<ClassRecord> {
    const { data } = await api.post(`/classes/${id}/status`, { status });
    return data;
  },
};
