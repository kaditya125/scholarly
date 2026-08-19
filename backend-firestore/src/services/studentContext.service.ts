import { StudentContext, StudentProfile, PlannerSummary, NotebookSummary } from '../types/studentContext.types';
import { UserProfileService } from './userProfile.service';
import { UserMemoryService } from './userMemory.service';
import { UserStatsService } from './userStats.service';
import { PlannerService } from './planner.service';
import { container, TOKENS } from '../core/di/container';
import { IMemoryProvider, LearningMetrics } from '../core/interfaces/IMemoryProvider';
import { db } from '../config/firebase';

/**
 * StudentContextService
 * 
 * Aggregates ALL student data before any AI prompt is generated.
 * This runs ONCE per workflow execution and provides the complete
 * student context that powers Sadhya AI's personalization.
 */
export class StudentContextService {
  private profileService: UserProfileService;
  private memoryService: UserMemoryService;
  private statsService: UserStatsService;
  private plannerService: PlannerService;

  constructor() {
    this.profileService = new UserProfileService();
    this.memoryService = new UserMemoryService();
    this.statsService = new UserStatsService();
    this.plannerService = new PlannerService();
  }

  /**
   * Aggregates all available context for a student.
   * 
   * This fetches data from multiple Firestore collections in parallel
   * for maximum performance. Missing data is gracefully handled —
   * each field can be null.
   */
  async aggregateContext(userId: string): Promise<StudentContext> {
    // Fetch everything in parallel for speed
    const [profile, memory, analytics, stats, planner, notebooks] = await Promise.all([
      this.fetchProfile(userId),
      this.fetchMemory(userId),
      this.fetchAnalytics(userId),
      this.fetchStats(userId),
      this.fetchPlannerSummary(userId),
      this.fetchNotebookSummary(userId),
    ]);

    const isOnboarded = !!(profile && profile.targetExam && profile.isComplete);
    const isFirstTimeUser = !profile;

    // Resolve Canonical Exam Intelligence (Phases 1-3)
    let examContext: StudentContext['examContext'] = null;
    const targetGoal = profile?.targetExam || profile?.goal || stats?.activeExam;
    if (targetGoal) {
      try {
        const { examMasterService } = await import('./exam/examMaster.service');
        const resolved = await examMasterService.resolveExam(String(targetGoal));
        if (resolved) {
          const targetCycle = profile?.targetYear || stats?.targetYear || resolved.currentCycle || new Date().getFullYear().toString();
          
          let totalVacancies: number | undefined = undefined;
          let timelineCountdowns: any[] | undefined = undefined;
          let eligibilityEvaluation: any | undefined = undefined;

          try {
            const { notificationTimelineService } = await import('./exam/notificationTimeline.service');
            const notif = await notificationTimelineService.getActiveNotification(resolved.examId, targetCycle);
            if (notif) {
              totalVacancies = notif.vacancies?.total;
              timelineCountdowns = notificationTimelineService.computeTimeline(notif);
              if ((profile as any)?.dob) {
                const { eligibilityCheckerService } = await import('./exam/eligibilityChecker.service');
                eligibilityEvaluation = eligibilityCheckerService.evaluateEligibility(notif, {
                  dob: (profile as any).dob,
                  category: (profile as any).category || 'UR',
                  gender: (profile as any).gender || 'MALE',
                  highestQualification: profile?.classLevel || profile?.target || "Bachelor's Degree",
                  hasDegreeCompleted: true,
                });
              }
            }
          } catch (notifErr) {
            console.warn('StudentContext: Failed to fetch notification context', notifErr);
          }

          examContext = {
            examId: resolved.examId,
            examName: resolved.name,
            cycleId: targetCycle,
            conductingAuthority: resolved.conductingAuthority,
            activeSyllabusVersionId: resolved.activeSyllabusVersionId,
            totalVacancies,
            timelineCountdowns,
            eligibilityEvaluation,
          };
        }
      } catch (e) {
        console.warn('StudentContext: Failed to resolve examContext', e);
      }
    }

    return {
      userId,
      profile,
      memory,
      analytics,
      stats,
      planner,
      notebooks,
      examContext,
      isFirstTimeUser,
      isOnboarded,
    };
  }

  // ─── Private Fetchers ──────────────────────────────────────────────────────

  private async fetchProfile(userId: string): Promise<StudentProfile | null> {
    try {
      return await this.profileService.getProfile(userId);
    } catch (e) {
      console.warn('StudentContext: Failed to fetch profile', e);
      return null;
    }
  }

