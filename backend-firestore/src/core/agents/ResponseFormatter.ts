import { IAgent, AgentContext } from './IAgent';
import { IAIProvider } from '../interfaces/IAIProvider';
import { container, TOKENS } from '../di/container';
import { buildRecommendationsBlock } from '../../config/prompts';

/**
 * ResponseFormatter — Scholarly AI's Presentation Layer
 * 
 * Formats the TeacherAgent's draft into a polished, well-structured response.
 * Also appends personalized learning recommendations based on student context.
 */
export class ResponseFormatter implements IAgent {
  name = 'ResponseFormatter';
  description = 'Formats and streams the final Scholarly AI response with quality enforcement and smart recommendations.';

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

    // Build smart recommendations based on student context
    const recommendations = buildRecommendationsBlock(context.studentContext);

    const systemPrompt = `You are Scholarly AI's final presentation layer. Your job is to take the Draft Response and present it beautifully to the student.

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
