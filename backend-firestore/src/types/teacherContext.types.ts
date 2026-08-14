/**
 * Teacher Context Types
 *
 * Mirrors studentContext.types.ts's role in the pipeline — the shape Scholarly AI uses to
 * personalize a response for a teacher instead of a student. Deliberately smaller than
 * StudentContext: there is no teacher memory/analytics/planner system yet, only the onboarding
 * profile (`teacherProfiles/{uid}`, see teacher.ts). Add sections here only once a feature
 * actually produces that data — see the field-discipline note on TeacherProfile itself.
 */

export interface TeacherProfileSummary {
  displayName: string | null;
  subjects: string[];
  boards: string[];
  classesTaught: string[];
  exams: string[];
  languages: string[];
  teachingStyle: string | null;
  yearsExperience: number | null;
  bio: string | null;
}

export interface TeacherContext {
  userId: string;
  profile: TeacherProfileSummary | null;
  /** True once the teacher has completed onboarding (teacherProfiles/{uid}.onboardingStatus). */
  isOnboarded: boolean;
}
