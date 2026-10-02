/**
 * Phase 7 — "Prepare me for X": selective student memory, the personal agent's tools, a model's
 * plan proposal checked before use (with the template as fallback), and the workflow's summary.
 */
const mockDetect = jest.fn();
const mockGetExam = jest.fn();
const mockSyllabus = jest.fn();
const mockCoverage = jest.fn();
const mockList = jest.fn();
const mockProfile = jest.fn();
const mockGoal = jest.fn();
const mockAttempts = { listAttempts: jest.fn(), getAttempt: jest.fn() };
const mockTests = { getRecentAttempts: jest.fn() };
const mockArtifacts = { listForUser: jest.fn(), createStructured: jest.fn() };
const mockStatsDoc = jest.fn();
const mockGenerate = jest.fn();
jest.mock('../../../src/services/pyq/examIndex', () => ({ detectExamId: (...a: any[]) => mockDetect(...a) }));
jest.mock('../../../src/services/exam/examMaster.service', () => ({ examMasterService: { getExam: (...a: any[]) => mockGetExam(...a), getCurrentSyllabus: (...a: any[]) => mockSyllabus(...a) } }));
jest.mock('../../../src/services/learning/syllabusCoverage.service', () => ({ getSyllabusCoverage: (...a: any[]) => mockCoverage(...a) }));
jest.mock('../../../src/repositories/pyq.repository', () => ({ pyqRepository: { listQuestions: (...a: any[]) => mockList(...a) } }));
jest.mock('../../../src/services/userProfile.service', () => ({ userProfileService: { getProfile: (...a: any[]) => mockProfile(...a) } }));
jest.mock('../../../src/repositories/planner.repository', () => ({ PlannerRepository: jest.fn().mockImplementation(() => ({ getGoalByUserId: (...a: any[]) => mockGoal(...a) })) }));
jest.mock('../../../src/services/tests/quizAttempts.service', () => ({ quizAttemptsService: mockAttempts }));
jest.mock('../../../src/repositories/tests.repository', () => ({ testsRepository: mockTests }));
jest.mock('../../../src/agents/artifacts/artifacts.service', () => ({ getArtifactsService: () => mockArtifacts }));
jest.mock('../../../src/config/firebase', () => ({ db: { collection: () => ({ doc: () => ({ get: (...a: any[]) => mockStatsDoc(...a) }) }) } }));
jest.mock('../../../src/services/ai/gemini.provider', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({ generateResponse: (...a: any[]) => mockGenerate(...a) })),
}));

import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';
import { registerPrepTools, paperMatches, papersNamed, DEFAULT_HORIZON_DAYS } from '../../../src/agents/tools/adapters/prep.adapter';
import { registerPlanTools, todayIn, addDays } from '../../../src/agents/tools/adapters/plan.adapter';
import { loadStudentContext, summarizeForModel } from '../../../src/agents/memory/studentContext';
import { proposePlan } from '../../../src/agents/runtime/PlanProposer';
import { examPrepWorkflow, prepPolicy, PREP_TOOLS } from '../../../src/agents/workflows/examPrep.workflow';
import { createDefaultWorkflowRegistry } from '../../../src/agents/workflows';
import { validatePlan } from '../../../src/agents/runtime/PlanValidator';
import { resolveBudget } from '../../../src/agents/runtime/AgentPolicy';
import { routeGoal } from '../../../src/agents/runtime/GoalRouter';
import { AgentPlan, StepState } from '../../../src/agents/runtime/agent.types';
import { fakeTool, fixedWorkflow, makeRuntime, registryOf } from './helpers';

const ctx = { userId: 'student-1', runId: 'run-1', stepId: 's', signal: new AbortController().signal };
const registry = () => registerPrepTools(registerPlanTools(new ToolRegistry()));
const run = async (name: string, input: any) => {
  const tool = registry().get(name)!;
  const result = await tool.execute(tool.inputSchema.parse(input), ctx);
  tool.outputSchema.parse(result.data);
  return result.data as any;
};

