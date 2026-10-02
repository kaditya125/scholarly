import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { PlanProposal, proposePlan } from '../runtime/PlanProposer';
import { isStepInputRef } from '../runtime/stepRefs';
import { loadStudentContext, summarizeForModel } from '../memory/studentContext';
import { todayIn } from '../tools/adapters/plan.adapter';
import { WorkflowTemplate } from './WorkflowTemplate';
import { stepOutcomes } from './summaryText';

/**
 * "Prepare me for X" — the personal learning agent (Phase 7; golden case 5: "Prepare me for SSC
 * CGL in 90 days").
 *
 *   context     get_student_context     selective memory: profile, saved goal, history, plans
 *   goal        resolve_exam_goal       exam identification, days available, minutes a day
 *   structure   get_exam_structure      the official syllabus: stages, marks, times, topics   ┐
 *   readiness   get_exam_readiness      the student's coverage and weak topics in this exam  ├ in parallel
 *   papers      check_past_papers       which real past papers exist to practise with        ┘
 *   plan        build_exam_prep_plan    phases, weekly milestones, first week, strategy (code)
 *   save        create_studyplan_artifact
 *
 * That is the default plan. A model may propose a different one for the goal in hand (drop a
 * step, say, for a student with no history), from these tools only; PlanProposer checks it and
 * falls back to this plan. The study plan itself is always computed, never written by a model.
 */

export const PREP_TOOLS = [
  'get_student_context',
  'resolve_exam_goal',
  'get_exam_structure',
  'get_exam_readiness',
  'check_past_papers',
  'build_exam_prep_plan',
  'create_studyplan_artifact',
];
const MAX_PLAN_STEPS = 8;

/** The workflow's own rules for any plan, proposed or not: the core steps, wired to each other. */
export function prepPolicy(plan: AgentPlan): string[] {
  const problems: string[] = [];
  const byTool = new Map(plan.steps.map((s) => [s.tool, s]));
  for (const t of ['resolve_exam_goal', 'get_exam_structure', 'build_exam_prep_plan', 'create_studyplan_artifact']) {
    if (!byTool.has(t)) problems.push(`it has no ${t} step`);
  }
  const refTo = (value: unknown, tool: string, path?: string) =>
    isStepInputRef(value) && plan.steps.find((s) => s.id === value.$ref)?.tool === tool && (path === undefined || value.path === path);
  const build = byTool.get('build_exam_prep_plan');
  const save = byTool.get('create_studyplan_artifact');
  const structure = byTool.get('get_exam_structure');
  if (build) {
    if (!refTo(build.input.goal, 'resolve_exam_goal')) problems.push("the plan step doesn't take the exam goal");
    if (!refTo(build.input.structure, 'get_exam_structure')) problems.push("the plan step doesn't take the exam's structure");
  }
  if (save && !refTo(save.input.plan, 'build_exam_prep_plan', 'spec')) problems.push("the save step doesn't save the built plan");
  if (structure && !refTo(structure.input.examId, 'resolve_exam_goal', 'examId')) problems.push("the structure step isn't for the identified exam");
  return problems;
}

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const list = (items: string[], max: number) => (items.length > max ? `${items.slice(0, max).join(', ')} and ${items.length - max} more` : items.join(', '));

