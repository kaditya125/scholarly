import { UserStatsRepository } from '../repositories/userStats.repository';
import type { WeakTopic } from '../types/quizAttempt.types';

export class UserStatsService {
  private repository = new UserStatsRepository();

  /**
   * Exam-scoped weak areas with real syllabus identity — what QuestionMixer / the recommendation
   * engine calls, never stats.weakTopics (the bare string list, kept only for display consumers
   * that predate this). Falls back to rows with no recorded examId only when examId itself is
   * unresolved (never mixes a DIFFERENT exam's rows in), so a JEE weakness can never surface as an
   * SSC CGL recommendation. Lives here rather than on quizAttemptsService purely to avoid a
   * circular import: quizAttemptsService already imports QuizQuestion from quizGenerator.service,
   * and quizGenerator needs this lookup — this method only ever reads UserStats, so it belongs
   * here regardless of that constraint.
   */
  async getWeakTopicsForExam(userId: string, examId: string | null): Promise<WeakTopic[]> {
    const stats: any = await this.getUserStats(userId);
    const details: WeakTopic[] = Array.isArray(stats?.weakTopicDetails) ? stats.weakTopicDetails : [];
    if (!examId) return details.filter((d) => !d.examId);
    return details
      .filter((d) => d.examId === examId)
      .sort((a, b) => (b.confidence * (100 - b.accuracy)) - (a.confidence * (100 - a.accuracy)));
  }

  async getUserStats(userId: string) {
    let stats = await this.repository.findByUserId(userId);
    
    // Seed new user if empty
    if (!stats) {
      stats = {
        userId,
        totalTestsAttempted: 0,
        averageAccuracy: 0,
        overallRank: 0,
        completionPercentage: 0,
        performanceHistory: [],
        weakTopics: [],
        strongTopics: [],
        activityHeatmap: [],
        gamification: {
          xp: 0,
          level: 1,
          rank: 'Bronze',
          studyStreakDays: 0,
          longestStreak: 0,
          badges: []
        },
        aiRecommendations: [],
        learningVelocity: 0,
        retentionScore: 0,
        learningHealthScore: 0,
        examReadiness: {
          estimatedScoreRange: "0-0",
          projectedPercentile: 0,
          probabilityOfClearing: 0,
          confidenceLevel: "Low",
          riskAreas: [],
          recommendedFocus: "Initial Setup"
        },
        coachMemory: {
          preferredExplanationStyle: "Detailed",
          preferredStudyTime: "Flexible",
          favoriteLearningMode: "Visual",
          attentionSpanMinutes: 25
        }
      };
      await this.repository.upsertUserStats(userId, stats);
    }
    
    // Generate dynamic AI Recommendations based on stats
    const recommendations = this.generateAIRecommendations(stats);
    if (recommendations.length > 0) {
      if (stats) {
        stats.aiRecommendations = recommendations;
        // We don't necessarily await the save here, just update it in background
        this.repository.upsertUserStats(userId, { aiRecommendations: recommendations }).catch(console.error);
      }
    }
    
    return stats;
  }

  async awardXP(userId: string, actionType: 'LOGIN' | 'STUDY_30' | 'QUIZ_COMPLETE' | 'QUIZ_HIGH_SCORE' | 'COMMUNITY_HELP') {
    const xpMap = {
      'LOGIN': 5,
      'STUDY_30': 20,
      'QUIZ_COMPLETE': 30,
      'QUIZ_HIGH_SCORE': 20,
      'COMMUNITY_HELP': 25
    };
    const amount = xpMap[actionType] || 5;
    await this.repository.addXP(userId, amount);
  }

  private generateAIRecommendations(stats: any): any[] {
    const recs: any[] = [];
    
    // Simple logic based on weak topics
    if (stats.weakTopics && stats.weakTopics.length > 0) {
      recs.push({
        type: 'review',
        title: `Revise ${stats.weakTopics[0]}`,
        message: `Your recent quiz scores in ${stats.weakTopics[0]} are below your average. Consider reviewing the material.`,
        priority: 'high'
      });
    }

    if (stats.retentionScore < 50 && stats.totalTestsAttempted > 0) {
      recs.push({
        type: 'quiz',
        title: 'Spaced Repetition Overdue',
        message: 'You have topics that need reinforcing. Take a quick revision quiz to boost retention.',
        priority: 'medium'
      });
    }

    if (stats.examReadiness > 80) {
      recs.push({
        type: 'milestone',
        title: 'Ready for Mock Test',
        message: 'Your syllabus coverage and retention are high! You are ready to attempt a full-length mock test.',
        priority: 'low'
      });
    }

    // Default placeholder if none
    if (recs.length === 0) {
      recs.push({
        type: 'review',
        title: 'Continue Learning',
        message: 'Select a notebook or upload a new syllabus document to get started.',
        priority: 'low'
      });
    }

    return recs;
  }
}
