import { TeacherContext, TeacherProfileSummary } from '../types/teacherContext.types';
import { teacherProfileService } from './teacherProfile.service';

/**
 * TeacherContextService
 *
 * Aggregates a teacher's profile before an AI prompt is generated — the teacher-side mirror of
 * StudentContextService. Sourced from teacherProfileService.get(uid) rather than reading
 * Firestore directly, so this stays a thin adapter, not a second owner of teacherProfiles/{uid}.
 */
export class TeacherContextService {
  async aggregateContext(userId: string): Promise<TeacherContext> {
    const doc = await teacherProfileService.get(userId);

    if (!doc) {
      return { userId, profile: null, isOnboarded: false };
    }

    const profile: TeacherProfileSummary = {
      displayName: doc.displayName ?? null,
      subjects: Array.isArray(doc.subjects) ? doc.subjects : [],
      boards: Array.isArray(doc.boards) ? doc.boards : [],
      classesTaught: Array.isArray(doc.classesTaught) ? doc.classesTaught : [],
      exams: Array.isArray(doc.exams) ? doc.exams : [],
      languages: Array.isArray(doc.languages) ? doc.languages : [],
      teachingStyle: doc.teachingStyle ?? null,
      yearsExperience: doc.yearsExperience ?? null,
      bio: doc.bio ?? null,
    };

    return {
      userId,
      profile,
      isOnboarded: doc.onboardingStatus === 'complete',
    };
  }
}