let seq = 0;
const node = (type: string, name: string, extra: Record<string, unknown> = {}, children: any[] = []) => ({ id: `n${++seq}`, type, name, children, ...extra });
const SYLLABUS = {
  syllabusId: 'syl_ssc',
  sourceDocumentTitle: 'Notice of Combined Graduate Level Examination, 2026',
  sourceDocumentUrl: 'https://ssc.gov.in/notice.pdf',
  nodes: [
    node('STAGE', 'Tier-I', { marks: 200, questionCount: 100, durationMinutes: 60 }, [
      node('SUBJECT', 'General Intelligence and Reasoning', { marks: 50, questionCount: 25, durationMinutes: 15 }, [node('TOPIC', 'Semantic Analogy', { id: 'leaf-analogy' }), node('TOPIC', 'Number Series')]),
      node('SUBJECT', 'Quantitative Aptitude', { marks: 50, questionCount: 25, durationMinutes: 15 }, [node('TOPIC', 'Percentage'), node('TOPIC', 'Ratio & Proportion')]),
    ]),
    node('STAGE', 'Tier-II', {}, [node('PAPER', 'Paper-I', {}, [node('SUBJECT', 'English', { marks: 135 }, [node('TOPIC', 'Spot the Error')])]), node('PAPER', 'Paper-II Statistics', {}, [node('TOPIC', 'Sampling')])]),
  ],
};

beforeAll(() => {
  process.env.AGENT_MODE_ENABLED = 'true';
  process.env.AGENT_ARTIFACTS_ENABLED = 'true';
});
afterAll(() => {
  delete process.env.AGENT_MODE_ENABLED;
  delete process.env.AGENT_ARTIFACTS_ENABLED;
});
beforeEach(() => {
  jest.clearAllMocks();
  mockDetect.mockImplementation(async (q: string) => (/ssc\s*cgl/i.test(q) ? 'SSC_CGL' : /jee/i.test(q) ? 'JEE_MAIN' : null));
  mockGetExam.mockResolvedValue({ name: 'Combined Graduate Level Examination', shortName: 'SSC CGL' });
  mockSyllabus.mockResolvedValue(SYLLABUS);
  mockCoverage.mockResolvedValue({ totals: { addressable: 5 }, subjects: [] });
  mockList.mockResolvedValue([]);
  mockProfile.mockResolvedValue(null);
  mockGoal.mockResolvedValue(null);
  mockAttempts.listAttempts.mockResolvedValue([]);
  mockTests.getRecentAttempts.mockResolvedValue([]);
  mockArtifacts.listForUser.mockResolvedValue([]);
  mockStatsDoc.mockResolvedValue({ exists: false, data: () => undefined });
});

describe('selective student memory', () => {
  it('reads only the slices asked for, and tells a model a few lines — not the record', async () => {
    mockProfile.mockResolvedValue({ targetExam: 'SSC CGL', dailyStudyHours: 3, weakAreas: ['Geometry'], phone: '99999' });
    const c = await loadStudentContext('student-1', ['profile']);
    expect(Object.keys(c)).toEqual(['profile']);
    expect(c.profile).toEqual({ targetExam: 'SSC CGL', dailyStudyHours: 3, selfReportedWeakAreas: ['Geometry'] });
    expect(mockGoal).not.toHaveBeenCalled();
    expect(mockAttempts.listAttempts).not.toHaveBeenCalled();
    expect(summarizeForModel(c)).toEqual(['Onboarding target exam: SSC CGL.', 'Said they can study 3 hours a day.']);
  });

  it('reads weak topics without seeding a stats record, and a failed slice is unknown, not zero', async () => {
    mockStatsDoc.mockResolvedValue({ exists: true, data: () => ({ weakTopicDetails: [{ topicName: 'Percentage', examId: 'SSC_CGL', accuracy: 35, confidence: 0.9 }] }) });
    mockAttempts.listAttempts.mockRejectedValue(new Error('down'));
    const c = await loadStudentContext('student-1', ['weakTopics', 'history']);
    expect(c.weakTopics).toEqual([{ topic: 'Percentage', examId: 'SSC_CGL', accuracy: 35, confidence: 0.9 }]);
    expect(c.history).toBeNull();
    expect(summarizeForModel(c)).toEqual(['Practice history: unavailable.', 'Weakest topics: Percentage (35%).']);
  });
});

