import { BloomLevel, QueryCategory, WorkflowName } from './types';

/**
 * PromptLibrary (Task 5) — a registry of reusable, composable prompt DIRECTIVE fragments. These
 * are NOT replacements for the production system prompt (config/prompts.ts is untouched); they are
 * adaptive style directives the PromptBuilder layers on top, so behavior only changes when the
 * dynamic-prompt flag is on.
 *
 * The library exposes: named role templates (teacher/exam/tutor/revision/problem_solver/research/
 * quiz), a Bloom-level directive map, and depth directives — all pure strings.
 */
export type PromptTemplateName =
  | 'teacher'
  | 'exam'
  | 'tutor'
  | 'revision'
  | 'problem_solver'
  | 'research'
  | 'quiz';

const TEMPLATES: Record<PromptTemplateName, string> = {
  teacher: 'Teach as an expert mentor: build intuition first, then precision. Connect the idea to what the student already knows.',
  exam: 'Answer in exam-optimal form: lead with the marks-scoring points, use the phrasing examiners reward, and stay within a realistic word budget.',
  tutor: 'Act as a patient 1:1 tutor: check the student\'s current understanding, address the specific gap, and confirm the takeaway at the end.',
  revision: 'Produce high-yield revision: dense bullets, key facts/formulas/dates, memory hooks, and 2-3 rapid self-test prompts.',
  problem_solver: 'Solve methodically: restate the goal, list givens, choose the method, show each step, then state and sanity-check the result.',
  research: 'Give a comprehensive, multi-perspective treatment: context, competing viewpoints, evidence, and nuance beyond the syllabus.',
  quiz: 'Assess actively: ask one question at a time, adapt difficulty to the answer, and explain the "why" after each response.',
};

/** Category → default role template. */
const CATEGORY_TEMPLATE: Partial<Record<QueryCategory, PromptTemplateName>> = {
  definition: 'teacher',
  concept_explanation: 'teacher',
  comparison: 'teacher',
  summary: 'revision',
  revision: 'revision',
  quiz_generation: 'quiz',
  problem_solving: 'problem_solver',
  numerical: 'problem_solver',
  homework_help: 'tutor',
  assignment_help: 'tutor',
  research: 'research',
  coding: 'problem_solver',
  debugging: 'problem_solver',
};

const WORKFLOW_TEMPLATE: Partial<Record<WorkflowName, PromptTemplateName>> = {
  definition: 'teacher',
  concept: 'teacher',
  revision: 'revision',
  quiz: 'quiz',
  problem_solving: 'problem_solver',
  research: 'research',
  homework: 'tutor',
};

const BLOOM_DIRECTIVE: Record<BloomLevel, string> = {
  remember: 'Cognitive level: RECALL. Give the precise fact/definition first, then at most one clarifying sentence. Be crisp.',
  understand: 'Cognitive level: UNDERSTAND. Explain in plain language with a simple analogy and one concrete example; prioritize intuition over formalism.',
  apply: 'Cognitive level: APPLY. Walk through a reusable method step by step: state the approach, show each step, then the result.',
  analyze: 'Cognitive level: ANALYZE. Break the topic into parts and expose the relationships; use a structured layout (comparison table or labelled points).',
  evaluate: 'Cognitive level: EVALUATE. Weigh options against explicit criteria and give a justified judgement; present trade-offs before the recommendation.',
  create: 'Cognitive level: CREATE. Scaffold the student\'s own construction: outline components and offer a framework/template rather than a finished artifact.',
};

export class PromptLibrary {
  /** Pick the role template for a category/workflow (category wins, workflow is the fallback). */
  templateFor(category: QueryCategory, workflow: WorkflowName): PromptTemplateName {
    return CATEGORY_TEMPLATE[category] || WORKFLOW_TEMPLATE[workflow] || 'teacher';
  }

  template(name: PromptTemplateName): string {
    return TEMPLATES[name];
  }

  bloomDirective(level: BloomLevel): string {
    return BLOOM_DIRECTIVE[level];
  }

  /** Names of all available templates (for observability / admin). */
  templateNames(): PromptTemplateName[] {
    return Object.keys(TEMPLATES) as PromptTemplateName[];
  }
}

export const promptLibrary = new PromptLibrary();
