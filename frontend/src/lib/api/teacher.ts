import { api } from './client';

/**
 * Mirrors TEACHER_STATUSES in backend-firestore/src/types/teacher.ts.
 *
 * `'active'` was a pre-state-machine value; the server normalises it to `'approved'` on read,
 * so the client never needs to handle it. Only `'approved'` may be presented as verified.
 */
export type TeacherStatus =
  | 'draft'
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'suspended';
export type TeacherVisibility = 'private' | 'public';

export interface TeacherProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  subjects: string[];
  boards: string[];
  classesTaught: string[];
  exams: string[];
  languages: string[];
  teachingStyle: string | null;
  bio: string | null;
  yearsExperience: number | null;
  visibility: TeacherVisibility;
  onboardingStatus: 'not_started' | 'in_progress' | 'complete';
  teacherStatus: TeacherStatus;
}

/** Everything a teacher may submit. `teacherStatus` is absent by design — it is server-owned. */
export type TeacherProfileUpdate = Partial<
  Pick<
    TeacherProfile,
    | 'subjects' | 'boards' | 'classesTaught' | 'exams'
    | 'languages' | 'teachingStyle' | 'bio' | 'yearsExperience' | 'visibility'
  >
> & { markComplete?: boolean };

export type TeacherProfileResponse =
  | ({ exists: true } & TeacherProfile)
  | { exists: false; uid: string };

/**
 * Teacher profile API.
 *
 * Both endpoints sit behind requireAuth + requireProductRole('teacher'), so a student calling
 * them receives 403 from the server regardless of what the browser believes its role to be.
 * Partial updates are supported so the wizard can autosave each step.
 */
export const teacherApi = {
  async getProfile(): Promise<TeacherProfileResponse> {
    const { data } = await api.get('/teacher/profile');
    return data;
  },

  async saveProfile(patch: TeacherProfileUpdate): Promise<TeacherProfileResponse> {
    const { data } = await api.post('/teacher/profile', patch);
    return data;
  },
};
