import { userMemoryService, UserMemory } from '../../services/userMemory.service';
import { UserStatsService } from '../../services/userStats.service';
import { notificationService, UserNotificationPreferences } from '../../services/notification/notification.service';
import { db } from '../../config/firebase';
import { logger } from '../../utils/logger';

export interface ConversationContext {
  userId: string;
  profile?: any;
  stats?: any;
  planner?: any;
  memory?: UserMemory | null;
  preferences?: UserNotificationPreferences;
}

export class ConversationContextService {
  private statsService = new UserStatsService();

  /**
   * Parallel context loader to gather student metadata.
   * Resolves in parallel using Promise.all to minimize API response latency.
   */
  async loadContext(userId: string): Promise<ConversationContext> {
    try {
      const [profileSnap, stats, plannerSnap, memory, preferences] = await Promise.all([
        db.collection('users').doc(userId).get(),
        this.statsService.getUserStats(userId).catch(() => null),
        db.collection('planners').doc(userId).get(),
        userMemoryService.getUserMemory(userId).catch(() => null),
        notificationService.getPreferences(userId).catch(() => undefined),
      ]);

      const profile = profileSnap.exists ? profileSnap.data() : undefined;
      const planner = plannerSnap.exists ? plannerSnap.data() : undefined;

      return {
        userId,
        profile,
        stats,
        planner,
        memory,
        preferences,
      };
    } catch (e: any) {
      logger.error(`[ConversationContextService] Error loading context for ${userId}:`, e);
      return { userId }; // Safe fallback with empty context keys
    }
  }
}

export const conversationContextService = new ConversationContextService();
