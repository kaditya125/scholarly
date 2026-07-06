import { getFirestore } from 'firebase-admin/firestore';
import { ICacheProvider } from '../core/interfaces/ICacheProvider';
import { container, TOKENS } from '../core/di/container';
import { logger } from '../utils/logger';

export interface PromptConfig {
  version: string;
  description: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  rollbackVersion: string;
  active: boolean;
  content: string;
}

export interface SystemConfig {
  featureFlags: Record<string, boolean>;
}

export class ConfigService {
  private db = getFirestore();
  private cache: ICacheProvider;
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes

  constructor() {
    this.cache = container.resolve<ICacheProvider>(TOKENS.CacheProvider);
  }

  /**
   * Fetches the active prompt from Firestore, falls back to local code.
   */
  public async getPrompt(promptName: string, defaultFallback: string): Promise<{content: string, version: string}> {
    const cacheKey = `prompt_config_${promptName}`;
    try {
      const cached = await this.cache.get<PromptConfig>(cacheKey);
      if (cached && cached.active) {
        return { content: cached.content, version: cached.version };
      }

      const snapshot = await this.db.collection('system_config')
        .doc('prompts')
        .collection(promptName)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const config = snapshot.docs[0].data() as PromptConfig;
        await this.cache.set(cacheKey, config, this.CACHE_TTL_SECONDS);
        logger.info(`Loaded remote prompt version ${config.version} for ${promptName}`);
        return { content: config.content, version: config.version };
      }
    } catch (error) {
      logger.error(`Error fetching prompt ${promptName} from Firestore, using local fallback`, { error });
    }

    // Fallback to local default
    logger.warn(`Using local fallback prompt for ${promptName}`);
    return { content: defaultFallback, version: 'local-fallback' };
  }

  public async getFeatureFlags(): Promise<Record<string, boolean>> {
    const cacheKey = `feature_flags`;
    try {
      const cached = await this.cache.get<Record<string, boolean>>(cacheKey);
      if (cached) return cached;

      const doc = await this.db.collection('system_config').doc('flags').get();
      if (doc.exists) {
        const flags = doc.data()?.featureFlags || {};
        await this.cache.set(cacheKey, flags, this.CACHE_TTL_SECONDS);
        return flags;
      }
    } catch (error) {
      logger.error(`Error fetching feature flags from Firestore, using default`, { error });
    }

    return {
      ENABLE_KNOWLEDGE_GRAPH: true,
      ENABLE_MULTI_AGENT: true,
      ENABLE_PLANNER: true,
      ENABLE_WEB_SEARCH: false,
      ENABLE_VERIFICATION: true,
      ENABLE_NOTEBOOKLM_MODE: false
    };
  }
}
