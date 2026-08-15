import { api } from './client';

/** Mirrors backend-firestore/src/types/classSession.ts. */
export const SESSION_STATUSES = ['live', 'ended'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export type VideoRole = 'teacher' | 'student';

export interface ClassSession {
  id: string;
  classId: string;
  ownerUid: string;
  title: string;
  status: SessionStatus;
  startedAt: unknown;
  endedAt: unknown;
  recordingRef?: string;
}

export interface SessionJoinInfo {
  sessionId: string;
  title: string;
  role: VideoRole;
  roomCode: string;
  joinUrl: string;
}

export const classSessionsApi = {
  async list(classId: string): Promise<ClassSession[]> {
    const { data } = await api.get(`/classes/${classId}/sessions`);
    return data.sessions ?? [];
  },

  async goLive(classId: string, title?: string): Promise<ClassSession> {
    const { data } = await api.post(`/classes/${classId}/sessions`, title ? { title } : {});
    return data;
  },

  async end(classId: string, sessionId: string): Promise<ClassSession> {
    const { data } = await api.post(`/classes/${classId}/sessions/${sessionId}/end`);
    return data;
  },

  async join(classId: string, sessionId: string): Promise<SessionJoinInfo> {
    const { data } = await api.get(`/classes/${classId}/sessions/${sessionId}/join`);
    return data;
  },
};
