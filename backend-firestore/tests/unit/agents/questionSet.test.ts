/**
 * Phase 6 — golden case 2's tools and workflow: syllabus retrieval without inventing identity,
 * past-year questions only with real provenance, generation grounded in the chapter's own text,
 * validation against that text, and duplicate detection.
 */
const mockPages = jest.fn();
const mockNodes = jest.fn();
const mockDetect = jest.fn();
const mockListQuestions = jest.fn();
const mockGenerate = jest.fn();
const mockAttempts = { listAttempts: jest.fn(), getAttempt: jest.fn() };
jest.mock('../../../src/agents/tools/adapters/chapterText', () => {
  const actual = jest.requireActual('../../../src/agents/tools/adapters/chapterText');
  return { ...actual, loadChapterPages: (...a: any[]) => mockPages(...a) };
});
jest.mock('../../../src/services/exam/syllabusGraph.service', () => ({ syllabusGraphService: { getSyllabusNodes: (...a: any[]) => mockNodes(...a) } }));
jest.mock('../../../src/services/pyq/examIndex', () => ({ detectExamId: (...a: any[]) => mockDetect(...a) }));
jest.mock('../../../src/services/exam/examMaster.service', () => ({ examMasterService: { getExam: async () => ({ name: 'NEET UG' }) } }));
jest.mock('../../../src/repositories/pyq.repository', () => ({ pyqRepository: { listQuestions: (...a: any[]) => mockListQuestions(...a) } }));
jest.mock('../../../src/services/ai/gemini.provider', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({ generateResponse: (...a: any[]) => mockGenerate(...a) })),
}));
jest.mock('../../../src/services/tests/quizAttempts.service', () => ({ quizAttemptsService: mockAttempts }));

import { allocate, difficultyMix, hasRealProvenance, provenanceRefusal, registerQuestionSetTools, topicFromGoal } from '../../../src/agents/tools/adapters/questionSet.adapter';
import { registerQuizTools } from '../../../src/agents/tools/adapters/quiz.adapter';
import { registerCurriculumTools } from '../../../src/agents/tools/adapters/curriculum.adapter';
import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';
import { questionSetWorkflow } from '../../../src/agents/workflows/questionSet.workflow';
import { validatePlan } from '../../../src/agents/runtime/PlanValidator';
import { resolveBudget } from '../../../src/agents/runtime/AgentPolicy';
import { routeGoal } from '../../../src/agents/runtime/GoalRouter';
import { StepState } from '../../../src/agents/runtime/agent.types';

const ctx = { userId: 'student-1', runId: 'run-1', stepId: 's', signal: new AbortController().signal };
const PAGES = [
  { pageNumber: 1, text: 'CHAPTER 8 CELL: THE UNIT OF LIFE 8.2 Cell Theory 8.4 Prokaryotic Cells' },
  { pageNumber: 2, text: '8.2 CELL THEORY In 1838, Matthias Schleiden, a German botanist, examined a large number of plants and observed that all plants are composed of different kinds of cells which form the tissues of the plant. Rudolf Virchow (1855) first explained that cells divided and new cells are formed from pre-existing cells (Omnis cellula-e cellula). This modified the hypothesis of Schleiden and Schwann.' },
  { pageNumber: 3, text: '8.4 PROKARYOTIC CELLS The prokaryotic cells are represented by bacteria, blue-green algae, mycoplasma and PPLO (Pleuro Pneumonia Like Organisms). They are generally smaller and multiply more rapidly than the eukaryotic cells. Ribosomes of prokaryotes are 70S while those of eukaryotes are 80S, and a prokaryotic cell has no membrane-bound organelles at all.' },
];
const HEADINGS = ['8.2 Cell Theory', '8.4 Prokaryotic Cells'];
const chapterInput = { notebookId: 'ncert-c11-biology', sourceId: 's8', headings: HEADINGS };

const registry = () => registerQuestionSetTools(registerQuizTools(registerCurriculumTools(new ToolRegistry())));
const run = async (name: string, input: any) => {
  const tool = registry().get(name)!;
  const result = await tool.execute(tool.inputSchema.parse(input), ctx);
  tool.outputSchema.parse(result.data);
  return result;
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
  mockPages.mockResolvedValue({ notebookId: 'ncert-c11-biology', sourceId: 's8', pages: PAGES, chars: 1000 });
});

