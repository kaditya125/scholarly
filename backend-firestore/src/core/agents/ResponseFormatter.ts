import { IAgent, AgentContext } from './IAgent';
import { IAIProvider } from '../interfaces/IAIProvider';
import { container, TOKENS } from '../di/container';
import { buildRecommendationsBlock } from '../../config/prompts';

/**
 * ResponseFormatter — Sadhya AI's Presentation Layer
 * 
 * Formats the TeacherAgent's draft into a polished, well-structured response.
 * Also appends personalized learning recommendations based on student context.
 */
export class ResponseFormatter implements IAgent {
  name = 'ResponseFormatter';
  description = 'Formats and streams the final Sadhya AI response with quality enforcement and smart recommendations.';

  async execute(context: AgentContext): Promise<void> {
    // Only used if not streaming
  }

  async *executeStream(context: AgentContext): AsyncGenerator<string, void, unknown> {
    const aiProvider = container.resolve<IAIProvider>(TOKENS.AIProvider);
    
    const draft = context.sharedState['teacherDraft'] || context.sharedState['researchDraft'];
    const warnings = context.sharedState['verificationWarnings'] as string[] | undefined;

    let warningText = '';
    if (warnings && warnings.length > 0) {
      warningText = `\n\n⚠️ **Verification Note**: The following claims could not be verified against your uploaded study material: \n- ${warnings.join('\n- ')}`;
    }

    // Build smart recommendations based on student context (teacher viewers have none yet)
    const recommendations = buildRecommendationsBlock(context.studentContext);
    const isTeacherViewer = context.request.productRole === 'teacher';
    const audience = isTeacherViewer ? 'teacher' : 'student';

    const systemPrompt = `You are Sadhya AI's final presentation layer. Your job is to take the Draft Response and present it beautifully to the ${audience}.

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
${draft}
${warningText}

${recommendations ? `## Provided Recommendations\n(Append these under an "## Appendix" heading ONLY IF the query was educational. Ignore them if it was a casual greeting.)\n${recommendations}` : ''}`;

    // Attempt to stream
    const anyProvider = aiProvider as any;
    if (typeof anyProvider.generateStreamResponse === 'function') {
      const stream = anyProvider.generateStreamResponse([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Format and present this response to the ${audience}.` }
      ], undefined, { traceId: context.request.traceId, model: context.request.model });
      for await (const chunk of stream) {
        yield chunk;
      }
    } else {
      const res = await aiProvider.generateResponse([
        { role: 'user', content: `Format and present this response to the ${audience}.` }
      ], systemPrompt);
      yield res.reply;
    }
  }
}
