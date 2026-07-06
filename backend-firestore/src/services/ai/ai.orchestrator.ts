import { AIProvider } from './ai.provider.interface';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { ChatMessage } from '../../types';
import { buildScholarlySystemPrompt } from '../../config/prompts';
import { StudentContext } from '../../types/studentContext.types';

export enum AILearningMode {
  TEACHER = 'TEACHER',
  REVISION = 'REVISION',
  EXAM = 'EXAM',
  QUIZ = 'QUIZ',
  FLASHCARDS = 'FLASHCARDS',
  MINDMAP = 'MINDMAP',
  MIND_MAP = 'MIND_MAP',
  PODCAST = 'PODCAST',
  SUMMARY = 'SUMMARY',
  BEGINNER = 'BEGINNER',
  RESEARCH = 'RESEARCH',
  INTERVIEW = 'INTERVIEW',
  ESSAY = 'ESSAY',
  CURRENT_AFFAIRS = 'CURRENT_AFFAIRS',
  DEFAULT = 'DEFAULT',
}

export class AIOrchestrator {
  private primaryProvider: AIProvider;
  private fastProvider: AIProvider; // e.g. Groq for quick generation

  constructor() {
    this.primaryProvider = new GeminiProvider();
    this.fastProvider = new GroqProvider();
  }

  private getSystemPromptForMode(
    mode: AILearningMode, 
    contextData: string = '',
    studentContext?: StudentContext
  ): string {
    const hasNotebookContext = contextData.length > 50;

    // Use the centralized Scholarly AI prompt builder
    return buildScholarlySystemPrompt({
      mode,
      studentContext,
      retrievedContext: contextData || undefined,
      hasNotebookContext,
    });
  }

  private getProviderForMode(mode: AILearningMode): AIProvider {
    // We now have unlimited Gemini 2.5 Flash, so we use it for EVERYTHING!
    // No more falling back to the free tier of Groq.
    return this.primaryProvider; 
  }

  async generateGroundedResponse(
    mode: AILearningMode, 
    history: ChatMessage[], 
    contextData?: string,
    studentContext?: StudentContext
  ) {
    const provider = this.getProviderForMode(mode);
    const systemPrompt = this.getSystemPromptForMode(mode, contextData, studentContext);
    
    try {
      return await provider.generateResponse(history, systemPrompt);
    } catch (error) {
      console.error(`[AI Orchestrator] Primary provider (${provider.constructor.name}) failed. Falling back to Groq...`, error);
      // Fallback to Groq if Gemini hits a temporary error or rate limit
      return await this.fastProvider.generateResponse(history, systemPrompt);
    }
  }

  async *generateStreamGroundedResponse(
    mode: AILearningMode, 
    history: ChatMessage[], 
    contextData?: string,
    studentContext?: StudentContext
  ) {
    const provider = this.getProviderForMode(mode);
    const systemPrompt = this.getSystemPromptForMode(mode, contextData, studentContext);
    
    try {
      if (provider.generateStreamResponse) {
        yield* provider.generateStreamResponse(history, systemPrompt);
      } else {
        const response = await provider.generateResponse(history, systemPrompt);
        yield response.reply;
      }
    } catch (error) {
      console.error(`[AI Orchestrator] Primary stream provider (${provider.constructor.name}) failed. Falling back to Groq stream...`, error);
      if (this.fastProvider.generateStreamResponse) {
        yield* this.fastProvider.generateStreamResponse(history, systemPrompt);
      } else {
        const fallbackResponse = await this.fastProvider.generateResponse(history, systemPrompt);
        yield fallbackResponse.reply;
      }
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