export const examPrepWorkflow: WorkflowTemplate = {
  id: 'exam_prep',
  title: 'Exam preparation plan',
  description: 'Prepares a student for an exam: their context, the official syllabus, where they stand, the time they have, and a week-by-week plan with a practice strategy.',
  budget: { maxSteps: MAX_PLAN_STEPS, maxToolCalls: 14, maxExecutionMs: 150_000 },

  buildPlan(goal: string): AgentPlan {
    const ref = (step: string, path?: string) => (path ? { $ref: step, path } : { $ref: step });
    return {
      goal,
      workflowId: 'exam_prep',
      estimatedComplexity: 'high',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'exam', description: 'The exam is identified and its official structure read' },
        { id: 'state', description: "The plan starts from the student's own practice, not an assumption" },
        { id: 'time', description: 'Days and daily minutes come from the student or are stated as defaults' },
        { id: 'plan', description: 'A week-by-week plan with milestones and a practice strategy is saved for the student' },
      ],
      steps: [
        { id: 'context', objective: "Read only the student context the plan needs", label: 'Checking your profile and practice', type: 'retrieve', tool: 'get_student_context', input: { slices: ['profile', 'goal', 'history', 'plans'] }, dependsOn: [] },
        { id: 'goal', objective: 'Identify the exam, the days available and minutes a day', label: 'Identifying the exam and your time', type: 'analyze', tool: 'resolve_exam_goal', input: { query: goal.slice(0, 400), context: ref('context') }, dependsOn: ['context'] },
        { id: 'structure', objective: "Read the exam's official structure and topics", label: 'Reading the official syllabus', type: 'retrieve', tool: 'get_exam_structure', input: { examId: ref('goal', 'examId'), papersNamed: ref('goal', 'papersNamed') }, dependsOn: ['goal'] },
        { id: 'readiness', objective: 'See where the student stands in this exam', label: 'Checking where you stand', type: 'analyze', tool: 'get_exam_readiness', input: { examId: ref('goal', 'examId') }, dependsOn: ['goal'] },
        { id: 'papers', objective: 'Find which real past papers exist to practise with', label: 'Checking past papers', type: 'retrieve', tool: 'check_past_papers', input: { examId: ref('goal', 'examId'), examName: ref('goal', 'shortName') }, dependsOn: ['goal'] },
        {
          id: 'plan',
          objective: 'Build the week-by-week plan',
          label: 'Building your plan',
          type: 'generate',
          tool: 'build_exam_prep_plan',
          input: { goal: ref('goal'), structure: ref('structure'), readiness: ref('readiness'), pastPapers: ref('papers'), context: ref('context') },
          dependsOn: ['goal', 'structure', 'readiness', 'papers', 'context'],
        },
        { id: 'save', objective: 'Save the plan for the student', label: 'Saving your plan', type: 'export', tool: 'create_studyplan_artifact', input: { plan: ref('plan', 'spec') }, dependsOn: ['plan'] },
      ],
    };
  },

  async proposePlan({ goal, userId, registry, budget }): Promise<PlanProposal> {
    // Selective memory for planning: a few lines about the student, not their record.
    const facts = summarizeForModel(await loadStudentContext(userId, ['profile', 'goal', 'history', 'weakTopics', 'plans']));
    return proposePlan({
      goal,
      workflowId: 'exam_prep',
      userId,
      facts,
      allow: PREP_TOOLS,
      template: examPrepWorkflow.buildPlan(goal),
      registry,
      budget,
      policy: prepPolicy,
      maxSteps: MAX_PLAN_STEPS,
      today: todayIn(),
    });
  },

  evaluate({ steps, outputs }): AgentRunResult {
    const { completed, failed } = stepOutcomes(steps);
    const goal = outputs.get('goal') as any;
    if (!goal) {
      return {
        outcome: 'no_result',
        summary: failed.length ? `I couldn't work out which exam to plan for: ${failed.join('; ')}.` : "I couldn't work out which exam to plan for. Tell me the exam, for example “Prepare me for SSC CGL in 90 days”.",
        data: {},
        completed,
        failed,
      };
    }
    const structure = outputs.get('structure') as any;
    const built = outputs.get('plan') as any;
    const saved = outputs.get('save') as any;
    if (!built?.spec || !saved?.artifactId) {
      return {
        outcome: built?.spec ? 'partial' : 'no_result',
        summary: `I identified ${goal.shortName}${structure ? ' and read its official syllabus' : ''}, but couldn't ${built?.spec ? 'save the plan' : 'build the plan'}${failed.length ? `: ${failed.join('; ')}` : ''}.`,
        data: { examId: goal.examId },
        completed,
        failed,
      };
    }
    const spec = built.spec;
    const readiness = outputs.get('readiness') as any;
    const papers = outputs.get('papers') as any;
    const scopeText = (spec.exam?.scope ?? []).map((path: string) => {
      const part = (structure?.scope ?? []).find((p: any) => p.path === path);
      return part?.questionCount && part?.durationMinutes ? `${path} (${part.questionCount} questions, ${part.durationMinutes} minutes)` : path;
    });
    const horizonText =
      goal.horizon.source === 'goal'
        ? `${goal.horizon.days} days, ${fmtDate(spec.startDate)} – ${fmtDate(goal.horizon.endDate)}`
        : goal.horizon.source === 'saved_goal'
          ? `${goal.horizon.days} days, to the day before your saved exam date`
          : `${goal.horizon.days} days — you didn't give a date, so this is a four-week plan; tell me your exam date for a full one`;
    const minutesText =
      goal.dailyMinutes.source === 'goal'
        ? `${goal.dailyMinutes.value} minutes a day`
        : goal.dailyMinutes.source === 'profile'
          ? `${goal.dailyMinutes.value} minutes a day (from your profile)`
          : goal.dailyMinutes.source === 'saved_goal'
            ? `${goal.dailyMinutes.value} minutes a day (from your saved weekly hours)`
            : `${goal.dailyMinutes.value} minutes a day — you didn't say how long you can study, so I used ${goal.dailyMinutes.value}; tell me yours and I'll re-plan`;
    const touched = Object.keys(readiness?.leafStates ?? {}).length;
    const weak = (readiness?.weakTopics ?? []).filter((w: any) => w.confidence >= 0.5).slice(0, 3);
    const whereText = !readiness
      ? "I couldn't read your practice history, so the plan starts every topic fresh."
      : !readiness.practised
        ? `You haven't practised ${goal.shortName} in Sadhya yet, so every topic starts fresh.`
        : `You've practised ${touched} syllabus ${touched === 1 ? 'topic' : 'topics'}${weak.length ? `; weakest: ${weak.map((w: any) => `${w.topic} (${w.accuracy}%)`).join(', ')} — they come first` : ''}.`;
    const o = spec.outlook;
    const fitText = o
      ? o.fitsInTime
        ? `A first pass over all ${o.units} topics needs about ${o.firstPassHours} hours, and the learning weeks give ${o.availableHours} hours: it fits.`
        : `A first pass over all ${o.units} topics needs about ${o.firstPassHours} hours; the learning weeks give ${o.availableHours} hours. ${o.note}`
      : '';
    const shares = (built.subjectShares ?? []) as Array<{ subject: string; share: number; basis: string }>;
    const shareText = shares.length
      ? shares[0].basis === 'marks'
        ? `Time follows the official marks: ${[...shares].sort((a, b) => b.share - a.share).map((s) => `${s.subject} ${Math.round(s.share * 100)}%`).join(', ')}.`
        : `The syllabus records no marks, so subjects share the time equally.`
      : '';
    const weeks: any[] = spec.weeks ?? [];
    const phaseSpan = (phase: string) => {
      const ws = weeks.filter((w) => w.phase === phase).map((w) => w.week);
      return ws.length ? (ws.length === 1 ? `week ${ws[0]}` : `weeks ${ws[0]}–${ws[ws.length - 1]}`) : '';
    };
    const phaseText = [
      phaseSpan('learn') && `${phaseSpan('learn')} learn`,
      phaseSpan('practise') && `${phaseSpan('practise')} timed practice`,
      phaseSpan('revise') && `${phaseSpan('revise')} full tests and revision`,
    ].filter(Boolean).join(' · ');
    const notIncluded: string[] = spec.exam?.notIncluded ?? [];

    return {
      outcome: 'success',
      summary: [
        `## ${spec.title}`,
        '',
        `**Exam:** ${goal.examName}${structure?.source?.title ? `, planned from the official syllabus (${structure.source.title})` : ''}.`,
        scopeText.length ? `**Covers:** ${scopeText.join(' and ')}.${notIncluded.length ? ` Not included: ${list(notIncluded, 3)} — tell me if you're taking ${notIncluded.length === 1 ? 'it' : 'them'}.` : ''}` : undefined,
        `**Where you are:** ${whereText}`,
        `**Time:** ${horizonText}, at ${minutesText}. ${fitText}`,
        `**Plan:** ${phaseText}. ${shareText}`,
        weeks[0] ? `**Week 1:** ${weeks[0].milestone}` : undefined,
        papers?.note ? `**Past papers:** ${papers.note}` : undefined,
        '',
        'Open the plan on the right for every week, this week day by day, and the practice strategy.',
      ]
        .filter((line) => line !== undefined)
        .join('\n'),
      data: { artifactId: saved.artifactId, examId: goal.examId, weeks: weeks.length, horizonDays: goal.horizon.days },
      completed,
      failed,
    };
  },
};