describe('pure helpers', () => {
  it.each([
    ['Create 30 NEET Biology questions from Cell Structure.', 'Cell Structure'],
    ['Give me a 20-question quiz on Class 11 Physics Laws of Motion', 'Laws Motion'],
    ['make 15 MCQs about photosynthesis for NEET', 'photosynthesis'],
  ])('topicFromGoal(%s) → %s', (goal, topic) => {
    expect(topicFromGoal(goal)).toBe(topic);
  });

  it('calls a question a past-year question only with real provenance and an officially confirmed answer', () => {
    const real = {
      origin: 'authentic_import',
      corpusBucket: 'OFFICIAL_PYQ',
      ingestionState: 'INDEXED',
      verificationStatus: 'OFFICIAL_CONFIRMED',
      sourceType: 'TIER_A_OFFICIAL',
      options: ['a', 'b', 'c', 'd'],
      questionText: 'Q',
    };
    expect(hasRealProvenance(real)).toBe(true);
    expect(provenanceRefusal({ ...real, origin: 'template' })).toBe('template');
    expect(provenanceRefusal({ ...real, origin: undefined })).toBe('unverified_provenance');
    expect(provenanceRefusal({ ...real, corpusBucket: 'PRACTICE_MOCK' })).toBe('unverified_provenance');
    expect(provenanceRefusal({ ...real, ingestionState: 'ARCHIVED_DUPLICATE' })).toBe('archived_duplicate');
    // A community transcription: real questions, answers never checked against the official key.
    expect(provenanceRefusal({ ...real, verificationStatus: 'SECONDARY_CONFIRMED', sourceType: 'TIER_B_REPUTABLE_PLATFORM' })).toBe('answers_not_officially_verified');
    expect(provenanceRefusal({ ...real, options: ['a', 'b'] })).toBe('not_multiple_choice');
  });

  it('allocates questions by how much each section teaches, one at least each, in chapter order', () => {
    const a = allocate([{ id: 's1', heading: 'A', chars: 1000 }, { id: 's2', heading: 'B', chars: 3000 }, { id: 's3', heading: 'C', chars: 100 }], 8);
    expect(a).toEqual([{ sectionId: 's1', heading: 'A', count: 2 }, { sectionId: 's2', heading: 'B', count: 6 }]);
    expect(allocate([{ id: 's1', heading: 'A', chars: 900 }, { id: 's2', heading: 'B', chars: 900 }], 1).reduce((n, x) => n + x.count, 0)).toBe(1);
  });

  it('declares its difficulty mix as its own, not as observed data', () => {
    expect(difficultyMix(30)).toMatchObject({ easy: 9, medium: 15, hard: 6, basis: expect.stringMatching(/Sadhya’s standard practice mix/) });
  });
});

describe('resolve_exam_topic', () => {
  const NODES = [
    { id: 'root', label: 'SYLLABUS FOR NEET (UG) - 2026', type: 'PAPER' },
    { id: 'bio', label: 'BIOLOGY', type: 'SUBJECT', parentEntityId: 'root' },
    { id: 'phy', label: 'PHYSICS', type: 'SUBJECT', parentEntityId: 'root' },
    { id: 'u3', label: 'UNIT 3: Cell Structure and Function', type: 'TOPIC', parentEntityId: 'bio' },
    { id: 'u3a', label: 'Cell theory and cell as the basic unit of life; Structure of prokaryotic and eukaryotic cell', type: 'SUBTOPIC', parentEntityId: 'u3' },
    { id: 'emf', label: 'Internal resistance, potential difference and emf of a cell', type: 'SUBTOPIC', parentEntityId: 'phy' },
  ];

  it('finds the exam and the topic’s place in the syllabus, within the subject asked about', async () => {
    mockDetect.mockResolvedValue('NEET_UG');
    mockNodes.mockResolvedValue(NODES);
    const { data } = await run('resolve_exam_topic', { query: 'Create 30 NEET Biology questions from Cell Structure.' });
    expect(data).toMatchObject({ examId: 'NEET_UG', examName: 'NEET UG', subject: 'biology', topic: 'Cell Structure' });
    expect(data.syllabus).toEqual({
      nodeId: 'u3a',
      label: NODES[4].label,
      path: ['SYLLABUS FOR NEET (UG) - 2026', 'BIOLOGY', 'UNIT 3: Cell Structure and Function', NODES[4].label],
      matchedBy: 'name',
    });
    expect(data.chapterQuery).toContain('Cell theory and cell as the basic unit of life');
  });

  it('works without an exam, and asks for a topic when there is none', async () => {
    mockDetect.mockResolvedValue(null);
    const { data } = await run('resolve_exam_topic', { query: 'Make 10 questions on photosynthesis' });
    expect(data).toEqual({ topic: 'photosynthesis', chapterQuery: 'photosynthesis' });
    await expect(run('resolve_exam_topic', { query: 'Create 30 NEET questions' })).rejects.toThrow(/Which topic/);
  });
});

