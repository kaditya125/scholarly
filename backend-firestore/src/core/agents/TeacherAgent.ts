import { IAgent, AgentContext } from './IAgent';
import { IAIProvider } from '../interfaces/IAIProvider';
import { container, TOKENS } from '../di/container';
import { buildScholarlySystemPrompt } from '../../config/prompts';

/**
 * TeacherAgent — Scholarly AI's Core Teaching Engine
 * 
 * Drafts educational explanations using the full Scholarly AI identity,
 * personalized to the student's profile, learning mode, and context.
 * 
 * Key Design Decisions:
 * - Uses buildScholarlySystemPrompt() which injects identity + exam knowledge + student context
 * - Never refuses to answer — uses intelligent fallback behavior
 * - Each learning mode has deeply specialized instructions
 * - Teaching style adapts to student's comprehension depth
 */
export class TeacherAgent implements IAgent {
  name = 'TeacherAgent';
  description = 'Drafts personalized educational explanations as Scholarly AI — an expert mentor for competitive exam preparation.';

  async execute(context: AgentContext): Promise<void> {
    const aiProvider = container.resolve<IAIProvider>(TOKENS.AIProvider);
    
    const mode = context.request.mode || 'TEACHER';
    const hasNotebookContext = context.retrievedContext !== 'No specific context found.' 
      && context.retrievedContext !== 'Placeholder RAG Text'
      && context.retrievedContext.length > 50;

    // Build the complete Scholarly AI system prompt with all layers
    const systemPrompt = buildScholarlySystemPrompt({
      mode,
      viewerRole: context.request.productRole,
      studentContext: context.studentContext,
      teacherContext: context.teacherContext,
      retrievedContext: context.retrievedContext,
      hasNotebookContext,
    });

    const response = await aiProvider.generateResponse([
      ...context.request.history,
      { role: 'user', content: context.request.query }
    ], systemPrompt, { traceId: context.request.traceId });

    context.sharedState['teacherDraft'] = response.reply;
  }

  /**
   * Streaming variant of execute(). Yields the draft token-by-token as the model
   * produces it, and still leaves the complete draft on sharedState['teacherDraft']
   * so every downstream stage (verification, ResponseFormatter) is unchanged.
   *
   * Why this exists: the teacher call is the longest single step in the pipeline, and
   * awaiting it produced a multi-second window where the client had nothing to show.
   * Streaming turns that dead time into visible reasoning. Falls back to the
   * non-streaming path for providers without generateStreamResponse.
   */
  async *executeStream(context: AgentContext): AsyncGenerator<string, void, unknown> {
    const aiProvider = container.resolve<IAIProvider>(TOKENS.AIProvider);

    const mode = context.request.mode || 'TEACHER';
    const hasNotebookContext = context.retrievedContext !== 'No specific context found.'
      && context.retrievedContext !== 'Placeholder RAG Text'
      && context.retrievedContext.length > 50;

    const systemPrompt = buildScholarlySystemPrompt({
      mode,
      viewerRole: context.request.productRole,
      studentContext: context.studentContext,
      teacherContext: context.teacherContext,
      retrievedContext: context.retrievedContext,
      hasNotebookContext,
    });

    const messages = [
      ...context.request.history,
      { role: 'user' as const, content: context.request.query },
    ];

    const anyProvider = aiProvider as any;
    if (typeof anyProvider.generateStreamResponse === 'function') {
      let draft = '';
      for await (const chunk of anyProvider.generateStreamResponse(messages, systemPrompt, {
        traceId: context.request.traceId,
      })) {
        draft += chunk;
        yield chunk;
      }
      context.sharedState['teacherDraft'] = draft;
      return;
    }

    const response = await aiProvider.generateResponse(messages, systemPrompt, {
      traceId: context.request.traceId,
    });
    context.sharedState['teacherDraft'] = response.reply;
    yield response.reply;
  }
}
