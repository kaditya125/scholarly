import { db as adminDb } from '../config/firebase';
import { GeminiProvider } from './ai/gemini.provider';

export interface UserMemory {
  weakTopics: string[];
  strongTopics: string[];
  learningSpeed: 'slow' | 'medium' | 'fast';
  comprehensionDepth: 'beginner' | 'intermediate' | 'advanced'; // Adaptive depth
  lastRevisionDate: string;
  preferredModes: string[];
  conceptGraph: Record<string, string[]>; // Topic -> Related Topics
}

export class UserMemoryService {
  private llmProvider: GeminiProvider;

  constructor() {
    this.llmProvider = new GeminiProvider();
  }

  async getUserMemory(userId: string): Promise<UserMemory | null> {
    const doc = await adminDb.collection('users').doc(userId).collection('memory').doc('global').get();
    return doc.exists ? doc.data() as UserMemory : null;
  }

  /**
   * Analyzes a chat interaction to extract memory insights (e.g., struggling with a topic)
   */
  async updateMemoryFromInteraction(userId: string, userMessage: string, aiResponse: string) {
    const currentMemory = await this.getUserMemory(userId) || {
      weakTopics: [],
      strongTopics: [],
      learningSpeed: 'medium',
      comprehensionDepth: 'beginner',
      lastRevisionDate: new Date().toISOString(),
      preferredModes: [],
      conceptGraph: {}
    };

    // Fast AI extraction of learning insights
    const prompt = `Analyze this interaction between a student and a teacher AI.
    Student: "${userMessage}"
    Teacher: "${aiResponse}"
    
    Extract a single comma-separated list of topics the student seems to be STRUGGLING with. If none, output "NONE".`;

    try {
      const insight = await this.llmProvider.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }] as any);
      const newWeakTopics = insight.reply.split(',').map((t: string) => t.trim().toLowerCase()).filter((t: string) => t !== 'none' && t !== '');

      if (newWeakTopics.length > 0) {
        const updatedWeakTopics = Array.from(new Set([...currentMemory.weakTopics, ...newWeakTopics]));
        
        await adminDb.collection('users').doc(userId).collection('memory').doc('global').set({
          ...currentMemory,
          weakTopics: updatedWeakTopics,
          lastInteractionDate: new Date().toISOString()
        }, { merge: true });
      }
    } catch (e) {
      console.error('Failed to update user memory:', e);
    }
  }

  /**
   * Generates a logical learning path based on the user's current topic and concept graph.
   */
  async generateLearningPath(userId: string, currentTopic: string): Promise<string[]> {
    const memory = await this.getUserMemory(userId);
    if (!memory || !memory.conceptGraph[currentTopic]) {
      // Use LLM to generate a quick path if not in graph
      const prompt = `Generate a logical 3-step learning path following the topic "${currentTopic}". Return ONLY a comma-separated list of 3 topics.`;
      try {
        const res = await this.llmProvider.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }] as any);
        return res.reply.split(',').map((t: string) => t.trim());
      } catch (e) {
        return ['Review Fundamentals', 'Practice Questions', 'Advanced Applications'];
      }
    }
    return memory.conceptGraph[currentTopic].slice(0, 3);
  }

  /**
   * Formats the user's memory into a prompt string for the Orchestrator
   */
  async getMemoryPromptContext(userId: string): Promise<string> {
    const memory = await this.getUserMemory(userId);
    if (!memory) return '';

    // Adaptive teaching logic
    let depthModifier = '';
    if (memory.comprehensionDepth === 'beginner') {
      depthModifier = 'The student is a beginner. Explain concepts step-by-step with simple analogies.';
    } else if (memory.comprehensionDepth === 'advanced') {
      depthModifier = 'The student has advanced comprehension. Skip basic definitions and focus on edge cases, derivations, and complex applications.';
    }

    return `\nSTUDENT PROFILE:
- Struggles with: ${memory.weakTopics.join(', ')}
- Excels at: ${memory.strongTopics.join(', ')}
- Adaptive Instruction: ${depthModifier}
Adapt your teaching style to this profile.`;
  }
}

export const userMemoryService = new UserMemoryService();
