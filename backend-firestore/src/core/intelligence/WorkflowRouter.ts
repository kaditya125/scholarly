import { QueryCategory, WorkflowDefinition, WorkflowName } from './types';

/**
 * Adaptive Workflow Router (Task 3) — maps a category to a named workflow with its execution
 * profile (retrieval strategy, model tier, prompt template, streaming, memory, verification).
 * Pure decision table. The WorkflowEngine consults the returned definition; consumption of the
 * non-default fields is enabled incrementally behind flags so today's pipeline is preserved.
 */
const WORKFLOWS: Record<WorkflowName, WorkflowDefinition> = {
  greeting:        { name: 'greeting',        retrievalStrategy: 'none',                 modelTier: 'fast',      promptTemplate: 'greeting',        streaming: true,  useMemory: false, verification: 'none' },
  conversation:    { name: 'conversation',    retrievalStrategy: 'none',                 modelTier: 'fast',      promptTemplate: 'conversation',    streaming: true,  useMemory: true,  verification: 'none' },
  definition:      { name: 'definition',      retrievalStrategy: 'vector',               modelTier: 'fast',      promptTemplate: 'teacher',         streaming: true,  useMemory: true,  verification: 'lightweight' },
  concept:         { name: 'concept',         retrievalStrategy: 'graphrag',             modelTier: 'reasoning', promptTemplate: 'teacher',         streaming: true,  useMemory: true,  verification: 'full' },
  revision:        { name: 'revision',        retrievalStrategy: 'weak_topics_notebook', modelTier: 'balanced',  promptTemplate: 'teacher',         streaming: true,  useMemory: true,  verification: 'lightweight' },
  quiz:            { name: 'quiz',            retrievalStrategy: 'graphrag',             modelTier: 'balanced',  promptTemplate: 'teacher',         streaming: true,  useMemory: true,  verification: 'lightweight' },
  problem_solving: { name: 'problem_solving', retrievalStrategy: 'graphrag_reasoning',   modelTier: 'reasoning', promptTemplate: 'teacher',         streaming: true,  useMemory: true,  verification: 'full' },
  research:        { name: 'research',        retrievalStrategy: 'graph_web',            modelTier: 'reasoning', promptTemplate: 'teacher',         streaming: true,  useMemory: true,  verification: 'full' },
  coding:          { name: 'coding',          retrievalStrategy: 'graphrag',             modelTier: 'reasoning', promptTemplate: 'teacher',         streaming: true,  useMemory: true,  verification: 'lightweight' },
  notebook:        { name: 'notebook',        retrievalStrategy: 'notebook',             modelTier: 'balanced',  promptTemplate: 'teacher',         streaming: true,  useMemory: true,  verification: 'full' },
  planner:         { name: 'planner',         retrievalStrategy: 'graphrag',             modelTier: 'balanced',  promptTemplate: 'teacher',         streaming: true,  useMemory: true,  verification: 'none' },
  homework:        { name: 'homework',        retrievalStrategy: 'graph_memory',         modelTier: 'reasoning', promptTemplate: 'teacher',         streaming: true,  useMemory: true,  verification: 'full' },
};

const CATEGORY_TO_WORKFLOW: Record<QueryCategory, WorkflowName> = {
  greeting: 'greeting',
  casual_conversation: 'conversation',
  general_chat: 'conversation',
  translation: 'conversation',
  definition: 'definition',
  summary: 'definition',
  concept_explanation: 'concept',
  comparison: 'concept',
  image_explanation: 'concept',
  follow_up: 'concept',
  multi_topic: 'concept',
  unknown: 'concept',
  career_guidance: 'planner',
  planning: 'planner',
  revision: 'revision',
  quiz_generation: 'quiz',
  problem_solving: 'problem_solving',
  numerical: 'problem_solving',
  research: 'research',
  coding: 'coding',
  debugging: 'coding',
  notebook_search: 'notebook',
  document_question: 'notebook',
  homework_help: 'homework',
  assignment_help: 'homework',
};

export class WorkflowRouter {
  route(category: QueryCategory): WorkflowDefinition {
    const name = CATEGORY_TO_WORKFLOW[category] ?? 'concept';
    return WORKFLOWS[name];
  }
  /** The behavior-preserving default (today's pipeline). */
  default(): WorkflowDefinition {
    return WORKFLOWS.concept;
  }
}

export const workflowRouter = new WorkflowRouter();
