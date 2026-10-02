/**
 * Phase 6 — past-year question practice. What may be shown as a past-year question is decided by
 * code, not labels alone: the labels, an official answer, no missing figure, and a source whose
 * answer key is plausibly a real paper's (2,815 "official" JEE Main records answer A to 2,239 of
 * 2,241 lettered questions). Nothing that fails is shown; everything refused is counted by reason.
 */
const mockDetect = jest.fn();
const mockListQuestions = jest.fn();
const mockAttempts = { listAttempts: jest.fn(), getAttempt: jest.fn() };
jest.mock('../../../src/services/tests/quizAttempts.service', () => ({ quizAttemptsService: mockAttempts }));
jest.mock('../../../src/services/pyq/examIndex', () => ({ detectExamId: (...a: any[]) => mockDetect(...a) }));
jest.mock('../../../src/services/exam/examMaster.service', () => ({ examMasterService: { getExam: async () => ({ name: 'JEE Main' }) } }));
jest.mock('../../../src/repositories/pyq.repository', () => ({ pyqRepository: { listQuestions: (...a: any[]) => mockListQuestions(...a) } }));

import {
  answerKeyVerdict,
  clearSourceVerdicts,
  judgeSources,
  needsFigure,
  plainText,
  refusalSummary,
  screenPastQuestions,
  textKey,
} from '../../../src/agents/tools/adapters/pastPapers';
import { onTopic, pyqRequestFromGoal, registerPyqTools, shortExamName } from '../../../src/agents/tools/adapters/pyq.adapter';
import { registerQuizTools } from '../../../src/agents/tools/adapters/quiz.adapter';
import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';
import { pyqPracticeWorkflow } from '../../../src/agents/workflows/pyqPractice.workflow';
import { mockTestWorkflow } from '../../../src/agents/workflows/mockTest.workflow';
import { createDefaultWorkflowRegistry } from '../../../src/agents/workflows';
import { validatePlan } from '../../../src/agents/runtime/PlanValidator';
import { resolveBudget } from '../../../src/agents/runtime/AgentPolicy';
import { routeGoal } from '../../../src/agents/runtime/GoalRouter';
import { StepState } from '../../../src/agents/runtime/agent.types';

const ctx = { userId: 'student-1', runId: 'run-1', stepId: 's', signal: new AbortController().signal };
const LETTERS = ['A', 'B', 'C', 'D'];

/** A question as the bank stores a real JEE Main import. */
const real = (i: number, over: Record<string, any> = {}) => ({
  questionId: `pyq:jee_main:2023:24_january_shift_1:q${i}`,
  sourceId: 'src_jee_main_2023_24_january_shift_1_official',
  examId: 'JEE_MAIN',
  year: 2023,
  shift: '24 January Shift 1',
  normalizedSittingDate: '2023-01-24',
  subject: 'Physics',
  chapter: i % 2 ? 'Thermodynamics' : 'Current Electricity',
  topic: i % 2 ? 'first-law-of-thermodynamics' : 'drift-velocity',
  questionNumber: i,
  origin: 'authentic_import',
  corpusBucket: 'OFFICIAL_PYQ',
  ingestionState: 'INDEXED',
  verificationStatus: 'OFFICIAL_CONFIRMED',
  sourceType: 'TIER_A_OFFICIAL',
  correctAnswerSource: 'NTA Final Answer Key 2023',
  questionText: `Real question number ${i} about $$\\mathrm{V}_{d}$$<br>in a conductor?`,
  options: ['one', 'two', 'three', 'four'],
  correctAnswer: LETTERS[i % 4],
  solution: `Worked solution ${i}.`,
  ...over,
});
/** The machine-written set: same labels, every answer (A). */
const fake = (i: number) => ({
  ...real(i),
  questionId: `pyq:jee_main:2023:session_1:24_jan_shift_1:q${i}`,
  sourceId: 'src_jee_main_2023_jan_24janshift1_nta',
  shift: '24 Jan Shift 1',
  questionText: `The formula for quantity ${i} is:`,
  correctAnswer: 'A',
});

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
  clearSourceVerdicts();
  mockAttempts.listAttempts.mockResolvedValue([]);
});

