import { StudentContextService } from '../../../services/studentContext.service';
import { StudentContext } from '../../../types/studentContext.types';

/**
 * ContextService — loads the aggregated student context (profile / memory / analytics /
 * stats / planner / notebooks). Wraps StudentContextService.aggregateContext and preserves
 * the exact default-context fallback the workflow used when aggregation fails.
 */
export class ContextService {
  constructor(private readonly contextService: StudentContextService = new StudentContextService()) {}

  async load(userId: string): Promise<StudentContext> {
    try {
      return await this.contextService.aggregateContext(userId);
    } catch (e) {
      console.warn('Failed to aggregate student context, proceeding with defaults:', e);
      return {
        userId,
        profile: null,
        memory: null,
        analytics: null,
        stats: null,
        planner: null,
        notebooks: null,
        isFirstTimeUser: true,
        isOnboarded: false,
      };
    }
  }

  /** The context-enrichment "detail" progress line shown live in the client. */
  buildDetailMessage(studentContext: StudentContext): string {
    const prof = (studentContext.profile as any) || {};
    const st = (studentContext.stats as any) || {};
    const exam = prof.targetExam || st.activeExam || 'general exam prep';
    const level = prof.preparationLevel || st.difficultyLevel || 'unspecified';
    const lang = prof.preferredLanguage || st.preferredLanguage;
    const year = prof.targetYear || st.targetYear;
    const enrichBits = [
      `preparing for ${exam}`,
      `${level} level`,
      year ? `target ${year}` : null,
      lang ? `${lang}` : null,
      studentContext.isOnboarded ? null : 'not onboarded yet',
    ].filter(Boolean).join(', ');
    return `Pulled your profile — ${enrichBits}.`;
  }
}

export const contextService = new ContextService();
