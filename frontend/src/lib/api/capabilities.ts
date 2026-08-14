import { api } from './client';
import type { TeacherStatus } from './teacher';

/**
 * Mirrors CAPABILITIES in backend-firestore/src/types/capabilities.ts.
 *
 * ⚠ THIS IS A DISPLAY CONTRACT, NOT AN AUTHORIZATION ONE.
 * The server re-derives capabilities on every protected route from the verified token and the
 * live teacher status. Reading this to decide what to render is correct; treating it as
 * permission is not. Patching the response in a browser grants nothing.
 */
export interface CapabilitySet {
  /** Never withdrawn while the account exists. */
  useAI: boolean;
  createPrivateContent: boolean;
  connectPeers: boolean;
  editTeacherProfile: boolean;
  publishPublicly: boolean;
  createClass: boolean;
  inviteStudents: boolean;
  acceptEnrollments: boolean;
  earn: boolean;
}

export type CapabilityName = keyof CapabilitySet;

export interface CapabilitiesResponse {
  uid: string;
  productRole: 'student' | 'teacher' | null;
  /** null when the caller is not a teacher, or has no profile document yet. */
  teacherStatus: TeacherStatus | null;
  capabilities: CapabilitySet;
}

export const capabilitiesApi = {
  async get(): Promise<CapabilitiesResponse> {
    const { data } = await api.get('/users/capabilities');
    return data;
  },
};