describe('the past-paper screen', () => {
  it('keeps the maths and drops the markup', () => {
    expect(plainText('Find <b>x</b> if x<sup>2</sup> = 4 and H<sub>2</sub>O<br>next &amp; last <img src="https://cdn.example/f.png">')).toBe('Find x if x^2 = 4 and H2O\nnext & last');
    expect(plainText('If a<b and c>d, then $$\\frac{a}{c}$$')).toBe('If a<b and c>d, then $$\\frac{a}{c}$$');
  });

  it('refuses questions that need a figure the quiz cannot show', () => {
    expect(needsFigure({ questionText: 'Find the current <img src="x.png">', options: ['1', '2', '3', '4'] })).toBe(true);
    expect(needsFigure({ questionText: 'In the circuit shown in the figure, find I.', options: ['1', '2', '3', '4'] })).toBe(true);
    expect(needsFigure({ questionText: 'Q?', options: ['<img src="a.png">', 'b', 'c', 'd'] })).toBe(true);
    expect(needsFigure({ questionText: 'Round 3.14159 to three significant figures.', options: ['a', 'b', 'c', 'd'] })).toBe(false);
  });

  it('sees one question under different markup as the same question', () => {
    expect(textKey('The <b>drift</b> velocity is  V.')).toBe(textKey('the drift velocity is v'));
  });

  it('judges a source by its own answer key', () => {
    const keyed = (letters: string) => [...letters].map((l) => ({ correctAnswer: l, options: ['a', 'b', 'c', 'd'] }));
    expect(answerKeyVerdict(keyed('AAAAAAAAAAAA'))).toBe('implausible');
    expect(answerKeyVerdict(keyed('ABCDABCDABCD'))).toBe('plausible');
    expect(answerKeyVerdict(keyed('AAAAAAAAAAA'))).toBe('unchecked'); // 11: too few to judge
    expect(answerKeyVerdict(keyed('AAAAAAAAABCD'))).toBe('implausible'); // 9 of 12
    expect(answerKeyVerdict(keyed('AAAAAAAABBCD'))).toBe('plausible'); // 8 of 12
  });

  it('shows only real questions and counts the rest by why', async () => {
    const rows = [
      ...Array.from({ length: 14 }, (_, i) => real(i + 1)),
      real(15, { options: [], correctAnswer: '2', questionText: 'Numerical answer?' }),
      real(16, { questionText: 'In the circuit shown in the figure, find I.' }),
      real(17, { questionId: 'dup', questionText: 'Real question number 1 about $$\\mathrm{V}_{d}$$ in a conductor?' }),
      ...Array.from({ length: 16 }, (_, i) => fake(i + 1)),
      { ...real(40), questionId: 'ssc', sourceId: 'src_satvik', verificationStatus: 'SECONDARY_CONFIRMED', sourceType: 'TIER_B_REPUTABLE_PLATFORM' },
      { ...real(41), questionId: 'tmpl', origin: 'template', corpusBucket: 'PRACTICE_MOCK' },
    ];
    const { usable, excluded } = await screenPastQuestions(rows);
    expect(usable.map((q) => q.questionId)).toEqual(Array.from({ length: 14 }, (_, i) => `pyq:jee_main:2023:24_january_shift_1:q${i + 1}`));
    expect(excluded).toEqual({
      implausible_answer_key: 16,
      not_multiple_choice: 1,
      needs_figure: 1,
      duplicate: 1,
      answers_not_officially_verified: 1,
      template: 1,
    });
    expect(mockListQuestions).not.toHaveBeenCalled(); // both sources had enough questions to judge
    expect(refusalSummary(excluded)).toMatch(/^16 from sources whose answer key is almost all one letter \(machine-written, not real papers\), /);
  });

  it('looks up a small source’s whole sitting before trusting it — and says when it could not', async () => {
    const few = [real(1), real(2)];
    mockListQuestions.mockResolvedValueOnce([...Array.from({ length: 14 }, (_, i) => real(i + 1)), ...Array.from({ length: 16 }, (_, i) => fake(i + 1))]);
    const verdicts = await judgeSources(few, few);
    expect(mockListQuestions).toHaveBeenCalledWith({ examId: 'JEE_MAIN', year: 2023, shift: '24 January Shift 1', limit: 300 });
    expect(verdicts.get('src_jee_main_2023_24_january_shift_1_official')).toBe('plausible');

    clearSourceVerdicts();
    const { usable, excluded } = await screenPastQuestions(few, { maxLookups: 0 });
    expect(usable).toEqual([]);
    expect(excluded).toEqual({ answer_key_unchecked: 2 });
  });
});

