import { api } from './client';
import type { ClassPricing, ClassSchedule, ClassStatus } from './classes';

/**
 * Mirrors backend-firestore/src/types/enrollment.ts.
 *
 * The state names are the authorization model, not labels: only ACTIVE grants access, and
 * INVITED/REQUESTED grant nothing at all. The UI must never treat a pending edge as membership.
 */
export const ENROLLMENT_STATES = [
  'INVITED', 'REQUESTED', 'ACTIVE', 'DECLINED', 'REJECTED', 'LEFT', 'REMOVED', 'BLOCKED',
] as const;
export type EnrollmentState = (typeof ENROLLMENT_STATES)[number];

export interface EnrollmentRecord {
  id: string;
  classId: string;
  studentUid: string;
  teacherUid: string;
  state: EnrollmentState;
  source: 'invitation' | 'request' | 'purchase';
  activatedAt: unknown;
  blockedBy: string | null;
}

export interface InvitationRecord {
  code: string;
  classId: string;
  createdBy: string;
  active: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
}

/** What a code resolves to. Deliberately excludes anything about who else is enrolled. */
export interface InvitationPreview {
  code: string;
  classId: string;
  usable: boolean;
  reason?: string;
  class: {
    id: string;
    title: string;
    description: string | null;
    subject: string | null;
    grade: string | null;
    board: string | null;
    exam: string | null;
    language: string | null;
    mode: 'online' | 'offline' | 'hybrid';
    startDate: string | null;
    endDate: string | null;
    schedule: ClassSchedule | null;
    pricing: ClassPricing;
    status: ClassStatus;
    syllabusCount: number;
  };
}

/**
 * An enrolment with its class summary attached, as returned by GET /enrollments/mine.
 * `class` is null if the class no longer exists — the row still renders.
 */
export interface MyEnrollment extends EnrollmentRecord {
  class: {
    id: string;
    title: string;
    subject: string | null;
    grade: string | null;
    board: string | null;
    mode: 'online' | 'offline' | 'hybrid';
    startDate: string | null;
    endDate: string | null;
    status: ClassStatus;
    pricing: ClassPricing;
  } | null;
}

export const enrollmentsApi = {
  /* ── Teacher ── */
  async createInvitation(classId: string, opts: { expiresAt?: string | null; maxUses?: number | null } = {}) {
    const { data } = await api.post<InvitationRecord>(`/classes/${classId}/invitations`, opts);
    return data;
  },

  async listRoster(classId: string, state?: EnrollmentState): Promise<EnrollmentRecord[]> {
    const { data } = await api.get(`/classes/${classId}/enrollments`, {
      params: state ? { state } : undefined,
    });
    return data.enrollments ?? [];
  },

  /* ── Student ── */
  async previewInvitation(code: string): Promise<InvitationPreview> {
    const { data } = await api.get(`/invitations/${code}`);
    return data;
  },

  async acceptInvitation(code: string): Promise<EnrollmentRecord> {
    const { data } = await api.post(`/invitations/${code}/accept`);
    return data;
  },

  async requestToJoin(classId: string): Promise<EnrollmentRecord> {
    const { data } = await api.post(`/classes/${classId}/requests`);
    return data;
  },

  async listMine(): Promise<MyEnrollment[]> {
    const { data } = await api.get('/enrollments/mine');
    return data.enrollments ?? [];
  },

  /**
   * The one transition endpoint.
   *
   * Omitting `studentUid` means "act on my own enrolment"; supplying it means "act on that
   * student's", which the server honours only if the caller owns the class. Which role may make
   * which move is decided server-side — this client cannot widen it.
   */
  async setState(classId: string, state: EnrollmentState, studentUid?: string): Promise<EnrollmentRecord> {
    const { data } = await api.post(`/enrollments/${classId}/state`, { state, studentUid });
    return data;
  },
};

/** Shareable URL for a code. Kept here so the /join route shape lives in one place. */
export function invitationLink(code: string): string {
  return `${window.location.origin}/join/${code}`;
}
