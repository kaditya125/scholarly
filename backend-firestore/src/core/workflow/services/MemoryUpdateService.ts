import { container, TOKENS } from '../../di/container';
import { IMemoryProvider } from '../../interfaces/IMemoryProvider';
import { UserProfileService } from '../../../services/userProfile.service';

/**
 * MemoryUpdateService — post-response writes: appending the turn to session memory and
 * (for not-yet-onboarded users) extracting profile data from the conversation.
 *
 * These are latency-irrelevant to the answer itself; in a later increment they are routed
 * through the BackgroundExecutor. For now this service just encapsulates the exact calls so
 * the WorkflowEngine no longer performs them inline.
 */
export class MemoryUpdateService {
  constructor(
    private readonly injectedMemory?: IMemoryProvider,
    private readonly profileService: UserProfileService = new UserProfileService(),
  ) {}

  private get memory(): IMemoryProvider {
    return this.injectedMemory ?? container.resolve<IMemoryProvider>(TOKENS.MemoryProvider);
  }

  /** Persist the (updated) rolling context window for a session. */
  async updateSessionMemory(userId: string, sessionId: string, contextWindow: string[]): Promise<void> {
    await this.memory.updateSessionMemory(userId, sessionId, { contextWindow });
  }

  /**
   * Fire-and-forget profile extraction from a conversation turn. Mirrors the previous
   * `profileService.extractProfileFromConversation(...).catch(console.error)` calls.
   */
  extractProfile(userId: string, userMessage: string, aiResponse: string): void {
    this.profileService.extractProfileFromConversation(userId, userMessage, aiResponse).catch(console.error);
  }

  /**
   * Promise-returning variant for the BackgroundExecutor (Increment 5): errors propagate so the
   * executor can retry, instead of being swallowed. Same underlying extraction work.
   */
  extractProfileTask(userId: string, userMessage: string, aiResponse: string): Promise<void> {
    return this.profileService.extractProfileFromConversation(userId, userMessage, aiResponse);
  }
}

export const memoryUpdateService = new MemoryUpdateService();