describe('reading a PYQ request', () => {
  it.each([
    ['Give me JEE Main 2023 Physics PYQs', { year: 2023, subject: 'Physics', topicWords: [] }],
    ['Show me the last 5 years JEE Main PYQs on thermodynamics', { topicWords: ['thermodynamics'] }],
    ['I want to practise previous year questions of NEET-UG Biology on the cell cycle', { subject: 'Biology', topicWords: ['cell', 'cycle'] }],
    ['20 JEE Mains maths previous year questions from 2022', { year: 2022, subject: 'Mathematics', topicWords: [] }],
  ])('%s', (goal, expected) => {
    expect(pyqRequestFromGoal(goal)).toEqual(expected);
  });

  it('matches a topic by every word, allowing plurals but not look-alikes', () => {
    expect(onTopic({ topic: 'first-law-of-thermodynamics' }, ['thermodynamics'])).toBe(true);
    expect(onTopic({ chapter: 'Capacitors' }, ['capacitor'])).toBe(true);
    expect(onTopic({ chapter: 'Electrostatics' }, ['electric'])).toBe(false);
    expect(onTopic({ chapter: 'Laws of Motion' }, ['rotational', 'motion'])).toBe(false);
    expect(onTopic({ chapter: 'Anything' }, [])).toBe(true);
  });

  it('names exams the way students write them', () => {
    expect(shortExamName('JEE_MAIN')).toBe('JEE Main');
    expect(shortExamName('NEET_UG')).toBe('NEET UG');
    expect(shortExamName('SSC_CGL')).toBe('SSC CGL');
  });
});

