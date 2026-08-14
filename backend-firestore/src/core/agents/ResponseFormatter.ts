import { IAgent, AgentContext } from './IAgent';
import { IAIProvider } from '../interfaces/IAIProvider';
import { container, TOKENS } from '../di/container';
import {
  buildRecommendationsBlock,
  buildScholarlySystemPrompt,
  hasNotebookContext as computeHasNotebookContext,
  isConversationalReasoningMode,
} from '../../config/prompts';

/**
 * ResponseFormatter — Scholarly AI's Answer-Composition Layer
 *
 * On conversational modes (TEACHER/REVISION/RESEARCH/CURRENT_AFFAIRS), this is where
 * the actual student-facing answer is written: it inherits the full Scholarly AI
 * persona via buildScholarlySystemPrompt() and uses TeacherAgent's reasoning
 * scratchpad as an internal plan, not literal content to reformat. On other modes it
 * keeps the original behavior — reformatting TeacherAgent's full draft without
 * rewriting it. Always appends personalized learning recommendations when available.
 */
export class ResponseFormatter implements IAgent {
  name = 'ResponseFormatter';
  description = 'Composes/formats and streams the final Scholarly AI response with persona, quality enforcement, and smart recommendations.';

  async execute(context: AgentContext): Promise<void> {
    // Only used if not streaming
  }

  async *executeStream(context: AgentContext): AsyncGenerator<string, void, unknown> {
    const aiProvider = container.resolve<IAIProvider>(TOKENS.AIProvider);

    const mode = context.request.mode || 'TEACHER';
    const reasoning = context.sharedState['teacherReasoning'] || context.sharedState['researchDraft'] || '';
    const warnings = context.sharedState['verificationWarnings'] as string[] | undefined;

    let warningText = '';
    if (warnings && warnings.length > 0) {
      warningText = `\n\n⚠️ **Verification Note**: The following claims could not be verified against your uploaded study material: \n- ${warnings.join('\n- ')}`;
    }

    // Build smart recommendations based on student context
    const recommendations = buildRecommendationsBlock(context.studentContext);
    const recommendationsBlock = recommendations
      ? `\n\n## Provided Recommendations\n(Append these under an "## Appendix" heading ONLY IF the query was educational. Ignore them if it was a casual greeting.)\n${recommendations}`
      : '';

    const anyProvider = aiProvider as any;

    if (isConversationalReasoningMode(mode)) {
      // ── Conversational modes: compose the real answer, persona-voiced ──────
      // Same call TeacherAgent makes, so identity/exam-knowledge/teaching-standards/
      // language-rule/fallback/RAG-context are single-sourced instead of the old
      // separate "formatting only" prompt that never saw the persona at all.
      const hasNotebookContext = computeHasNotebookContext(context.retrievedContext);
      const persona = buildScholarlySystemPrompt({
        mode,
        studentContext: context.studentContext,
        retrievedContext: context.retrievedContext,
        hasNotebookContext,
      });

      const systemPrompt = `${persona}

## Your Private Reasoning (internal plan — do not repeat verbatim, do not mention "reasoning", "scratchpad", or "plan" to the student)
${reasoning}

Now write your final answer to the student, following the persona and mode instructions above and using the reasoning above as your plan — do not just restate it, and do not address the reasoning itself.${warningText}${recommendationsBlock}`;

      const messages = [
        ...context.request.history,
        { role: 'user' as const, content: context.request.query },
      ];

      if (typeof anyProvider.generateStreamResponse === 'function') {
        const stream = anyProvider.generateStreamResponse(messages, systemPrompt, {
          traceId: context.request.traceId,
          model: context.request.model,
        });
        for await (const chunk of stream) {
          yield chunk;
        }
      } else {
        const res = await aiProvider.generateResponse(messages, systemPrompt, {
          traceId: context.request.traceId,
        });
        yield res.reply;
      }
      return;
    }

    // ── Non-conversational modes (QUIZ/FLASHCARDS/PODCAST/MIND_MAP/TIMELINE/
    // INTERVIEW/ESSAY): unchanged from before — reformat the full draft without
    // rewriting it. These modes' output shapes don't fit the reasoning-first flow.
    const systemPrompt = `You are Scholarly AI's final presentation layer. Your job is to take the Draft Response and present it beautifully to the student.

## Preservation Rules (highest priority — these override every style instruction below)
You are FORMATTING, not rewriting. The draft has already been researched and grounded.
1. Keep every section, heading, list item, example, analogy and fact from the draft. Do NOT
   summarise, compress, merge or drop anything. The output must be at least as complete as
   the draft — if you find yourself shortening it, you are doing the wrong job.
2. Reproduce every fenced code block EXACTLY as written, character for character, including
   its language tag. Never re-indent, re-wrap, re-order or "tidy" the contents of a code
   block, and never emit an empty fence.
3. Keep LaTeX ($...$, $$...$$) and chemical notation (\\ce{...}) byte-for-byte.
4. You may improve wording, spacing and heading hierarchy. You may not change meaning,
   remove detail, or invent content that was not in the draft.

CRITICAL INSTRUCTION: Analyze the Draft Response. If it is a simple greeting, casual conversation, or a direct short answer:
- Output a natural, warm, conversational response.
- DO NOT use any markdown headings (## or ###).
- DO NOT include an Appendix or Next Steps.
- Keep it concise and natural, exactly as a human mentor would speak.

If the Draft Response is an educational explanation or a complex topic:
- Use proper markdown (## for sections, ### for subsections).
- Use bold for key terms, bullet points for clarity.
- Ensure the response is beginner-friendly with a clear structure and examples.
- Include the Appendix at the very end if recommendations are provided below.

## Draft Response
${reasoning}
${warningText}
${recommendationsBlock}`;

    // Attempt to stream
    if (typeof anyProvider.generateStreamResponse === 'function') {
      const stream = anyProvider.generateStreamResponse([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Format and present this response to the student.' }
      ], undefined, { traceId: context.request.traceId, model: context.request.model });
      for await (const chunk of stream) {
        yield chunk;
      }
    } else {
      const res = await aiProvider.generateResponse([
        { role: 'user', content: 'Format and present this response to the student.' }
      ], systemPrompt);
      yield res.reply;
    }
  }
}