describe('find_verified_past_questions', () => {
  it('uses only authentic past-year questions and counts the rest by why they were refused', async () => {
    const realRow = { origin: 'authentic_import', corpusBucket: 'OFFICIAL_PYQ', ingestionState: 'INDEXED', verificationStatus: 'OFFICIAL_CONFIRMED', sourceType: 'TIER_A_OFFICIAL', options: ['a', 'b', 'c', 'd'], year: 2019, examId: 'NEET_UG', shift: 'Phase 1', sourceId: 'src_neet_2019_phase_1_official' };
    // One question on the chapter is too few to judge its paper's answer key, so the whole sitting is looked up.
    const sitting = Array.from({ length: 16 }, (_, i) => ({ ...realRow, questionId: `pyq:NEET_UG:2019:s${i}`, questionText: `Sitting question ${i}?`, correctAnswer: 'ABCD'[i % 4], topic: 'Other' }));
    const onChapter = [
      { ...realRow, questionId: 'pyq:NEET_UG:2019:x1', questionText: 'Real question?', correctAnswer: 'B', topic: 'Cell: The Unit of Life' },
      { questionId: 't1', origin: 'template', corpusBucket: 'PRACTICE_MOCK', ingestionState: 'ACTIVE', questionText: 'Template?', options: ['a', 'b', 'c', 'd'], correctAnswer: 'A', year: 2013 },
      { questionId: 't2', origin: 'template', corpusBucket: 'PRACTICE_MOCK', ingestionState: 'ARCHIVED_DUPLICATE', questionText: 'Template?', options: ['a', 'b', 'c', 'd'], correctAnswer: 'A', year: 2014 },
      { questionId: 'u1', corpusBucket: 'OFFICIAL_PYQ', ingestionState: 'INDEXED', questionText: 'No origin?', options: ['a', 'b', 'c', 'd'], correctAnswer: 'C', year: 2020 },
      // A community transcription of a real paper: the answers were never checked against the official key.
      { questionId: 'c1', origin: 'authentic_import', corpusBucket: 'OFFICIAL_PYQ', ingestionState: 'INDEXED', verificationStatus: 'SECONDARY_CONFIRMED', sourceType: 'TIER_B_REPUTABLE_PLATFORM', questionText: 'Transcribed?', options: ['a', 'b', 'c', 'd'], correctAnswer: 'D', year: 2021 },
    ];
    mockListQuestions.mockImplementation(async (filter: any) => (filter.shift ? sitting : onChapter));
    const { data } = await run('find_verified_past_questions', { examTopic: { examId: 'NEET_UG', topic: 'Cell Structure' }, chapterName: 'Cell: The Unit of Life' });
    expect(mockListQuestions).toHaveBeenCalledWith({ examId: 'NEET_UG', topic: 'Cell: The Unit of Life', limit: 200 });
    expect(mockListQuestions).toHaveBeenCalledWith({ examId: 'NEET_UG', year: 2019, shift: 'Phase 1', limit: 300 });
    expect(data.excluded).toEqual({ template: 2, unverified_provenance: 1, answers_not_officially_verified: 1 });
    expect(data.usable).toEqual([expect.objectContaining({ questionOrigin: 'AUTHENTIC_PYQ', sourceYear: 2019, correctAnswerIndex: 1, sourcePyqId: 'pyq:NEET_UG:2019:x1' })]);
  });

  it('skips the bank entirely when no exam was named', async () => {
    const { data } = await run('find_verified_past_questions', { examTopic: { topic: 'photosynthesis' }, chapterName: 'Photosynthesis in Higher Plants' });
    expect(data).toEqual({ checked: 0, usable: [], excluded: {} });
    expect(mockListQuestions).not.toHaveBeenCalled();
  });
});

