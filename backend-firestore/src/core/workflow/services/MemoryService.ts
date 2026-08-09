import { container, TOKENS } from '../../di/container';
import { IMemoryProvider } from '../../interfaces/IMemoryProvider';
import { StudentContext } from '../../../types/studentContext.types';

/**
 * MemoryService — loads the per-session conversation memory and the user's learning
 * analytics via the injected IMemoryProvider. Mirrors the inline memory-retrieval stage.
 *
 * The provider is resolved lazily (constructor injection optional) so the service can be
 * unit-tested with a mock without bootstrapping the DI container.
 */
export class MemoryService {
  constructor(private readonly injected?: IMemoryProvider) {}

  private get provider(): IMemoryProvider {
    return this.injected ?? container.resolve<IMemoryProvider>(TOKENS.MemoryProvider);
  }

  /**
   * Loads the per-session conversation memory. NOTE (Increment 4 dedupe): the previous
   * getLearningAnalytics() call here was removed — the same analytics are already loaded by
   * StudentContextService.aggregateContext (studentContext.analytics), so fetching them again
   * was a redundant Firestore round-trip. The learning-analytics value was unused downstream.
   */
  async loadSessionMemory(userId: string, sessionId: string): Promise<any> {
    return this.provider.getSessionMemory(userId, sessionId);
  }

  /** The memory-retrieval "detail" progress line shown live in the client. */
  buildDetailMessage(studentContext: StudentContext, sessionMemory: any): string {
    const mem = (studentContext.memory as any) || {};
    const an = (studentContext.analytics as any) || {};
    const ctxItems = (sessionMemory?.contextWindow?.length) || 0;
    const weak = (mem.weakTopics?.length) || 0;
    const strong = (mem.strongTopics?.length) || 0;
    const mastery = an.masteryPercentage != null ? `${Math.round(an.masteryPercentage)}% mastery` : null;
    const bits = [
      ctxItems ? `recalled ${ctxItems} recent turn(s)` : 'no prior turns in this session',
      mastery,
      (weak || strong) ? `tracking ${weak} weak / ${strong} strong topic(s)` : null,
    ].filter(Boolean).join(', ');
    return `Loaded your learning memory — ${bits}.`;
  }
}

export const memoryService = new MemoryService();