describe('find_verified_past_year_questions', () => {
  const tool = () => registerPyqTools(new ToolRegistry()).get('find_verified_past_year_questions')!;
  const run = async (query: string, count = 20) => {
    const t = tool();
    const result = await t.execute(t.inputSchema.parse({ query, count }), ctx);
    t.outputSchema.parse(result.data);
    return result.data as any;
  };
  const bank = (rows: any[]) =>
    mockListQuestions.mockImplementation(async (filter: any) => rows.filter((q) => !filter.verificationStatus || q.verificationStatus === filter.verificationStatus));

  it('serves real questions from one paper, in paper order, and says what it refused', async () => {
    mockDetect.mockResolvedValue('JEE_MAIN');
    bank([...Array.from({ length: 14 }, (_, i) => real(14 - i)), real(15, { options: [], correctAnswer: '2' }), real(16, { options: [], correctAnswer: '7' }), ...Array.from({ length: 16 }, (_, i) => fake(i + 1)), { ...real(41), questionId: 'tmpl', origin: 'template' }]);
    const data = await run('Give me JEE Main 2023 Physics PYQs');
    // Only officially confirmed questions can pass, so only those are read when some do.
    expect(mockListQuestions).toHaveBeenCalledTimes(1);
    expect(mockListQuestions).toHaveBeenCalledWith({ examId: 'JEE_MAIN', year: 2023, subject: 'Physics', verificationStatus: 'OFFICIAL_CONFIRMED', limit: 1000 });
    expect(data.questions).toHaveLength(14);
    expect(data.questions.map((q: any) => q.sourcePyqId)).toEqual(Array.from({ length: 14 }, (_, i) => `pyq:jee_main:2023:24_january_shift_1:q${i + 1}`));
    expect(data.questions[0]).toMatchObject({
      questionOrigin: 'AUTHENTIC_PYQ',
      sourceYear: 2023,
      sourceShift: '24 January Shift 1',
      correctAnswerIndex: 1,
      text: 'Real question number 1 about $$\\mathrm{V}_{d}$$\nin a conductor?',
      topic: 'Thermodynamics',
      explanation: 'Worked solution 1.',
    });
    expect(data.excluded).toEqual({ implausible_answer_key: 16, not_multiple_choice: 2, template: 1 });
    expect(data).toMatchObject({
      title: 'JEE Main 2023 Physics — past-year questions',
      sittings: ['2023 · 24 January Shift 1'],
      answerSources: ['NTA Final Answer Key 2023'],
      checked: 33,
      checkedAtLeast: false,
    });
    expect(data.origin[0].label).toBe('Real JEE Main papers (2023); answers as recorded from the official key');
  });

  it('keeps to the topic asked for', async () => {
    mockDetect.mockResolvedValue('JEE_MAIN');
    bank(Array.from({ length: 14 }, (_, i) => real(i + 1)));
    const data = await run('JEE Main 2023 Physics PYQs on thermodynamics');
    expect(data.questions.every((q: any) => q.topic === 'Thermodynamics')).toBe(true);
    expect(data.questions).toHaveLength(7);
    expect(data.excluded).toEqual({ other_topics: 7 });
    expect(data.title).toBe('JEE Main 2023 Physics · Thermodynamics — past-year questions');
  });

  it('returns no questions — never a substitute — when nothing is a real paper with an official answer', async () => {
    mockDetect.mockResolvedValue('SSC_CGL');
    bank(Array.from({ length: 5 }, (_, i) => ({ ...real(i + 1), sourceId: 'src_satvik', verificationStatus: 'SECONDARY_CONFIRMED', sourceType: 'TIER_B_REPUTABLE_PLATFORM' })));
    const data = await run('SSC CGL 2023 PYQs');
    // Nothing passed, so everything in scope is read to say why.
    expect(mockListQuestions).toHaveBeenCalledWith({ examId: 'SSC_CGL', year: 2023, limit: 1000 });
    expect(data.checked).toBe(5);
    expect(data.questions).toBeUndefined();
    expect(data.excluded).toEqual({ answers_not_officially_verified: 5 });
    expect(data.origin).toEqual([]);
  });

  it('asks which exam when none is named', async () => {
    mockDetect.mockResolvedValue(null);
    await expect(run('Give me some PYQs')).rejects.toThrow(/Which exam/);
    expect(mockListQuestions).not.toHaveBeenCalled();
  });
});