describe('generate → validate → dedupe', () => {
  const good = {
    question: 'Who first explained that new cells are formed from pre-existing cells?',
    options: ['Rudolf Virchow', 'Matthias Schleiden', 'Theodore Schwann', 'Robert Hooke'],
    correctIndex: 0,
    explanation: 'Virchow proposed omnis cellula-e cellula.',
    evidence: 'Rudolf Virchow (1855) first explained that cells divided and new cells are formed from pre-existing cells',
    difficulty: 'easy',
  };
  const invented = { ...good, question: 'In which year did Schleiden publish his cell theory?', options: ['1838', '1855', '1665', '1902'], correctIndex: 0, evidence: 'Schleiden published the cell theory in 1838 in his famous book' };
  const ambiguous = {
    question: 'What sedimentation size are prokaryotic ribosomes?',
    options: ['70S', '80S', '60S', '90S'],
    correctIndex: 0,
    explanation: '',
    evidence: 'Ribosomes of prokaryotes are 70S while those of eukaryotes are 80S',
  };

  it('writes from each section’s own text and reports the model’s cost to the run budget', async () => {
    mockGenerate.mockResolvedValue({ reply: JSON.stringify({ questions: [good, invented] }), usage: { promptTokens: 1500, completionTokens: 600 } });
    const result = await run('generate_grounded_questions', {
      ...chapterInput,
      allocations: [{ sectionId: 's1', heading: 'Cell Theory', count: 2 }],
      difficulty: { easy: 1, medium: 1, hard: 0 },
      sourceTitle: 'Cell: The Unit of Life',
      examTopic: { examId: 'NEET_UG', examName: 'NEET UG', subject: 'biology', topic: 'Cell Structure' },
    });
    expect(result.data.drafts).toHaveLength(2);
    expect(result.usage).toEqual({ tokens: 2100, costUsd: (1500 * 0.3 + 600 * 2.5) / 1_000_000 });
    const [history, , opts] = mockGenerate.mock.calls[0];
    expect(history[0].content).toContain('8.2 CELL THEORY In 1838');
    expect(history[0].content).toContain('WORD FOR WORD');
    expect(opts).toMatchObject({ responseJson: true, userId: 'student-1' });
  });

  it('keeps only questions the chapter backs and an independent solver agrees with, quoting the chapter with its page', async () => {
    // The solver sees two survivors of the string checks (the good one and the 70S one) and, for
    // the sake of the test, disagrees with the key of the second.
    mockGenerate.mockResolvedValue({ reply: JSON.stringify({ answers: [{ id: 'q1', answer: 'A' }, { id: 'q2', answer: 'B' }] }), usage: { promptTokens: 400, completionTokens: 30 } });
    const result = await run('validate_questions', {
      ...chapterInput,
      drafts: [
        { ...good, sectionId: 's1' },
        { ...invented, sectionId: 's1' },
        { ...ambiguous, sectionId: 's2' },
      ],
      chapterName: 'Cell: The Unit of Life',
      examTopic: { examId: 'NEET_UG', topic: 'Cell Structure' },
    });
    const data = result.data;
    expect(data.rejected).toEqual({ evidence_not_in_source: 1, solver_disagrees: 1 });
    expect(data.accepted).toHaveLength(1);
    expect(result.usage).toEqual({ tokens: 430, costUsd: (400 * 0.3 + 30 * 2.5) / 1_000_000 });
    const solverPrompt: string = mockGenerate.mock.calls[0][0][0].content;
    expect(solverPrompt).toContain('use ONLY its quoted evidence');
    expect(data.accepted[0]).toMatchObject({
      topic: 'Cell Theory',
      questionOrigin: 'CURRICULUM_SYNTHESIZED',
      identityStatus: 'UNANCHORED',
      examId: 'NEET_UG',
      explanation: expect.stringMatching(/The chapter says: “Rudolf Virchow \(1855\).*” \(Cell: The Unit of Life, p\. 2 of the chapter PDF\)/),
    });
    expect(data.accepted[0].syllabusNodeId).toBeUndefined();
  });

  it('drops near-duplicates and what the student saw recently, then trims across sections', async () => {
    mockAttempts.listAttempts.mockResolvedValue([{ id: 'qa_old', status: 'completed' }]);
    mockAttempts.getAttempt.mockResolvedValue({ questions: [{ text: 'What size are the ribosomes of prokaryotes?' }] });
    const q = (id: string, text: string, topic: string) => ({ id, text, topic, options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 0, explanation: 'e', questionOrigin: 'CURRICULUM_SYNTHESIZED', identityStatus: 'UNANCHORED' });
    const { data } = await run('detect_duplicate_questions', {
      questions: [
        q('1', 'Who first explained that new cells are formed from pre-existing cells?', 'Cell Theory'),
        q('2', 'Who first explained that new cells are formed from pre existing cells', 'Cell Theory'),
        q('3', 'What size are the ribosomes of prokaryotes?', 'Prokaryotic Cells'),
        q('4', 'Which organisms represent prokaryotic cells?', 'Prokaryotic Cells'),
        q('5', 'Which botanist studied plant tissues in 1838?', 'Cell Theory'),
      ],
      count: 2,
      chapterName: 'Cell: The Unit of Life',
      bookTitle: 'NCERT Class 11 Biology',
      examTopic: { examId: 'NEET_UG', examName: 'NEET UG', topic: 'Cell Structure' },
      checked: 8,
      rejected: { evidence_not_in_source: 2 },
    });
    expect(data.removed).toEqual({ withinSet: 1, seenBefore: 1 });
    expect(data.questions.map((x: any) => x.topic)).toEqual(['Cell Theory', 'Prokaryotic Cells']);
    expect(data.title).toBe('Cell: The Unit of Life — 2 NEET UG questions');
    expect(data.validation).toEqual({ checked: 8, accepted: 6, rejected: { evidence_not_in_source: 2, near_duplicate: 1, seen_recently: 1 } });
    expect(data.origin).toEqual([{ label: 'Written from the NCERT chapter, each answer checked against its text', count: 2 }]);
  });
});

