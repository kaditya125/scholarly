import { container, TOKENS } from '../di/container';
import { IMemoryProvider } from '../interfaces/IMemoryProvider';
import { db } from '../../config/firebase';

export interface CompanionTriggerResult {
  userId: string;
  triggered: boolean;
  action?: 'REVISION_REMINDER' | 'BURNOUT_WARNING' | 'PRACTICE_TEST_RECOMMENDED';
  message?: string;
}

export class ProactiveCompanion {
  /**
   * Analyzes a user's learning metrics and decides if a proactive intervention is needed.
   * This would typically be triggered by a nightly CRON job.
   */
  async evaluateUser(userId: string): Promise<CompanionTriggerResult> {
    const memoryProvider = container.resolve<IMemoryProvider>(TOKENS.MemoryProvider);
    const metrics = await memoryProvider.getLearningAnalytics(userId);

    // 1. Burnout Detection (High time spent, low retention/consistency)
    if (metrics.timeSpentLearningMinutes > 300 && metrics.retentionScore < 0.4) {
      return this.triggerAction(userId, 'BURNOUT_WARNING', 
        "You've been studying hard, but your retention seems to be dropping. Taking a short break is scientifically proven to help memory consolidation! Let's resume tomorrow.");
    }

    // 2. Revision Schedule (Based on Spaced Repetition logic)
    // Simplified for MVP: if revision frequency is very low compared to time spent
    if (metrics.timeSpentLearningMinutes > 120 && metrics.revisionFrequency < 1) {
       return this.triggerAction(userId, 'REVISION_REMINDER', 
        "You've learned a lot of new concepts recently, but haven't revised them. Would you like me to generate a quick 5-question recap quiz to strengthen your memory?");
    }

    // 3. Practice Test Recommendation (High mastery on current topics)
    if (metrics.masteryPercentage > 85) {
       return this.triggerAction(userId, 'PRACTICE_TEST_RECOMMENDED',
        "You're mastering these topics! I think you're ready for a full-length practice test. Want me to set one up?");
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
