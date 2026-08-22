/**
 * @file AINodes.ts
 * @description Educational AI generation nodes for Scholarly Automation Studio.
 */

import { z } from 'zod';
import { WorkflowNodeHandler } from '../WorkflowNodeRegistry';
import { WorkflowExecutionContext } from '../../types/workflow.types';
import { container, TOKENS } from '../../../di/container';
import { IAIProvider } from '../../../interfaces/IAIProvider';

export const GenerateRemedialLessonNode: WorkflowNodeHandler = {
  type: 'GENERATE_REMEDIAL_LESSON',
  category: 'AI',
  label: 'Generate Remedial Lesson',
  description: 'Generates a focused, structured markdown remedial lesson targeting student learning gaps.',
  icon: 'Sparkles',
  requiresStudent: true,
  configSchema: z.object({
    topic: z.string().optional(),
    syllabusNodeId: z.string().optional(),
    maxWords: z.number().int().min(100).max(2000).default(500)
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    topic: z.string(),
    syllabusNodeId: z.string().optional(),
    lessonMarkdown: z.string(),
    tokensUsed: z.number().optional()
  }),
  validateConfig() {
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config, input) {
    const topic =
      config.topic ||
      (input as any)?.topic ||
      (input as any)?.weakTopics?.[0]?.topic ||
      'Core Concept Revision';

    const syllabusNodeId = config.syllabusNodeId || (input as any)?.weakTopics?.[0]?.syllabusNodeId;

    if (ctx.isSimulation) {
      return {
        topic,
        syllabusNodeId,
        lessonMarkdown: `## Simulated Remedial Lesson: ${topic}\n\nThis is a simulated remedial study guide generated in simulation mode.`,
        tokensUsed: 0
      };
    }

    const aiProvider = container.resolve<IAIProvider>(TOKENS.AIProvider);

    const prompt = `You are Sadhya, an expert tutor. Generate a concise, high-impact remedial lesson for a student struggling with "${topic}".
Include:
1. Core intuition & formula/rule
2. Step-by-step worked example
3. Common misconceptions & pitfalls to avoid
4. 2 quick self-check questions with solutions.
Word limit: ~${config.maxWords ?? 500} words. Format in clean GitHub markdown.`;

    const response = await aiProvider.generateResponse(
      [{ role: 'user', content: prompt }],
      'You are Sadhya, Scholarly AI pedagogical engine.',
      { userId: ctx.studentId }
    );

    return {
      topic,
      syllabusNodeId,
      lessonMarkdown: response.reply,
      tokensUsed: response.telemetry?.tokensUsed
    };
  }
};

export const GenerateConceptExplanationNode: WorkflowNodeHandler = {
  type: 'GENERATE_CONCEPT_EXPLANATION',
  category: 'AI',
  label: 'Generate Concept Explanation',
  description: 'Explains complex topics with intuitive analogies and conceptual breakdowns.',
  icon: 'MessageSquare',
  configSchema: z.object({
    concept: z.string().min(1),
    targetAudience: z.string().default('High School / Competitive Exam Aspirant')
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    concept: z.string(),
    explanation: z.string()
  }),
  validateConfig(config) {
    if (!config.concept) {
      return { valid: false, errors: ['concept is required.'] };
    }
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config) {
    if (ctx.isSimulation) {
      return {
        concept: config.concept,
        explanation: `Simulated explanation for ${config.concept}.`
      };
    }

    const aiProvider = container.resolve<IAIProvider>(TOKENS.AIProvider);
    const response = await aiProvider.generateResponse(
      [
        {
          role: 'user',
          content: `Explain the concept "${config.concept}" clearly for a ${config.targetAudience}. Use a memorable real-world analogy.`
        }
      ],
      'You are Sadhya, Scholarly AI pedagogical engine.'
    );

    return {
      concept: config.concept,
      explanation: response.reply
    };
  }
};
