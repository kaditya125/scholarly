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
 * student context that powers Scholarly AI's personalization.
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

    return {
      userId,
      profile,
      memory,
      analytics,
      stats,
      planner,
      notebooks,
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
      return {
        masteryPercentage: metrics.masteryPercentage,
        retentionScore: metrics.retentionScore,
        learningVelocity: metrics.learningVelocity,
        questionAccuracy: metrics.questionAccuracy,
        examReadiness: 0, // Computed from UserStats
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
