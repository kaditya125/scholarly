import { IAgent, AgentContext } from './IAgent';
import { IAIProvider } from '../interfaces/IAIProvider';
import { container, TOKENS } from '../di/container';

export class ResponseFormatter implements IAgent {
  name = 'ResponseFormatter';
  description = 'Formats the final response, integrating citations and warnings.';

  async execute(context: AgentContext): Promise<void> {
    // Only used if not streaming
  }

  async *executeStream(context: AgentContext): AsyncGenerator<string, void, unknown> {
    const aiProvider = container.resolve<IAIProvider>(TOKENS.AIProvider);
    
    const draft = context.sharedState['teacherDraft'] || context.sharedState['researchDraft'];
    const warnings = context.sharedState['verificationWarnings'] as string[] | undefined;

    let warningText = '';
    if (warnings && warnings.length > 0) {
      warningText = `\n\nWARNING: The following claims could not be verified against the source material: \n- ${warnings.join('\n- ')}`;
    }

    const systemPrompt = `You are a formatting agent. Your job is to take the provided Draft Explanation and format it beautifully for the user. 
    Ensure headings are bold, bullet points are clear, and paragraphs are readable.
    Do NOT change the factual content of the draft.
    
    DRAFT:
    ${draft}
    ${warningText}
    `;

    // Attempt to stream
    const anyProvider = aiProvider as any;
    if (typeof anyProvider.generateStreamResponse === 'function') {
      const stream = anyProvider.generateStreamResponse([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Format the final response.' }
      ]);
      for await (const chunk of stream) {
        yield chunk;
      }
    } else {
      const res = await aiProvider.generateResponse([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Format the final response.' }
      ]);
      yield res.reply;
    }
  }
}
