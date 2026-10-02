import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { WorkflowTemplate } from './WorkflowTemplate';

/**
 * Exam overview — the Phase 1 reference workflow.
 *
 * "Give me an overview of the SSC CGL exam" becomes three real tool calls:
 *   1. resolve_exam_id           — which exam in Sadhya's corpus is meant
 *   2. get_exam_syllabus         — the official syllabus structure        ┐ run in parallel,
 *   3. get_exam_pattern_analytics — what past papers actually emphasise   ┘ both depend on (1)
 *
 * No model call is involved: the summary is assembled from the tools' outputs. If the exam is not
 * in the corpus, the run says so plainly (outcome `no_result`) instead of describing the exam from
 * general knowledge — the same "backend states absence" rule the chat pipeline follows.
 */

interface SyllabusNode {
  nodeId: string;
  type: string;
  name: string;
  order: number;
  parentPath: string[];
}

function topLevelSections(nodes: SyllabusNode[]): string[] {
  if (!nodes.length) return [];
  const minDepth = Math.min(...nodes.map((n) => n.parentPath?.length ?? 0));
  // Prefer the shallowest level that holds more than one node (a single root is usually the exam).
  for (let depth = minDepth; depth <= minDepth + 2; depth++) {
    const level = nodes.filter((n) => (n.parentPath?.length ?? 0) === depth).sort((a, b) => a.order - b.order);
    if (level.length > 1) return level.map((n) => n.name);
  }
  return nodes.filter((n) => (n.parentPath?.length ?? 0) === minDepth).map((n) => n.name);
}

function formatDistribution(dist: unknown, limit = 5): string[] {
  if (!dist || typeof dist !== 'object') return [];
  const entries = Object.entries(dist as Record<string, unknown>)
    .map(([k, v]) => [k, typeof v === 'number' ? v : Number((v as any)?.count ?? (v as any)?.percentage ?? NaN)] as const)
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, limit);
  return entries.map(([k, v]) => `${k}: ${v}`);
}