describe('resolve_exam_goal', () => {
  const today = todayIn();

  it('takes the exam and the days from the request, and says when the minutes are a default', async () => {
    const g = await run('resolve_exam_goal', { query: 'Prepare me for SSC CGL in 90 days', context: {} });
    expect(g).toMatchObject({
      examId: 'SSC_CGL',
      shortName: 'SSC CGL',
      startDate: today,
      horizon: { days: 90, endDate: addDays(today, 89), source: 'goal' },
      dailyMinutes: { value: 60, source: 'default' },
    });
  });

  it('falls back to the saved goal and profile — and never invents an exam date', async () => {
    const saved = addDays(today, 40);
    const g = await run('resolve_exam_goal', { query: 'Study with me for the next 30 days', context: { goal: { targetExam: 'SSC CGL', examDate: saved }, profile: { dailyStudyHours: 3 } } });
    expect(g).toMatchObject({ examId: 'SSC_CGL', horizon: { days: 30, source: 'goal' }, dailyMinutes: { value: 180, source: 'profile' } });
    const s = await run('resolve_exam_goal', { query: 'Prepare me for SSC CGL', context: { goal: { examDate: saved, weeklyHours: 14 } } });
    expect(s).toMatchObject({ horizon: { days: 40, endDate: addDays(saved, -1), source: 'saved_goal' }, dailyMinutes: { value: 120, source: 'saved_goal' } });
    const d = await run('resolve_exam_goal', { query: 'Prepare me for SSC CGL', context: {} });
    expect(d.horizon).toEqual({ days: DEFAULT_HORIZON_DAYS, endDate: addDays(today, DEFAULT_HORIZON_DAYS - 1), source: 'default' });
  });

  it('asks which exam when none is named or saved', async () => {
    await expect(run('resolve_exam_goal', { query: 'Study with me for the next 30 days', context: {} })).rejects.toThrow(/Which exam/);
  });

  it('notices the papers a student names', () => {
    expect(papersNamed('Prepare me for SSC CGL with Paper 2 Statistics')).toEqual(['paper 2', 'statistics']);
    expect(paperMatches('Paper-II Statistics', 'paper 2')).toBe(true);
    expect(paperMatches('Paper-III General Studies (Finance and Economics)', 'paper 2')).toBe(false);
    expect(paperMatches('Syllabus for JEE (Main) Paper 2A (B.Arch.)', 'paper 2')).toBe(true);
    expect(paperMatches('Syllabus for JEE (Main) Paper 2B (B.Planning)', 'b.arch')).toBe(false);
  });
});

