import { container, TOKENS } from '../di/container';
import { IMemoryProvider } from '../interfaces/IMemoryProvider';
import { db } from '../../config/firebase';
import { UserProfileService } from '../../services/userProfile.service';

export interface CompanionTriggerResult {
  userId: string;
  triggered: boolean;
  action?: 'REVISION_REMINDER' | 'BURNOUT_WARNING' | 'PRACTICE_TEST_RECOMMENDED' | 'WEAK_TOPIC_ALERT' | 'STREAK_BROKEN' | 'EXAM_COUNTDOWN';
  message?: string;
}

export class ProactiveCompanion {
  private profileService: UserProfileService;

  constructor() {
    this.profileService = new UserProfileService();
  }

  /**
   * Analyzes a user's learning metrics and profile to decide if a proactive intervention is needed.
   * This would typically be triggered by a nightly CRON job.
   */
  async evaluateUser(userId: string): Promise<CompanionTriggerResult> {
    const memoryProvider = container.resolve<IMemoryProvider>(TOKENS.MemoryProvider);
    const metrics = await memoryProvider.getLearningAnalytics(userId);
    const profile = await this.profileService.getProfile(userId);

    const examName = profile?.targetExam || 'your exam';

    // 1. Exam Countdown (if target year is set)
    if (profile?.targetYear) {
      const examYear = parseInt(profile.targetYear);
      const now = new Date();
      const daysRemaining = Math.max(0, Math.ceil((new Date(examYear, 0, 1).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      if (daysRemaining > 0 && daysRemaining <= 60) {
        return this.triggerAction(userId, 'EXAM_COUNTDOWN',
          `⏰ ${examName} is approximately ${daysRemaining} days away! Let's make every study session count. Would you like me to create an intensive revision plan for the remaining days?`);
      }
    }

    // 2. Burnout Detection (High time spent, low retention/consistency)
    if (metrics.timeSpentLearningMinutes > 300 && metrics.retentionScore < 0.4) {
      return this.triggerAction(userId, 'BURNOUT_WARNING', 
        `You've been studying hard for ${examName}, but your retention seems to be dropping. Taking a short break is scientifically proven to help memory consolidation! The Pomodoro technique (25 min study + 5 min break) can help. Let's resume fresh tomorrow. 💪`);
    }

    // 3. Revision Schedule (Based on Spaced Repetition logic)
    if (metrics.timeSpentLearningMinutes > 120 && metrics.revisionFrequency < 1) {
       return this.triggerAction(userId, 'REVISION_REMINDER', 
        `You've learned a lot of new concepts for ${examName} recently, but haven't revised them. Spaced repetition is the #1 technique for long-term memory. Would you like me to generate a quick 5-question recap quiz to strengthen your retention? 🧠`);
    }

    // 4. Practice Test Recommendation (High mastery on current topics)
    if (metrics.masteryPercentage > 85) {
       return this.triggerAction(userId, 'PRACTICE_TEST_RECOMMENDED',
        `You're mastering your ${examName} preparation topics! 🏆 I think you're ready for a full-length practice test. Simulating exam conditions will help you manage time pressure and build confidence. Want me to set one up?`);
    }

    // 5. Weak Topic Alert (if weak topics haven't been revised recently)
    if (metrics.questionAccuracy < 50 && metrics.questionAccuracy > 0) {
      return this.triggerAction(userId, 'WEAK_TOPIC_ALERT',
        `Your recent quiz accuracy for ${examName} preparation is ${Math.round(metrics.questionAccuracy)}%. I've identified some weak areas that need attention. Would you like me to create a focused revision session on your challenging topics? 🎯`);
    }

    // 6. Study Streak Broken (consistency score dropped significantly)
    if (metrics.studyConsistencyScore < 30 && metrics.timeSpentLearningMinutes > 0) {
      return this.triggerAction(userId, 'STREAK_BROKEN',
        `It looks like your study routine for ${examName} has been inconsistent lately. Consistency beats intensity in competitive exam preparation. Even 30 minutes of focused study daily can make a huge difference. Let's get back on track! 📅`);
    }

    // No action needed
    return { userId, triggered: false };
  }

  private async triggerAction(userId: string, action: CompanionTriggerResult['action'], message: string): Promise<CompanionTriggerResult> {
    // In a real system, this might push a notification to FCM (Firebase Cloud Messaging),
    // send an email, or insert an unread message into their chat history.
    
    await db.collection('users').doc(userId).collection('notifications').add({
      type: 'PROACTIVE_COMPANION',
      action,
      message,
      read: false,
      timestamp: new Date().toISOString()
    });

    return { userId, triggered: true, action, message };
  }
}

export const proactiveCompanion = new ProactiveCompanion();