describe('pyq_practice workflow', () => {
  const steps = (status: Record<string, StepState['status']> = {}) =>
    new Map<string, StepState>(['find', 'save'].map((id) => [id, { id, label: id, tool: id, status: status[id] ?? 'completed', attempts: 1 } as StepState]));

  it('plans find → save against the real tools', () => {
    const plan = pyqPracticeWorkflow.buildPlan('Give me 25 JEE Main 2023 Physics PYQs');
    const registry = registerPyqTools(registerQuizTools(new ToolRegistry()));
    expect(validatePlan(plan, registry, resolveBudget(pyqPracticeWorkflow.budget))).toMatchObject({ ok: true });
    expect(plan.steps.map((s) => s.tool)).toEqual(['find_verified_past_year_questions', 'create_quiz_artifact']);
    expect(plan.steps[0].input).toMatchObject({ count: 25 });
    expect(plan.steps[1].input).toMatchObject({ source: 'pyq-paper' });
    expect((plan.steps[1].input as any).sourceNote).toMatch(/Sadhya has not re-checked them against the key file/);
  });

  it('is registered with the other artifact workflows', () => {
    expect(createDefaultWorkflowRegistry().ids()).toContain('pyq_practice');
  });

  const found = {
    examId: 'JEE_MAIN',
    examName: 'JEE Main',
    year: 2023,
    subject: 'Physics',
    topicWords: [],
    checked: 33,
    checkedAtLeast: false,
    excluded: { implausible_answer_key: 16, not_multiple_choice: 2 },
    sittings: ['2023 · 24 January Shift 1'],
    answerSources: ['NTA Final Answer Key 2023'],
    questions: [{ id: 'pyq_1' }],
  };

  it('says where the questions came from and what the answers are — and are not', () => {
    const outputs = new Map<string, unknown>([
      ['find', found],
      ['save', { artifactId: 'a1', attemptId: 'q1', title: 'JEE Main 2023 Physics — past-year questions', questionCount: 14 }],
    ]);
    const r = pyqPracticeWorkflow.evaluate({ goal: 'g', steps: steps(), outputs } as any);
    expect(r.outcome).toBe('success');
    expect(r.summary).toContain('14 questions from real JEE Main papers — 2023 · 24 January Shift 1.');
    expect(r.summary).toContain('(answer key as recorded: “NTA Final Answer Key 2023”); Sadhya hasn\'t re-checked them against the key file.');
    expect(r.summary).toContain('Not used: 16 from sources whose answer key is almost all one letter (machine-written, not real papers), 2 not four-option multiple choice.');
  });

  it('refuses honestly when nothing passes, and offers what it can do instead', () => {
    const none = { ...found, examName: 'SSC CGL', examId: 'SSC_CGL', subject: undefined, questions: undefined, checked: 1000, checkedAtLeast: true, excluded: { answers_not_officially_verified: 1000 } };
    const r = pyqPracticeWorkflow.evaluate({ goal: 'g', steps: steps({ save: 'skipped' }), outputs: new Map([['find', none]]) } as any);
    expect(r.outcome).toBe('no_result');
    expect(r.summary).toContain('for **SSC CGL 2023**');
    expect(r.summary).toContain('holds at least 1000 for this request, but none passes the checks for a real past paper');
    expect(r.summary).toContain('1000 whose answers were never checked against the official key');
    expect(r.summary).toContain('Create 20 NEET Biology questions from Cell Structure');
  });

  it('reports a failed save as partial, and a failed lookup as no result', () => {
    const partial = pyqPracticeWorkflow.evaluate({ goal: 'g', steps: steps({ save: 'failed' }), outputs: new Map([['find', found]]) } as any);
    expect(partial.outcome).toBe('partial');
    const nothing = pyqPracticeWorkflow.evaluate({ goal: 'g', steps: steps({ find: 'failed', save: 'skipped' }), outputs: new Map() } as any);
    expect(nothing.outcome).toBe('no_result');
  });
});