  private async fetchMemory(userId: string): Promise<StudentContext['memory']> {
    try {
      const memory = await this.memoryService.getUserMemory(userId);
      if (!memory) return null;
      return {
        weakTopics: memory.weakTopics || [],
        strongTopics: memory.strongTopics || [],
        learningSpeed: memory.learningSpeed || 'medium',
        comprehensionDepth: memory.comprehensionDepth || 'beginner',
        preferredModes: memory.preferredModes || [],
      };
    } catch (e) {
      console.warn('StudentContext: Failed to fetch memory', e);
      return null;
    }
  }

  private async fetchAnalytics(userId: string): Promise<StudentContext['analytics']> {
    try {
      const memoryProvider = container.resolve<IMemoryProvider>(TOKENS.MemoryProvider);
      const metrics: LearningMetrics = await memoryProvider.getLearningAnalytics(userId);
      // No analytics document => these are zero-state placeholders, not measurements. Returning
      // null omits the whole block rather than asserting "Mastery 0%, Accuracy 0%, Consistency 0"
      // about a student nobody has measured. (Nothing writes this document today, so this is the
      // normal path until Phase A2's LearningStateService starts producing real values.)
      if (metrics.hasData === false) return null;
      return {
        masteryPercentage: metrics.masteryPercentage,
        retentionScore: metrics.retentionScore,
        learningVelocity: metrics.learningVelocity,
        questionAccuracy: metrics.questionAccuracy,
        // null, not 0: there is no readiness model yet, and claiming 0% is a false statement
        // about the student rather than an absence of data. See studentContext.types.ts.
        examReadiness: null,
        studyConsistencyScore: metrics.studyConsistencyScore,
        timeSpentLearningMinutes: metrics.timeSpentLearningMinutes,
      };
    } catch (e) {
      console.warn('StudentContext: Failed to fetch analytics', e);
      return null;
    }
  }

  private async fetchStats(userId: string): Promise<StudentContext['stats']> {
    try {
      const stats = await this.statsService.getUserStats(userId);
      if (!stats) return null;
      return {
        totalTestsAttempted: stats.totalTestsAttempted,
        averageAccuracy: stats.averageAccuracy,
        xp: stats.gamification?.xp || 0,
        level: stats.gamification?.level || 1,
        rank: stats.gamification?.rank || 'Bronze',
        studyStreakDays: stats.gamification?.studyStreakDays || 0,
        activeExam: stats.activeExam,
        targetYear: stats.targetYear,
        preferredLanguage: stats.preferredLanguage,
        difficultyLevel: stats.difficultyLevel,
      };
    } catch (e) {
      console.warn('StudentContext: Failed to fetch stats', e);
      return null;
    }
  }

  private async fetchPlannerSummary(userId: string): Promise<PlannerSummary | null> {
    try {
      const timetable = await this.plannerService.getTimetable(userId);
      if (!timetable || !timetable.schedule) return null;

      const today = new Date().toISOString().split('T')[0];
      const todayTasks = (timetable.schedule[today] || []).map(t => ({
        title: t.title,
        type: t.type,
        completed: t.completed,
        priority: t.priority,
      }));

      // Count overdue tasks (past dates with uncompleted tasks)
      let overdueCount = 0;
      let totalTasks = 0;
      let completedTasks = 0;

      for (const [date, tasks] of Object.entries(timetable.schedule)) {
        for (const task of tasks) {
          totalTasks++;
          if (task.completed) completedTasks++;
          else if (date < today) overdueCount++;
        }
      }

      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        todayTasks,
        overdueCount,
        completionRate,
        targetExam: undefined, // Could be fetched from the goal
      };
    } catch (e) {
      console.warn('StudentContext: Failed to fetch planner summary', e);
      return null;
    }
  }

  private async fetchNotebookSummary(userId: string): Promise<NotebookSummary | null> {
    try {
      const snapshot = await db.collection('notebooks')
        .where('userId', '==', userId)
        .limit(10)
        .get();

      if (snapshot.empty) {
        return { totalNotebooks: 0, recentNotebookNames: [], totalSources: 0 };
      }

      const notebookNames = snapshot.docs.map(doc => doc.data().title || doc.data().name || 'Untitled');
      let totalSources = 0;

      // Count sources across notebooks (lightweight query)
      for (const doc of snapshot.docs.slice(0, 5)) {
        const sourcesSnap = await db.collection('notebooks').doc(doc.id)
          .collection('sources').limit(50).get();
        totalSources += sourcesSnap.size;
      }

      return {
        totalNotebooks: snapshot.size,
        recentNotebookNames: notebookNames.slice(0, 5),
        totalSources,
      };
    } catch (e) {
      console.warn('StudentContext: Failed to fetch notebook summary', e);
      return null;
    }
  }
}

export const studentContextService = new StudentContextService();