export const examOverviewWorkflow: WorkflowTemplate = {
  id: 'exam_overview',
  title: 'Exam overview',
  description: "Summarises an exam's official syllabus and what its past papers emphasise, from Sadhya's verified corpus.",
  budget: { maxSteps: 4, maxToolCalls: 8, maxExecutionMs: 90_000 },

  buildPlan(goal: string): AgentPlan {
    return {
      goal,
      workflowId: 'exam_overview',
      estimatedComplexity: 'low',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'exam_resolved', description: 'The exam is identified in Sadhya’s verified corpus' },
        { id: 'evidence_found', description: 'The official syllabus or past-paper analytics were retrieved' },
      ],
      steps: [
        {
          id: 'resolve_exam',
          objective: 'Identify the exam the student means',
          label: 'Identifying the exam',
          type: 'retrieve',
          tool: 'resolve_exam_id',
          input: { query: goal.slice(0, 300) },
          dependsOn: [],
        },
        {
          id: 'syllabus',
          objective: 'Read the official syllabus structure',
          label: 'Reading the official syllabus',
          type: 'retrieve',
          tool: 'get_exam_syllabus',
          input: { examId: { $ref: 'resolve_exam', path: 'examId' } },
          dependsOn: ['resolve_exam'],
          optional: true,
        },
        {
          id: 'pattern',
          objective: 'Measure what past papers emphasise',
          label: 'Analysing past-paper patterns',
          type: 'analyze',
          tool: 'get_exam_pattern_analytics',
          input: { examId: { $ref: 'resolve_exam', path: 'examId' } },
          dependsOn: ['resolve_exam'],
          optional: true,
        },
      ],
    };
  },

  evaluate({ goal, steps, outputs }): AgentRunResult {
    const completed: string[] = [];
    const failed: string[] = [];
    for (const s of steps.values()) {
      if (s.status === 'completed') completed.push(s.label);
      else if (s.status === 'failed') failed.push(`${s.label} — ${s.error?.message ?? 'failed'}`);
    }

    const examId = (outputs.get('resolve_exam') as any)?.examId as string | null | undefined;
    if (!examId) {
      const resolveState = steps.get('resolve_exam');
      if (resolveState?.status === 'completed') {
        return {
          outcome: 'no_result',
          summary:
            `**I couldn't find that exam in Sadhya's verified corpus.** ` +
            `I checked for “${goal.slice(0, 120)}” and no exam matched, so I won't describe it from general knowledge.`,
          completed,
          failed,
        };
      }
      return {
        outcome: 'no_result',
        summary: "I couldn't identify the exam, so there is nothing reliable to summarise yet.",
        completed,
        failed,
      };
    }

    const syllabus = outputs.get('syllabus') as any;
    const pattern = outputs.get('pattern') as any;
    const lines: string[] = [`## ${examId.replace(/_/g, ' ')} — overview from Sadhya's verified corpus`];
    const data: Record<string, unknown> = { examId };

    if (syllabus?.available) {
      const sections = topLevelSections((syllabus.nodes ?? []) as SyllabusNode[]).slice(0, 12);
      lines.push(
        '',
        `**Official syllabus** — version ${syllabus.version ?? 'unknown'}` +
          `${syllabus.authority ? ` (${syllabus.authority})` : ''}, ${syllabus.nodeCount ?? 0} syllabus entries.`,
      );
      if (sections.length) lines.push(`Main parts: ${sections.join(', ')}.`);
      data.syllabus = { version: syllabus.version ?? null, nodeCount: syllabus.nodeCount ?? 0, sections };
    } else if (steps.get('syllabus')?.status === 'completed') {
      lines.push('', 'Sadhya does not hold an official syllabus for this exam yet.');
      data.syllabus = { available: false };
    }

    const total = Number(pattern?.totalQuestionsAnalyzed ?? 0);
    if (pattern && total > 0) {
      const topics: any[] = Array.isArray(pattern.highYieldTopics) ? pattern.highYieldTopics.slice(0, 8) : [];
      // "questions in Sadhya's corpus", never "verified past questions": the PYQ corpus is known to
      // carry entries whose official provenance is not established, so the count is honest about
      // what it counts (stored questions) rather than asserting each one is a genuine past paper.
      lines.push('', `**What past papers emphasise** — measured from ${total} questions in Sadhya's corpus${pattern.yearsCovered?.length ? ` (${pattern.yearsCovered.join(', ')})` : ''}.`);
      const subjects = formatDistribution(pattern.subjectDistribution);
      if (subjects.length) lines.push(`Subjects by question count: ${subjects.join(' · ')}.`);
      if (topics.length) {
        lines.push(
          'Most-tested topics: ' +
            topics
              .map((t) => `${t.topic}${t.subject ? ` (${t.subject})` : ''}${Number.isFinite(t.percentageWeight) ? ` ~${t.percentageWeight}%` : ''}`)
              .join('; ') +
            '.',
        );
      }
      lines.push('_These figures are observed from the stored questions, not an official weighting, and individual questions vary in how firmly their source is established._');
      data.pattern = {
        totalQuestionsAnalyzed: total,
        highYieldTopics: topics.map((t) => ({ topic: t.topic, subject: t.subject, percentageWeight: t.percentageWeight })),
      };
    } else if (steps.get('pattern')?.status === 'completed') {
      lines.push('', 'Sadhya has no past questions to analyse for this exam yet.');
    }

    const gotSyllabus = Boolean(syllabus?.available);
    const gotPattern = total > 0;
    const outcome = gotSyllabus && gotPattern ? 'success' : gotSyllabus || gotPattern ? 'partial' : 'no_result';
    if (failed.length) lines.push('', `Not completed: ${failed.join('; ')}.`);

    return { outcome, summary: lines.join('\n'), data, completed, failed };
  },
};
