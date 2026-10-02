/**
 * Phase 6 workflows: each plan validates against the REAL tool schemas and budgets, and each
 * evaluate turns what the steps produced into an honest outcome — a pending quiz is never analysed,
 * a missing analysis is asked for, and summaries speak plainly.
 */
import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';
import { registerQuizTools, composeQuizFromDocument } from '../../../src/agents/tools/adapters/quiz.adapter';
import { registerProgressTools, analyzePerformance, evidenceFromQuizAttempt } from '../../../src/agents/tools/adapters/progress.adapter';
import { registerPlanTools, buildRevisionPlan } from '../../../src/agents/tools/adapters/plan.adapter';
import { validatePlan } from '../../../src/agents/runtime/PlanValidator';
import { resolveBudget } from '../../../src/agents/runtime/AgentPolicy';
import { StepState } from '../../../src/agents/runtime/agent.types';
import { WorkflowTemplate } from '../../../src/agents/workflows/WorkflowTemplate';
import { quizFromArtifactWorkflow } from '../../../src/agents/workflows/quizFromArtifact.workflow';
import { quizMistakesWorkflow } from '../../../src/agents/workflows/quizMistakes.workflow';
import { revisionPlanWorkflow } from '../../../src/agents/workflows/revisionPlan.workflow';
import { testsAnalysisWorkflow, attemptCountFromGoal } from '../../../src/agents/workflows/testsAnalysis.workflow';
import { weakAreaQuizWorkflow } from '../../../src/agents/workflows/weakAreaQuiz.workflow';
import { plainNotation } from '../../../src/agents/workflows/summaryText';
import { createDefaultWorkflowRegistry } from '../../../src/agents/workflows';
import { CHART, CHART_SOURCE } from './fixtures/lawsOfMotionChart';

beforeAll(() => {
  process.env.AGENT_MODE_ENABLED = 'true';
  process.env.AGENT_ARTIFACTS_ENABLED = 'true';
});
afterAll(() => {
  delete process.env.AGENT_MODE_ENABLED;
  delete process.env.AGENT_ARTIFACTS_ENABLED;
});

const registry = () => registerPlanTools(registerProgressTools(registerQuizTools(new ToolRegistry())));
const validate = (workflow: WorkflowTemplate, goal: string) => {
  const plan = workflow.buildPlan(goal);
  return { plan, result: validatePlan(plan, registry(), resolveBudget(workflow.budget)) };
};
const steps = (plan: any, status: Record<string, StepState['status']> = {}) =>
  new Map<string, StepState>(plan.steps.map((s: any) => [s.id, { id: s.id, label: s.label, tool: s.tool, status: status[s.id] ?? 'completed', attempts: 1 } as StepState]));