describe('mock test from a real paper', () => {
  const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry'];
  /** A real sitting: 6 questions per subject in paper order, plus two numerical and one figure question. */
  const sittingRows = (tag: string, shift: string, date: string, year: number) => [
    ...Array.from({ length: 18 }, (_, i) =>
      real(i + 1, {
        questionId: `pyq:jee_main:${year}:${tag}:q${i + 1}`,
        sourceId: `src_jee_main_${year}_${tag}_official`,
        shift,
        year,
        normalizedSittingDate: date,
        subject: SUBJECTS[Math.floor(i / 6)],
        paper: 'B.E./B.Tech Paper 1',
        questionText: `${tag} question ${i + 1}?`,
      }),
    ),
    real(19, { questionId: `pyq:jee_main:${year}:${tag}:q19`, sourceId: `src_jee_main_${year}_${tag}_official`, shift, year, normalizedSittingDate: date, subject: 'Physics', paper: 'B.E./B.Tech Paper 1', options: [], correctAnswer: '5' }),
    real(20, { questionId: `pyq:jee_main:${year}:${tag}:q20`, sourceId: `src_jee_main_${year}_${tag}_official`, shift, year, normalizedSittingDate: date, subject: 'Physics', paper: 'B.E./B.Tech Paper 1', options: [], correctAnswer: '12' }),
    real(21, { questionId: `pyq:jee_main:${year}:${tag}:q21`, sourceId: `src_jee_main_${year}_${tag}_official`, shift, year, normalizedSittingDate: date, subject: 'Chemistry', paper: 'B.E./B.Tech Paper 1', questionText: 'In the figure shown, find x.' }),
  ];
  const newer = sittingRows('24_january_shift_1', '24 January Shift 1', '2023-01-24', 2023);
  const older = sittingRows('29_june_shift_2', '29 June Shift 2', '2022-06-29', 2022);
  const machineWritten = Array.from({ length: 16 }, (_, i) => fake(i + 1));
  const bank = (rows: any[]) =>
    mockListQuestions.mockImplementation(async (f: any) =>
      rows.filter((q) => (!f.verificationStatus || q.verificationStatus === f.verificationStatus) && (!f.year || q.year === f.year) && (!f.shift || q.shift === f.shift)),
    );
  const tool = () => registerPyqTools(new ToolRegistry()).get('find_real_past_paper')!;
  const run = async (query: string) => {
    const t = tool();
    const result = await t.execute(t.inputSchema.parse({ query }), ctx);
    t.outputSchema.parse(result.data);
    return result.data as any;
  };

  it('takes the newest real paper’s multiple-choice part, in paper order, and says what it left out', async () => {
    mockDetect.mockResolvedValue('JEE_MAIN');
    bank([...older, ...machineWritten, ...newer]);
    const data = await run('Make a JEE Main mock test');
    expect(data.sitting).toEqual({ year: 2023, shift: '24 January Shift 1', paper: 'B.E./B.Tech Paper 1', label: '2023 · 24 January Shift 1' });
    expect(data.questions.map((q: any) => q.sourcePyqId)).toEqual(Array.from({ length: 18 }, (_, i) => `pyq:jee_main:2023:24_january_shift_1:q${i + 1}`));
    expect(data.sections).toEqual([
      { topic: 'Mathematics', count: 6 },
      { topic: 'Physics', count: 6 },
      { topic: 'Chemistry', count: 6 },
    ]);
    expect(data.leftOut).toEqual({ not_multiple_choice: 2, needs_figure: 1 });
    expect(data.durationMinutes).toBe(36);
    expect(data.title).toBe('JEE Main 2023 · 24 January Shift 1 — real paper (multiple-choice part)');
    expect(data.paperQuestions).toBe(21);
    expect(data.alreadySeen).toBeUndefined();
  });

  it('prefers a real paper the student has not taken', async () => {
    mockDetect.mockResolvedValue('JEE_MAIN');
    bank([...older, ...newer]);
    mockAttempts.listAttempts.mockResolvedValue([{ id: 'a1', source: 'pyq-paper' }]);
    mockAttempts.getAttempt.mockResolvedValue({ questions: newer.slice(0, 18).map((q) => ({ sourcePyqId: q.questionId })) });
    const data = await run('Make a JEE Main mock test');
    expect(data.sitting.label).toBe('2022 · 29 June Shift 2');
  });

  it('builds no mock from an exam with no real paper, and says why', async () => {
    mockDetect.mockResolvedValue('SSC_CGL');
    bank(Array.from({ length: 5 }, (_, i) => ({ ...real(i + 1), examId: 'SSC_CGL', sourceId: 'src_satvik', verificationStatus: 'SECONDARY_CONFIRMED', sourceType: 'TIER_B_REPUTABLE_PLATFORM' })));
    const data = await run('Make a 50-question SSC CGL mock test for me');
    expect(data.questions).toBeUndefined();
    expect(data.excluded).toEqual({ answers_not_officially_verified: 5 });
    expect(data.checked).toBe(5);
  });

  it('plans find → save, and words the result honestly', () => {
    const plan = mockTestWorkflow.buildPlan('Make a JEE Main mock test');
    expect(validatePlan(plan, registerPyqTools(registerQuizTools(new ToolRegistry())), resolveBudget(mockTestWorkflow.budget))).toMatchObject({ ok: true });
    expect(plan.steps.map((s) => s.tool)).toEqual(['find_real_past_paper', 'create_quiz_artifact']);
    expect(createDefaultWorkflowRegistry().ids()).toContain('mock_test');

    const found = {
      examId: 'JEE_MAIN',
      examName: 'Joint Entrance Examination (Main)',
      examShort: 'JEE Main',
      sitting: { year: 2023, shift: '24 January Shift 1', paper: 'B.E./B.Tech Paper 1', label: '2023 · 24 January Shift 1' },
      questions: [{ id: 'paper_1' }],
      sections: [{ topic: 'Mathematics', count: 6 }, { topic: 'Physics', count: 6 }, { topic: 'Chemistry', count: 6 }],
      leftOut: { not_multiple_choice: 2, needs_figure: 1 },
      durationMinutes: 36,
      answerSources: ['NTA Final Answer Key 2023'],
    };
    const steps = new Map<string, StepState>(['find', 'save'].map((id) => [id, { id, label: id, tool: id, status: 'completed', attempts: 1 } as StepState]));
    const r = mockTestWorkflow.evaluate({ goal: 'g', steps, outputs: new Map<string, unknown>([['find', found], ['save', { artifactId: 'a', attemptId: 'q', title: 't', questionCount: 18 }]]) } as any);
    expect(r.outcome).toBe('success');
    expect(r.summary).toContain('The multiple-choice part of a real JEE Main paper (B.E./B.Tech Paper 1) — 2023 · 24 January Shift 1, in paper order: Mathematics 6 · Physics 6 · Chemistry 6.');
    expect(r.summary).toContain('Left out of this paper: 2 not four-option multiple choice, 1 that need a figure the quiz can’t show.');
    expect(r.summary).toContain("Timed at 2 minutes a question (36 minutes) — Sadhya's pacing, since the exam's own time limit isn't recorded in Sadhya. Scored with Sadhya's usual quiz marking, not the exam's.");

    const none = mockTestWorkflow.evaluate({
      goal: 'g',
      steps,
      outputs: new Map<string, unknown>([['find', { examShort: 'SSC CGL', checked: 1000, excluded: { answers_not_officially_verified: 887, template: 113 } }]]),
    } as any);
    expect(none.outcome).toBe('no_result');
    expect(none.summary).toContain("I couldn't find a real SSC CGL paper I can stand behind, so I won't build a mock test from it.");
    expect(none.summary).toContain('at least 1000 questions for SSC CGL, but none passes the checks for a real past paper. Not used: 887 whose answers were never checked against the official key, 113 practice templates stamped as official papers.');
  });

  it.each(['Make a JEE Main mock test', 'Make a 50-question SSC CGL mock test for me', 'I want to take a full-length NEET mock'])('routes to mock_test: %s', (msg) => {
    expect(routeGoal(msg)).toMatchObject({ mode: 'agent', workflowId: 'mock_test' });
  });

  it('still sends “analyse my last mock” to the analysis', () => {
    expect(routeGoal('Analyze my last mock test')).toMatchObject({ workflowId: 'tests_analysis' });
  });
});

describe('routing', () => {
  it.each([
    'Give me JEE Main 2023 Physics PYQs',
    'I want to practise previous year questions on thermodynamics for JEE Main',
    'Show me NEET 2022 Biology past papers',
  ])('sends past-paper practice to pyq_practice: %s', (msg) => {
    expect(routeGoal(msg)).toMatchObject({ mode: 'agent', workflowId: 'pyq_practice' });
  });

  it('keeps mock tests, questions about PYQs, and chapter question sets where they belong', () => {
    expect(routeGoal('Make a 50-question SSC CGL mock test from past papers').workflowId).not.toBe('pyq_practice');
    expect(routeGoal('What are PYQs?').mode).toBe('chat');
    expect(routeGoal('Create 30 NEET Biology questions from Cell Structure')).toMatchObject({ workflowId: 'question_set' });
  });
});