describe('question_set workflow', () => {
  it('validates against the real tools, in the golden case’s order', () => {
    const plan = questionSetWorkflow.buildPlan('Create 30 NEET Biology questions from Cell Structure.');
    const result = validatePlan(plan, registry(), resolveBudget(questionSetWorkflow.budget));
    expect(result.errors).toEqual([]);
    expect(plan.steps.map((s) => s.tool)).toEqual([
      'resolve_exam_topic',
      'resolve_curriculum_chapter',
      'read_chapter_sections',
      'plan_question_blueprint',
      'find_verified_past_questions',
      'generate_grounded_questions',
      'validate_questions',
      'detect_duplicate_questions',
      'create_quiz_artifact',
    ]);
    expect((plan.steps[3].input as any).count).toBe(30);
  });

  it('is where a topic question set routes — but not a mock test or a quiz from the student’s chart', () => {
    expect(routeGoal('Create 30 NEET Biology questions from Cell Structure.')).toMatchObject({ mode: 'agent', workflowId: 'question_set' });
    expect(routeGoal('Give me a 20-question quiz on Class 11 Physics Laws of Motion').workflowId).toBe('question_set');
    // A mock test is a whole real paper — its own workflow, never a topic question set.
    expect(routeGoal('Make a 50-question SSC CGL mock test for me').workflowId).toBe('mock_test');
    expect(routeGoal('Create a 20-question quiz from it.').workflowId).toBe('quiz_from_artifact');
  });

  it('tells the student where the questions came from, what was set aside, and why no past-year question was used', () => {
    const plan = questionSetWorkflow.buildPlan('Create 30 NEET Biology questions from Cell Structure.');
    const steps = new Map<string, StepState>(plan.steps.map((s) => [s.id, { id: s.id, label: s.label, tool: s.tool!, status: 'completed', attempts: 1 } as StepState]));
    const r = questionSetWorkflow.evaluate({
      goal: plan.goal,
      plan,
      steps,
      outputs: new Map<string, unknown>([
        ['exam_topic', { examId: 'NEET_UG', examName: 'NEET UG', topic: 'Cell Structure', syllabus: { path: ['SYLLABUS FOR NEET (UG) - 2026', 'BIOLOGY', 'UNIT 3: Cell Structure and Function', 'Cell theory and cell as the basic unit of life; Structure of prokaryotic cells'] } }],
        ['chapter', { resolved: true, bookTitle: 'NCERT Class 11 Biology', chapterName: 'Cell: The Unit of Life', notebookId: 'n', sourceId: 's' }],
        ['blueprint', { difficulty: { easy: 9, medium: 15, hard: 6, basis: 'Sadhya’s standard practice mix (30% easy, 50% medium, 20% hard)' } }],
        ['past', { checked: 36, usable: [], excluded: { template: 36 } }],
        ['validate', { accepted: new Array(26).fill({}), checked: 42, rejected: { evidence_not_in_source: 10, ambiguous_key: 6 } }],
        ['dedupe', { validation: { rejected: { evidence_not_in_source: 10, ambiguous_key: 6, near_duplicate: 2 } } }],
        ['save', { artifactId: 'quiz-1', title: 'Cell: The Unit of Life — 24 NEET UG questions', questionCount: 24, attemptId: 'qa_1' }],
      ]),
    });
    expect(r.outcome).toBe('success');
    expect(r.summary).toMatch(/\*\*Syllabus:\*\* NEET UG › BIOLOGY › UNIT 3: Cell Structure and Function › Cell theory and cell as the basic unit of life \(matched by name\)/);
    expect(r.summary).toMatch(/You asked for 30; 24 passed every check/);
    expect(r.summary).toMatch(/10 because their quoted evidence is not in the chapter/);
    expect(r.summary).toMatch(/the bank holds 36 on this chapter, but none can be shown as a past-year question — not used: 36 practice templates stamped as official papers\./);
    expect(r.summary).toMatch(/Sadhya’s standard practice mix/);
  });
});
