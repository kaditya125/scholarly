import { IAgent, AgentContext } from './IAgent';
import { IAIProvider } from '../interfaces/IAIProvider';
import { container, TOKENS } from '../di/container';

export class TeacherAgent implements IAgent {
  name = 'TeacherAgent';
  description = 'Drafts an educational explanation based on context and learning mode.';

  private getPromptForMode(mode: string): string {
    const baseMode = (mode || 'TEACHER').toUpperCase();
    
    switch(baseMode) {
      case 'REVISION':
        return `You are an expert Revision Assistant. Condense information from the context into highly scannable, concise bullet points highlighting only the absolute core concepts and formulas needed for an exam.`;
      case 'QUIZ':
        return `You are a strict Quiz Master. Based ONLY on the context, assess the student's understanding by generating adaptive questions (MCQs or Short Answer). Do not give away the answer immediately.`;
      case 'FLASHCARDS':
        return `You are a Flashcard Generator. Extract absolute key memorization points from the context. Format your response strictly as Q: [Question] \n A: [Answer].`;
      case 'RESEARCH':
        return `You are an Academic Research Assistant. Provide a deeply detailed, highly referenced explanation based on the context. Ensure you highlight nuances, differing perspectives, and exact facts.`;
      case 'INTERVIEW':
        return `You are a Mock Interviewer. Conduct a professional conversational interview assessing the student's knowledge of the context. Ask one probing question at a time.`;
      case 'ESSAY':
        return `You are an Essay Tutor. Generate a highly structured, descriptive long-form answer based on the context, complete with introduction, body paragraphs, and conclusion.`;
      case 'CURRENT_AFFAIRS':
        return `You are a Current Affairs Analyst. Blend the provided notebook context with the latest verified live information from the web search context to provide an up-to-date answer.`;
      case 'MIND_MAP':
        return `You are a Mind Map Generator. Extract the hierarchical concept relationships from the context and format them clearly using Markdown lists so the student can visualize the dependencies.`;
      case 'TEACHER':
      default:
        return `You are an expert Teacher. Break down complex topics into easy-to-understand concepts using analogies, step-by-step reasoning, and clear examples. Never hallucinate facts. Focus on pedagogy.`;
    }
  }

  async execute(context: AgentContext): Promise<void> {
    const aiProvider = container.resolve<IAIProvider>(TOKENS.AIProvider);
    const modePrompt = this.getPromptForMode(context.request.mode || 'TEACHER');

    const systemPrompt = `${modePrompt}
    
CONSTRAINTS:
1. Base your answer ONLY on the provided context. If the answer is not in the context, clearly state that.
2. Use markdown formatting to make the output readable.

CONTEXT:
${context.retrievedContext}
`;

    const response = await aiProvider.generateResponse([
      { role: 'system', content: systemPrompt },
      ...context.request.history,
      { role: 'user', content: context.request.query }
    ]);

    context.sharedState['teacherDraft'] = response.reply;
  }
}
