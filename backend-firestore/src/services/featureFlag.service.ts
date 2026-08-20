import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';
import { FeatureFlag } from '../types/observability';
import { ICacheProvider } from '../core/interfaces/ICacheProvider';
import { container, TOKENS } from '../core/di/container';

/**
 * FeatureFlagService — Dynamic Feature Flag Management
 * 
 * Supports three scopes:
 * - Global: applies to all users
 * - User-level: applies to specific users
 * - Beta: applies to users in the beta tester list
 * 
 * Flags are cached for 5 minutes to avoid Firestore reads on every request.
 */
export class FeatureFlagService {
  private db = getFirestore();
  private cache: ICacheProvider;
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly COLLECTION = 'feature_flags';

  constructor() {
    this.cache = container.resolve<ICacheProvider>(TOKENS.CacheProvider);
  }

  /**
   * Check if a feature is enabled for a given user.
   *
   * SCOPE SEMANTICS — precise, because the previous implementation did not restrict anything:
   *
   *   global  `enabled` applies to everyone.
   *   user    `enabled` applies ONLY to userIds in `targetUserIds`. Everyone else gets false,
   *           including callers that pass no userId at all.
   *   beta    identical restriction to `user`; `targetUserIds` is the beta-tester list. The two
   *           differ only in intent — one is targeting, the other is a cohort — and both gate on
   *           the same field.
   *
   * THE BUG THIS FIXES: every branch ended in `else { result = flag.enabled }`, so a user-scoped
   * flag with `enabled: true` and `targetUserIds: ['a']` returned TRUE for user 'b' as well —
   * falling through to the global value. Targeting was decorative: a "user-scoped" flag behaved
   * exactly like a global one, so any staged rollout built on it would have silently shipped the
   * feature to every user while appearing to be limited to a test cohort.
   *
   * Fails closed throughout: an unknown flag, a missing userId on a targeted scope, an empty
   * target list, or a Firestore error all yield false. A feature that cannot be confirmed enabled
   * is treated as disabled.
   *
   * CACHING CAVEAT: entries are keyed per user and setFlag() only invalidates the `_global` key,
   * so a change to `targetUserIds` can take up to CACHE_TTL to reach a user whose result is
   * already cached. That was harmless while scope was decorative and is now a real (bounded)
   * staleness window — worth resolving before this gates anything sensitive.
   */
  async isEnabled(flagName: string, userId?: string): Promise<boolean> {
    const cacheKey = `ff_${flagName}_${userId || 'global'}`;
    
    try {
      const cached = await this.cache.get<boolean>(cacheKey);
      if (cached !== null && cached !== undefined) return cached;
    } catch {}

    try {
      const doc = await this.db.collection(this.COLLECTION).doc(flagName).get();
      if (!doc.exists) return false;

      const flag = doc.data() as FeatureFlag;

      let result = false;

      if (flag.scope === 'user' || flag.scope === 'beta') {
        // Targeted scopes restrict. No userId, an empty list, or a non-member all mean false —
        // there is no fall-through to the global value, which is what made targeting meaningless.
        const targeted = !!userId && (flag.targetUserIds?.includes(userId) ?? false);
        result = targeted && flag.enabled;
      } else {
        // 'global', and anything unrecognised: an unknown scope must not widen access, so it is
        // treated as the plain enabled value rather than being granted targeted semantics.
        result = flag.scope === 'global' ? flag.enabled : false;
      }

      try {
        await this.cache.set(cacheKey, result, this.CACHE_TTL);
      } catch {}

      return result;
    } catch (error) {
      logger.error(`Failed to check feature flag: ${flagName}`, { error });
      return false; // Fail closed
    }
  }

  /**
   * Get all flags (for admin dashboard)
   */
  async getAllFlags(): Promise<FeatureFlag[]> {
    const snap = await this.db.collection(this.COLLECTION).get();
    return snap.docs.map(d => ({ ...d.data(), name: d.id }) as FeatureFlag);
  }

  /**
   * Set a feature flag
   */
  async setFlag(flag: FeatureFlag): Promise<void> {
    await this.db.collection(this.COLLECTION).doc(flag.name).set({
      ...flag,
      updatedAt: Date.now(),
    });
    
    // Invalidate cache
    try {
      await this.cache.set(`ff_${flag.name}_global`, null, 0);
    } catch {}

    logger.info(`Feature flag updated: ${flag.name} = ${flag.enabled}`, { 
      scope: flag.scope, 
      updatedBy: flag.updatedBy 
    });
  }

  /**
   * Seed default flags if they don't exist
   */
  async seedDefaults(): Promise<void> {
    const defaults: Partial<FeatureFlag>[] = [
      { name: 'ENABLE_KNOWLEDGE_GRAPH', enabled: true, scope: 'global', description: 'Enable Knowledge Graph retrieval in the pipeline' },
      { name: 'ENABLE_MULTI_AGENT', enabled: true, scope: 'global', description: 'Enable multi-agent pipeline (Teacher + Verification)' },
      { name: 'ENABLE_PLANNER', enabled: true, scope: 'global', description: 'Enable AI Study Planner and Coach' },
      { name: 'ENABLE_WEB_SEARCH', enabled: false, scope: 'global', description: 'Enable web search for current affairs queries' },
      { name: 'ENABLE_CURRENT_AFFAIRS', enabled: false, scope: 'global', description: 'Enable current affairs module' },
      { name: 'ENABLE_VERIFICATION', enabled: true, scope: 'global', description: 'Enable Verification Agent for fact-checking' },
      { name: 'ENABLE_COHERE_RERANK', enabled: false, scope: 'global', description: 'Enable Cohere Rerank for retrieval quality' },
      { name: 'ENABLE_NOTEBOOKLM_MODE', enabled: true, scope: 'global', description: 'Enable NotebookLM-style workspace' },
      { name: 'ENABLE_PODCAST', enabled: true, scope: 'global', description: 'Enable AI podcast generation' },
      { name: 'ENABLE_MINDMAP', enabled: true, scope: 'global', description: 'Enable AI mindmap generation' },
    ];

    for (const flag of defaults) {
      const doc = await this.db.collection(this.COLLECTION).doc(flag.name!).get();
      if (!doc.exists) {
        await this.db.collection(this.COLLECTION).doc(flag.name!).set({
          ...flag,
          targetUserIds: [],
          updatedAt: Date.now(),
          updatedBy: 'system',
        });
        logger.info(`Seeded default flag: ${flag.name}`);
      }
    }
  }
}