describe('the exam, the student and the papers', () => {
  it('reads the official structure, including a paper the student named', async () => {
    const s = await run('get_exam_structure', { examId: 'SSC_CGL', papersNamed: [] });
    expect(s.scope.map((p: any) => p.path)).toEqual(['Tier-I', 'Tier-II › Paper-I']);
    expect(s.notIncluded).toEqual(['Tier-II › Paper-II Statistics']);
    const withStats = await run('get_exam_structure', { examId: 'SSC_CGL', papersNamed: ['statistics'] });
    expect(withStats.notIncluded).toEqual([]);
    mockSyllabus.mockResolvedValue(null);
    await expect(run('get_exam_structure', { examId: 'SSC_CGL' })).rejects.toThrow(/doesn't have the official syllabus/);
  });

  it('reports where the student stands in this exam only', async () => {
    mockCoverage.mockResolvedValue({ totals: { addressable: 5, weak: 1 }, subjects: [{ nodeId: 'sub', isLeaf: false, children: [{ nodeId: 'leaf-analogy', isLeaf: true, state: 'WEAK', children: [] }, { nodeId: 'x', isLeaf: true, state: 'UNTOUCHED', children: [] }] }] });
    mockStatsDoc.mockResolvedValue({ exists: true, data: () => ({ weakTopicDetails: [{ topicName: 'Percentage', examId: 'SSC_CGL', accuracy: 35, confidence: 0.9 }, { topicName: 'Optics', examId: 'JEE_MAIN', accuracy: 20, confidence: 1 }] }) });
    const r = await run('get_exam_readiness', { examId: 'SSC_CGL' });
    expect(r).toMatchObject({ practised: true, leafStates: { 'leaf-analogy': 'WEAK' }, weakTopics: [{ topic: 'Percentage', accuracy: 35 }] });
    expect(r.weakTopics).toHaveLength(1);
  });

  it('offers real past papers only when they pass the screen', async () => {
    const none = await run('check_past_papers', { examId: 'SSC_CGL', examName: 'SSC CGL' });
    expect(none).toMatchObject({ available: false, papers: 0 });
    expect(none.note).toMatch(/^Sadhya has no SSC CGL past papers I can offer as real papers yet/);
    const real = (i: number) => ({ questionId: `q${i}`, sourceId: 'src_2023_s1_official', examId: 'JEE_MAIN', year: 2023, shift: 'S1', origin: 'authentic_import', corpusBucket: 'OFFICIAL_PYQ', ingestionState: 'INDEXED', verificationStatus: 'OFFICIAL_CONFIRMED', sourceType: 'TIER_A_OFFICIAL', questionText: `Question ${i}?`, options: ['a', 'b', 'c', 'd'], correctAnswer: 'ABCD'[i % 4] });
    mockList.mockResolvedValue(Array.from({ length: 16 }, (_, i) => real(i)));
    const some = await run('check_past_papers', { examId: 'JEE_MAIN', examName: 'JEE Main' });
    expect(some).toMatchObject({ available: true, papers: 1, years: [2023] });
    expect(some.note).toMatch(/Make a JEE Main mock test/);
  });
});

describe('the plan proposal', () => {
  const template = examPrepWorkflow.buildPlan('Prepare me for SSC CGL in 90 days');
  const budget = resolveBudget(examPrepWorkflow.budget);
  const propose = (reply: any) =>
    proposePlan({
      goal: template.goal,
      workflowId: 'exam_prep',
      userId: 'student-1',
      facts: ['Nothing is known about the student yet.'],
      allow: PREP_TOOLS,
      template,
      registry: registry(),
      budget,
      policy: prepPolicy,
      maxSteps: 8,
      today: '2026-09-30',
      callModel: async () => (reply instanceof Error ? Promise.reject(reply) : { json: reply, usage: { tokens: 1500, costUsd: 0.002 } }),
    });
  const stepsOf = (plan: AgentPlan) => plan.steps.map((s) => ({ id: s.id, tool: s.tool, label: s.label, objective: s.objective, type: s.type, input: s.input, dependsOn: s.dependsOn }));

  it('the default plan passes the validator and the workflow’s own rules', () => {
    expect(validatePlan(template, registry(), budget)).toMatchObject({ ok: true });
    expect(prepPolicy(template)).toEqual([]);
    expect(createDefaultWorkflowRegistry().ids()).toContain('exam_prep');
  });

  it('uses a model’s plan once it passes every check', async () => {
    // A student with no history: the model drops the readiness step.
    const steps = stepsOf(template).filter((s) => s.id !== 'readiness');
    const plan = steps.find((s) => s.id === 'plan')!;
    delete (plan.input as any).readiness;
    plan.dependsOn = plan.dependsOn.filter((d) => d !== 'readiness');
    const p = await propose({ steps, why: 'No practice yet, so there is no readiness to check.' });
    expect(p.source).toBe('model');
    expect(p.plan.steps.map((s) => s.id)).toEqual(['context', 'goal', 'structure', 'papers', 'plan', 'save']);
    expect(p.notes).toEqual(['No practice yet, so there is no readiness to check.']);
    expect(p.usage).toEqual({ tokens: 1500, costUsd: 0.002 });
  });

  it.each([
    ['a tool outside the list', (s: any[]) => [...s, { id: 'web', tool: 'web_research', label: 'Searching the web', objective: 'x', type: 'search', input: { query: 'ssc' }, dependsOn: [] }], /may not use/],
    ['no save step', (s: any[]) => s.filter((x) => x.id !== 'save'), /has no create_studyplan_artifact step/],
    ['the save step saving the wrong thing', (s: any[]) => s.map((x) => (x.id === 'save' ? { ...x, input: { plan: { $ref: 'plan', path: 'phases' } } } : x)), /doesn't save the built plan/],
    ['a reference outside its dependencies', (s: any[]) => s.map((x) => (x.id === 'structure' ? { ...x, dependsOn: [] } : x)), /not in dependsOn/],
    ['a tool used twice', (s: any[]) => [...s, { ...s[0], id: 'context2' }], /more than once/],
  ])('falls back to the default plan for %s', async (_name, change, why) => {
    const p = await propose({ steps: change(stepsOf(template)) });
    expect(p.source).toBe('template');
    expect(p.plan).toBe(template);
    expect(p.notes[0]).toMatch(why);
  });

  it('falls back when the model is unavailable or says nothing usable', async () => {
    const down = await propose(new Error('429 RESOURCE_EXHAUSTED'));
    expect(down).toMatchObject({ source: 'template', notes: [expect.stringMatching(/planner was unavailable/)] });
    const empty = await propose({ nothing: true });
    expect(empty).toMatchObject({ source: 'template', notes: [expect.stringMatching(/no steps/)] });
  });

  it('the workflow tells the model a summary of the student, not their record', async () => {
    mockProfile.mockResolvedValue({ targetExam: 'SSC CGL', dailyStudyHours: 2, phone: '99999' });
    mockGenerate.mockResolvedValue({ reply: JSON.stringify({ steps: stepsOf(template), why: 'kept the default plan' }), usage: { promptTokens: 2000, completionTokens: 600 } });
    const p = await examPrepWorkflow.proposePlan!({ goal: template.goal, userId: 'student-1', registry: registry(), budget });
    expect(p.source).toBe('model');
    const prompt: string = mockGenerate.mock.calls[0][0][0].content;
    expect(prompt).toContain('- Onboarding target exam: SSC CGL.');
    expect(prompt).toContain('- Said they can study 2 hours a day.');
    expect(prompt).not.toContain('99999');
    expect(prompt).toContain('- get_exam_structure(examId, papersNamed?)');
    expect(mockGenerate.mock.calls[0][2]).toMatchObject({ operation: 'agent_plan_proposal' });
  });
});

describe('the runtime runs a proposed plan, and falls back when proposing fails', () => {
  const tools = registryOf(fakeTool('first', async () => ({ ok: 1 })), fakeTool('second', async () => ({ ok: 2 })));
  const plan = { successCriteria: [], estimatedComplexity: 'low' as const, requiresUserApproval: false, steps: [{ id: 'a', objective: 'a', label: 'A', type: 'retrieve' as const, tool: 'first', input: {}, dependsOn: [] }] };

  it('records where the plan came from, and charges the proposal to the run', async () => {
    const proposed: AgentPlan = { ...plan, goal: 'g', workflowId: 'w', steps: [...plan.steps, { id: 'b', objective: 'b', label: 'B', type: 'retrieve', tool: 'second', input: {}, dependsOn: ['a'] }] };
    const wf = fixedWorkflow('w', plan, { proposePlan: async () => ({ plan: proposed, source: 'model', notes: ['added b'], usage: { tokens: 900, costUsd: 0.001 } }) });
    const { runtime, store } = makeRuntime(tools, [wf]);
    const started = await runtime.startRun({ userId: 'u', goal: 'g', workflowId: 'w', source: 'api' });
    await runtime.waitForRun(started.runId);
    const doc = await store.getRun(started.runId);
    expect(doc).toMatchObject({ status: 'completed', planSource: 'model', planNotes: ['added b'] });
    expect(doc!.steps.map((s) => s.id)).toEqual(['a', 'b']);
    expect(doc!.usage.tokens).toBeGreaterThanOrEqual(900);
    expect(doc!.usage.costUsd).toBeGreaterThanOrEqual(0.001);
  });

  it('uses the template when proposing throws', async () => {
    const wf = fixedWorkflow('w', plan, { proposePlan: async () => { throw new Error('boom'); } });
    const { runtime, store } = makeRuntime(tools, [wf]);
    const started = await runtime.startRun({ userId: 'u', goal: 'g', workflowId: 'w', source: 'api' });
    await runtime.waitForRun(started.runId);
    const doc = await store.getRun(started.runId);
    expect(doc).toMatchObject({ status: 'completed', planSource: 'template', planNotes: [expect.stringMatching(/standard plan/)] });
    expect(doc!.steps.map((s) => s.id)).toEqual(['a']);
  });
});

describe('what the student is told', () => {
  const steps = (status: Record<string, StepState['status']> = {}) =>
    new Map<string, StepState>(['context', 'goal', 'structure', 'readiness', 'papers', 'plan', 'save'].map((id) => [id, { id, label: id, tool: id, status: status[id] ?? 'completed', attempts: 1 } as StepState]));
  const goal = { examId: 'SSC_CGL', examName: 'Combined Graduate Level Examination', shortName: 'SSC CGL', startDate: '2026-09-30', horizon: { days: 90, endDate: '2026-12-28', source: 'goal' }, dailyMinutes: { value: 60, source: 'default' }, papersNamed: [] };
  const structure = { source: { title: 'Notice of Combined Graduate Level Examination, 2026' }, scope: [{ path: 'Tier-I', questionCount: 100, durationMinutes: 60 }, { path: 'Tier-II › Paper-I', questionCount: 150, durationMinutes: 150 }] };
  const built = {
    spec: {
      title: 'SSC CGL — 90-day plan',
      startDate: '2026-09-30',
      exam: { examId: 'SSC_CGL', name: 'x', scope: ['Tier-I', 'Tier-II › Paper-I'], notIncluded: ['Tier-II › Paper-II Statistics'] },
      outlook: { units: 129, scheduled: 57, firstPassHours: 96.8, availableHours: 43.2, fitsInTime: false, note: 'At 60 minutes a day, the learning weeks cover 57 of the 129 topics, weakest and highest-marks subjects first. About 135 minutes a day would cover all of them.' },
      weeks: [{ week: 1, phase: 'learn', milestone: 'Finish 9 topics: Semantic Analogy, …' }, ...Array.from({ length: 7 }, (_, i) => ({ week: i + 2, phase: 'learn' })), ...[9, 10, 11].map((week) => ({ week, phase: 'practise' })), ...[12, 13].map((week) => ({ week, phase: 'revise' }))],
    },
    subjectShares: [{ subject: 'English', share: 0.28, basis: 'marks' }, { subject: 'Reasoning', share: 0.22, basis: 'marks' }],
  };

  it('says what the plan covers, where the student starts, the time arithmetic, and what is a default', () => {
    const outputs = new Map<string, unknown>([
      ['goal', goal],
      ['structure', structure],
      ['readiness', { practised: false, leafStates: {}, weakTopics: [] }],
      ['papers', { note: 'Sadhya has no SSC CGL past papers I can offer as real papers yet.' }],
      ['plan', built],
      ['save', { artifactId: 'a1' }],
    ]);
    const r = examPrepWorkflow.evaluate({ goal: 'g', steps: steps(), outputs } as any);
    expect(r.outcome).toBe('success');
    expect(r.summary).toContain('**Exam:** Combined Graduate Level Examination, planned from the official syllabus (Notice of Combined Graduate Level Examination, 2026).');
    expect(r.summary).toContain('**Covers:** Tier-I (100 questions, 60 minutes) and Tier-II › Paper-I (150 questions, 150 minutes). Not included: Tier-II › Paper-II Statistics — tell me if you\'re taking it.');
    expect(r.summary).toContain("**Where you are:** You haven't practised SSC CGL in Sadhya yet, so every topic starts fresh.");
    expect(r.summary).toContain("**Time:** 90 days, 30 Sept – 28 Dec, at 60 minutes a day — you didn't say how long you can study, so I used 60; tell me yours and I'll re-plan.");
    expect(r.summary).toContain('About 135 minutes a day would cover all of them.');
    expect(r.summary).toContain('**Plan:** weeks 1–8 learn · weeks 9–11 timed practice · weeks 12–13 full tests and revision. Time follows the official marks: English 28%, Reasoning 22%.');
    expect(r.summary).toContain('**Past papers:** Sadhya has no SSC CGL past papers');
  });

  it('asks for the exam when it could not identify one, and is partial when saving failed', () => {
    const none = examPrepWorkflow.evaluate({ goal: 'g', steps: steps({ goal: 'failed' }), outputs: new Map() } as any);
    expect(none.outcome).toBe('no_result');
    const partial = examPrepWorkflow.evaluate({ goal: 'g', steps: steps({ save: 'failed' }), outputs: new Map<string, unknown>([['goal', goal], ['structure', structure], ['plan', built]]) } as any);
    expect(partial.outcome).toBe('partial');
    expect(partial.summary).toMatch(/couldn't save the plan/);
  });
});

describe('routing', () => {
  it.each(['Prepare me for SSC CGL in 90 days', 'Study with me for the next 30 days', 'Make a study plan for JEE Main', 'Help me prepare for NEET by 3 May'])('%s → exam_prep', (msg) => {
    expect(routeGoal(msg)).toMatchObject({ mode: 'agent', workflowId: 'exam_prep', intent: 'PERSONAL_PREP' });
  });

  it('leaves chapter-sized goals and weak-area revision plans to their own workflows', () => {
    expect(routeGoal('Prepare me for NEET Biology chapter 5').workflowId).not.toBe('exam_prep');
    expect(routeGoal('Create a revision plan for those weak areas.').workflowId).toBe('revision_plan');
    expect(routeGoal('Analyze my last 5 tests and create a revision plan.').workflowId).toBe('tests_analysis');
  });
});
