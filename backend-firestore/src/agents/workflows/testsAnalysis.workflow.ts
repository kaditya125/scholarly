import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { WANTS_REVISION_PLAN } from '../tools/adapters/plan.adapter';
import { WorkflowTemplate } from './WorkflowTemplate';
import { planningSteps } from './quizMistakes.workflow';
import { describePlan } from './revisionPlan.workflow';
import { stepOutcomes } from './summaryText';

/**
 * Golden case 3: "Analyze my last 5 tests and create a revision plan."
 *
 *   1. get_my_test_history          test history: their latest scored quizzes and tests
 *   2. analyze_performance          weakness analysis across all of them
 *   3. map_weak_areas_to_syllabus   syllabus mapping (exact by node, else clearly by name)
 *   4. create_report_artifact       the analysis, saved
 *   5. build_revision_plan          study plan for the weak areas        ┐ when a plan is
 *   6. create_studyplan_artifact    the plan, saved                      ┘ asked for
 */

/** "2 quizzes", "1 quiz and 3 tests". */
const kinds = (c: { quizzes: number; tests: number }) =>
  [c.quizzes ? `${c.quizzes} quiz${c.quizzes === 1 ? '' : 'zes'}` : '', c.tests ? `${c.tests} test${c.tests === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');

/** A syllabus location for a chat line: the top level dropped, and each level cut at its first clause. */
export const shortPath = (path: string[]) =>
  path
    .slice(path.length > 2 ? 1 : 0)
    .map((p) => {
      const first = p.split(/;\s*/)[0];
      return first.length > 70 ? `${first.slice(0, 69).trimEnd()}…` : first;
    })
    .join(' › ');

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** "my last 5 tests" / "my last three quizzes" → how many attempts to read (default 5). */
export function attemptCountFromGoal(goal: string): number {
  const m = String(goal ?? '').toLowerCase().match(/\blast\s+(\d{1,2}|[a-z]+)\s+(?:tests?|quizz?e?s?|attempts?|mocks?|papers?)\b/);
  const n = m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1]]) : undefined;
  return Math.min(20, Math.max(1, n ?? 5));
}

export const testsAnalysisWorkflow: WorkflowTemplate = {
  id: 'tests_analysis',
  title: 'Test analysis',
  description: 'Analyses your recent tests and quizzes together, maps the weak areas to your syllabus, and plans their revision when you ask.',
  budget: { maxSteps: 7, maxToolCalls: 8, maxExecutionMs: 90_000 },

  buildPlan(goal: string): AgentPlan {
    const history = (path: string) => ({ $ref: 'history', path });
    const limit = attemptCountFromGoal(goal);
    const wantsPlan = WANTS_REVISION_PLAN.test(goal);
    return {
      goal,
      workflowId: 'tests_analysis',
      estimatedComplexity: 'medium',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'history', description: 'The student’s real scored attempts are read' },
        { id: 'weakness', description: 'Weak areas are computed across them, with the evidence behind each' },
        { id: 'syllabus', description: 'Weak areas are placed in the exam syllabus where that can be done reliably' },
        ...(wantsPlan ? [{ id: 'plan', description: 'A valid revision plan covers the weak areas' }] : []),
      ],
      steps: [
        {
          id: 'history',
          objective: `Read the student’s last ${limit} scored attempts`,
          label: `Reading your last ${limit} tests`,
          type: 'retrieve',
          tool: 'get_my_test_history',
          input: { limit },
          dependsOn: [],
        },
        {
          id: 'analyze',
          objective: 'Find weak and strong areas across the attempts',
          label: 'Finding your weak areas',
          type: 'analyze',
          tool: 'analyze_performance',
          input: { evidence: history('evidence'), charts: history('charts') },
          dependsOn: ['history'],
        },
        {
          id: 'map',
          objective: 'Place the weak areas in the exam syllabus',
          label: 'Mapping them to your syllabus',
          type: 'retrieve',
          tool: 'map_weak_areas_to_syllabus',
          input: { report: { $ref: 'analyze' } },
          dependsOn: ['analyze'],
        },
        {
          id: 'save_report',
          objective: 'Save the analysis',
          label: 'Saving the analysis',
          type: 'export',
          tool: 'create_report_artifact',
          input: { report: { $ref: 'map' } },
          dependsOn: ['map'],
        },
        ...(wantsPlan ? planningSteps(goal, 'map', 'save_report') : []),
      ],
    };
  },

  evaluate({ goal, steps, outputs, plan: agentPlan }): AgentRunResult {
    const { completed, failed } = stepOutcomes(steps);
    const history = outputs.get('history') as any;
    if (!history?.found) {
      return {
        outcome: 'no_result',
        summary: "You haven't completed any tests or quizzes yet, so there is nothing to analyse. Take one — or ask me for a quiz — and ask again.",
        data: {},
        completed,
        failed,
      };
    }
    const report = (outputs.get('map') ?? outputs.get('analyze')) as any;
    const mapping = (outputs.get('map') as any)?.mapping;
    const savedReport = outputs.get('save_report') as any;
    const wantsPlan = agentPlan.steps.some((s) => s.id === 'plan');
    const plan = outputs.get('plan') as any;
    const savedPlan = outputs.get('save_plan') as any;
    if (!report) {
      return { outcome: 'partial', summary: `I read your tests but couldn't analyse them${failed.length ? `: ${failed.join('; ')}` : ''}.`, data: {}, completed, failed };
    }

    const attempts: any[] = report.basis.attempts;
    const weak: any[] = report.weakAreas;
    const lines = [
      `## ${report.title}`,
      '',
      `I read your last ${attempts.length} scored attempt${attempts.length === 1 ? '' : 's'} (${kinds(history.counts)}; ${report.basis.questionsAnswered} questions answered): ` +
        attempts.map((a) => `${a.title} ${a.accuracy}%`).join(', ') + '.',
    ];
    if (attempts.length < attemptCountFromGoal(goal)) lines.push('That is every scored attempt you have so far.');
    if (weak.length === 0) {
      lines.push('', `No topic fell below 60% across them${wantsPlan ? ', so no revision plan is needed right now' : ''}.`);
      return { outcome: 'success', summary: lines.join('\n'), data: { artifactId: savedReport?.artifactId, weakAreas: 0 }, completed, failed };
    }
    lines.push('', '**Weak areas:**');
    for (const w of weak.slice(0, 6)) {
      const where = w.syllabusPath?.length ? ` — ${w.syllabusMatch === 'name' ? 'matched by name to' : 'in'} ${shortPath(w.syllabusPath)}` : '';
      lines.push(`- **${w.topic}**: ${w.correct}/${w.total} correct (${w.accuracy}%)${w.confidence < 0.5 ? ', few questions' : ''}${where}`);
    }
    if (mapping) {
      const unmapped = mapping.unmapped ? `; ${mapping.unmapped} could not be placed reliably, so I left ${mapping.unmapped === 1 ? 'it' : 'them'} unmapped` : '';
      lines.push(
        '',
        mapping.examId
          ? `Syllabus: ${mapping.examName ?? mapping.examId} — ${mapping.exact} placed by the questions' own syllabus nodes, ${mapping.byName} by name${unmapped}.`
          : 'I could not tell which exam these belong to, so they are not mapped to a syllabus.',
      );
    }
    if (wantsPlan) {
      if (plan && savedPlan?.artifactId) lines.push('', `**${plan.title}** — ${plan.dailyMinutes} minutes a day from ${plan.startDate}:`, ...describePlan(plan));
      else lines.push('', `I saved the analysis but couldn't build the plan${failed.length ? `: ${failed.join('; ')}` : ''}.`);
    } else {
      lines.push('', 'The full analysis is on the right. Ask me to “create a revision plan for those weak areas” when you are ready.');
    }
    const ok = Boolean(savedReport?.artifactId) && (!wantsPlan || Boolean(savedPlan?.artifactId));
    return {
      outcome: ok ? 'success' : 'partial',
      summary: lines.join('\n'),
      data: { artifactId: savedPlan?.artifactId ?? savedReport?.artifactId, reportArtifactId: savedReport?.artifactId, planArtifactId: savedPlan?.artifactId, weakAreas: weak.length },
      completed,
      failed,
    };
  },
};
