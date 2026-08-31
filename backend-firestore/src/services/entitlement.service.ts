import { paymentsService } from './payments.service';

export type PlanType = 'free' | 'pro';

export type MeteredFeature =
  | 'chatMessages'
  | 'voiceSeconds'
  | 'documentsUploaded'
  | 'podcastsGenerated'
  | 'mockTestsGenerated';

export interface PlanLimits {
  chatMessages: number;
  voiceSeconds: number; // in seconds
  documentsUploaded: number;
  maxDocumentSizeMB: number;
  podcastsGenerated: number;
  mockTestsGenerated: number;
  communityStandard: boolean;
  peerChatStandard: boolean;
  pyqAccess: boolean;
  notebooksAccess: boolean;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    chatMessages: 100, // 100 messages/month
    voiceSeconds: 15 * 60, // 15 minutes/month = 900 seconds
    documentsUploaded: 5, // 5 documents/month
    maxDocumentSizeMB: 10, // 10 MB per document
    podcastsGenerated: 1, // 1 episode/month
    mockTestsGenerated: 3, // 3 AI tests/month
    communityStandard: true,
    peerChatStandard: true,
    pyqAccess: true,
    notebooksAccess: true,
  },
  pro: {
    chatMessages: 2000, // Up to 2,000 messages/month
    voiceSeconds: 300 * 60, // Up to 300 minutes/month = 18,000 seconds (5 hours)
    documentsUploaded: 100, // Up to 100 documents/month
    maxDocumentSizeMB: 50, // Up to 50 MB per document
    podcastsGenerated: 25, // Up to 25 episodes/month
    mockTestsGenerated: 1000, // Unlimited AI tests subject to fair use
    communityStandard: true,
    peerChatStandard: true,
    pyqAccess: true,
    notebooksAccess: true,
  },
};

export class EntitlementService {
  /**
   * Authoritatively determines the user's active plan by reading server state.
   */
  async getUserPlan(userId: string): Promise<{ plan: PlanType; isPro: boolean; subscription: any | null }> {
    const { plan, subscription } = await paymentsService.getUserPlan(userId);
    const isPro = paymentsService.evaluateEntitlement(plan, subscription).active;
    return {
      plan: isPro ? 'pro' : 'free',
      isPro,
      subscription,
    };
  }

  /**
   * Retrieves the limits configured for the given user's active plan.
   */
  async getPlanLimits(userId: string): Promise<{ plan: PlanType; limits: PlanLimits; subscription: any | null }> {
    const { plan, subscription } = await this.getUserPlan(userId);
    return {
      plan,
      limits: PLAN_LIMITS[plan],
      subscription,
    };
  }

  /**
   * Returns whether a non-metered feature is permitted for the user.
   */
  async isFeaturePermitted(userId: string, feature: 'communityStandard' | 'peerChatStandard' | 'pyqAccess' | 'notebooksAccess'): Promise<boolean> {
    const { limits } = await this.getPlanLimits(userId);
    return Boolean(limits[feature]);
  }
}

export const entitlementService = new EntitlementService();