describe('plans validate against the real tools', () => {
  it.each([
    [quizFromArtifactWorkflow, 'Create a 20-question quiz from it.'],
    [quizMistakesWorkflow, 'Analyze my quiz mistakes and tell me what I should revise.'],
    [quizMistakesWorkflow, 'Analyze my quiz mistakes and make a 5-day revision plan'],
    [revisionPlanWorkflow, 'Create a revision plan for those weak areas.'],
    [testsAnalysisWorkflow, 'Analyze my last 5 tests and create a revision plan.'],
    [testsAnalysisWorkflow, 'Analyze my last three tests'],
    [weakAreaQuizWorkflow, 'Quiz me on my weak areas'],
  ])('%s: %s', (workflow: any, goal: string) => {
    const { result } = validate(workflow, goal);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('are all registered, and exist only while artifacts are on', () => {
    const ids = createDefaultWorkflowRegistry().ids();
    for (const id of ['quiz_from_artifact', 'quiz_mistake_analysis', 'revision_plan', 'tests_analysis', 'weak_area_quiz']) expect(ids).toContain(id);
    process.env.AGENT_ARTIFACTS_ENABLED = 'false';
    expect(createDefaultWorkflowRegistry().ids()).not.toContain('quiz_from_artifact');
    process.env.AGENT_ARTIFACTS_ENABLED = 'true';
  });
});

describe('quiz_from_artifact', () => {
  it('reuses the chart: find, compose, save — with the count the student asked for', () => {
    const { plan } = validate(quizFromArtifactWorkflow, 'Create a 20-question quiz from this formula chart.');
    expect(plan.steps.map((s) => s.tool)).toEqual(['find_my_study_material', 'compose_quiz_from_document', 'create_quiz_artifact']);
    expect(plan.steps[0].input).toEqual({ titleContains: 'Formula Chart' });
    expect((plan.steps[1].input as any).count).toBe(20);
  });

  it('summarises coverage and validation, and says when the chart supports fewer questions', () => {
    const plan = quizFromArtifactWorkflow.buildPlan('Create a 50-question quiz from it');
    const composed = composeQuizFromDocument(CHART_SOURCE, 50);
    const outputs = new Map<string, unknown>([
      ['find', { found: true, artifactId: 'chart-1', title: CHART.title, spec: CHART }],
      ['compose', composed],
      ['save', { artifactId: 'quiz-1', title: composed.title, questionCount: composed.questions.length, attemptId: 'qa_1' }],
    ]);
    const r = quizFromArtifactWorkflow.evaluate({ goal: plan.goal, plan, steps: steps(plan), outputs });
    expect(r.outcome).toBe('success');
    expect(r.summary).toMatch(/You asked for 50; the chart supports \d+ distinct questions/);
    expect(r.summary).toMatch(/set aside 2 for repeats, \d+ for too few distinct wrong options/);
    expect(r.summary).toMatch(/analyse my quiz mistakes/);
  });

  it('says there is nothing to build on instead of making something up', () => {
    const plan = quizFromArtifactWorkflow.buildPlan('Create a quiz from it');
    const r = quizFromArtifactWorkflow.evaluate({ goal: plan.goal, plan, steps: steps(plan, { compose: 'skipped', save: 'skipped' }), outputs: new Map([['find', { found: false }]]) });
    expect(r.outcome).toBe('no_result');
    expect(r.summary).toMatch(/couldn't find a formula chart/);
  });
});

describe('quiz_mistake_analysis', () => {
  const quiz = composeQuizFromDocument(CHART_SOURCE, 12);
  const answers: Record<string, number> = {};
  quiz.questions.forEach((q, i) => (answers[q.id] = i < 4 ? (q.correctAnswerIndex + 1) % 4 : q.correctAnswerIndex));
  const rows = new Map<string, any>();
  quiz.questions.forEach((q) => {
    const r = rows.get(q.topic) ?? { topic: q.topic, correct: 0, incorrect: 0, unattempted: 0, total: 0 };
    r.total++;
    answers[q.id] === q.correctAnswerIndex ? r.correct++ : r.incorrect++;
    rows.set(q.topic, r);
  });
  const attempt = { id: 'qa_1', title: quiz.title, status: 'completed', questions: quiz.questions, totalQuestions: 12, answers, accuracy: 67, topicBreakdown: [...rows.values()] };
  const evidence = evidenceFromQuizAttempt(attempt, 'chart-1');
  const report = analyzePerformance({ evidence: [evidence], charts: [{ artifactId: 'chart-1', spec: CHART }] });

  it('adds planning steps only when a plan is asked for', () => {
    expect(quizMistakesWorkflow.buildPlan('Analyze my quiz mistakes').steps.map((s) => s.id)).toEqual(['find', 'analyze', 'save']);
    expect(quizMistakesWorkflow.buildPlan('Analyze my quiz mistakes and create a revision plan').steps.map((s) => s.id)).toEqual(['find', 'analyze', 'save', 'plan', 'save_plan']);
  });

  it('never analyses a quiz that has not been submitted', () => {
    const plan = quizMistakesWorkflow.buildPlan('Analyze my quiz mistakes');
    const r = quizMistakesWorkflow.evaluate({
      goal: plan.goal,
      plan,
      steps: steps(plan, { analyze: 'skipped', save: 'skipped' }),
      outputs: new Map([['find', { found: false, pending: { title: 'Laws of Motion — Quiz', attemptId: 'qa_1' } }]]),
    });
    expect(r.outcome).toBe('no_result');
    expect(r.summary).toMatch(/haven't submitted \*\*Laws of Motion — Quiz\*\* yet/);
  });

  it('tells the student what to revise, where, and how sure it is', () => {
    const plan = quizMistakesWorkflow.buildPlan('Analyze my quiz mistakes and tell me what I should revise.');
    const r = quizMistakesWorkflow.evaluate({
      goal: plan.goal,
      plan,
      steps: steps(plan),
      outputs: new Map<string, unknown>([
        ['find', { found: true, evidence: [evidence], charts: [] }],
        ['analyze', report],
        ['save', { artifactId: 'rep-1', title: report.title, weakAreaCount: report.weakAreas.length }],
      ]),
    });
    expect(r.outcome).toBe('success');
    expect(r.summary).toMatch(/You scored \*\*67%\*\* on 12 questions and missed 4/);
    if (report.weakAreas.length) expect(r.summary).toMatch(/\*\*Revise these first:\*\*/);
    expect(r.summary).not.toMatch(/\^2/); // formula markup is made readable for chat
    expect(r.data).toMatchObject({ artifactId: 'rep-1', mistakes: 4 });
  });
});

describe('revision_plan', () => {
  it('reads days and minutes from the goal', () => {
    const plan = revisionPlanWorkflow.buildPlan('Create a 5-day revision plan for those weak areas, 30 minutes a day');
    expect(plan.steps[1].input).toMatchObject({ days: 5, dailyMinutes: 30 });
  });

  it('asks for an analysis when there is none', () => {
    const plan = revisionPlanWorkflow.buildPlan('Create a revision plan for those weak areas.');
    const r = revisionPlanWorkflow.evaluate({ goal: plan.goal, plan, steps: steps(plan, { plan: 'skipped', save: 'skipped' }), outputs: new Map([['find', { found: false }]]) });
    expect(r.outcome).toBe('no_result');
    expect(r.summary).toMatch(/I need an analysis first/);
  });

  it('lays the plan out day by day', () => {
    const plan = revisionPlanWorkflow.buildPlan('Create a revision plan for those weak areas.');
    const reportSpec = {
      title: 'Mistake analysis — Laws of Motion — Quiz',
      basis: { attempts: [{ attemptId: 'qa_1', title: 'Quiz', accuracy: 50, questions: 12 }], questionsAnswered: 12 },
      weakAreas: [{ topic: 'Circular motion', accuracy: 25, correct: 1, total: 4, confidence: 0.5 }],
      strongAreas: [],
      mistakes: [],
      recommendations: [],
    };
    const built = buildRevisionPlan({ report: reportSpec as any, startDate: '2026-09-28' });
    const r = revisionPlanWorkflow.evaluate({
      goal: plan.goal,
      plan,
      steps: steps(plan),
      outputs: new Map<string, unknown>([
        ['find', { found: true, artifactId: 'rep-1', title: reportSpec.title, spec: reportSpec }],
        ['plan', built],
        ['save', { artifactId: 'plan-1', title: built.title, dayCount: 7 }],
      ]),
    });
    expect(r.outcome).toBe('success');
    expect(r.summary).toMatch(/\*\*Day 1\*\* \(2026-09-28\): Revise Circular motion \(25 min\)/);
    expect(r.summary).toMatch(/spaced reviews a day, three days and six days later/);
  });
});

describe('tests_analysis', () => {
  it('reads the number of tests from the goal (default 5)', () => {
    expect(attemptCountFromGoal('Analyze my last 5 tests and create a revision plan.')).toBe(5);
    expect(attemptCountFromGoal('review my last three quizzes')).toBe(3);
    expect(attemptCountFromGoal('what are my weak areas?')).toBe(5);
    const plan = testsAnalysisWorkflow.buildPlan('Analyze my last 5 tests and create a revision plan.');
    expect(plan.steps.map((s) => s.tool)).toEqual([
      'get_my_test_history',
      'analyze_performance',
      'map_weak_areas_to_syllabus',
      'create_report_artifact',
      'build_revision_plan',
      'create_studyplan_artifact',
    ]);
    expect(plan.steps[0].input).toEqual({ limit: 5 });
  });

  it('says there is nothing to analyse for a student with no scored attempts', () => {
    const plan = testsAnalysisWorkflow.buildPlan('Analyze my last 5 tests');
    const r = testsAnalysisWorkflow.evaluate({ goal: plan.goal, plan, steps: steps(plan), outputs: new Map([['history', { found: false, evidence: [], charts: [], counts: { quizzes: 0, tests: 0 } }]]) });
    expect(r.outcome).toBe('no_result');
  });
});

describe('weak_area_quiz', () => {
  it('quizzes only on the analysis’s weak topics, from the chart the analysis came from', () => {
    const { plan } = validate(weakAreaQuizWorkflow, 'Quiz me on my weak areas');
    expect(plan.steps[1].input).toEqual({ artifactId: { $ref: 'find_analysis', path: 'spec.sourceArtifactIds.0' } });
    expect((plan.steps[2].input as any).focusTopics).toEqual({ $ref: 'find_analysis', path: 'spec.weakAreas' });
  });

  it('declines honestly when the weak areas are not from a chart', () => {
    const plan = weakAreaQuizWorkflow.buildPlan('Quiz me on my weak areas');
    const r = weakAreaQuizWorkflow.evaluate({
      goal: plan.goal,
      plan,
      steps: steps(plan, { find_material: 'skipped', compose: 'skipped', save: 'skipped' }),
      outputs: new Map([['find_analysis', { found: true, title: 'Performance analysis', spec: { weakAreas: [{ topic: 'Algebra' }] } }]]),
    });
    expect(r.outcome).toBe('no_result');
    expect(r.summary).toMatch(/don't come from one of your formula charts/);
  });
});

describe('plainNotation', () => {
  it('turns markup into readable text where Unicode can, and leaves it where it cannot', () => {
    expect(plainNotation('f_c = mv^2/R')).toBe('f_c = mv²/R');
    expect(plainNotation('1 N = 1 kg m s^-2')).toBe('1 N = 1 kg m s⁻²');
    expect(plainNotation('f_k = μ_k N; F_{1x}')).toBe('fₖ = μₖ N; F₁ₓ');
    expect(plainNotation('F_{AB} = -F_{BA}')).toBe('F_{AB} = -F_{BA}'); // no subscript capitals exist
  });
});
