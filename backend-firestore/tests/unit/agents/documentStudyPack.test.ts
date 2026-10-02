/**
 * Phase 6 — golden case 4: "Read this uploaded PDF and create revision notes + flashcards + quiz."
 * The student's own document is read owner-checked, and every note, card and question must be
 * quoted from it to survive.
 */
const mockUploads = { read: jest.fn() };
const mockNotebooks = { getNotebooksByUser: jest.fn(), getSources: jest.fn(), getNotebook: jest.fn() };
const mockGenerate = jest.fn();
const mockDownload = jest.fn();
const mockExtract = jest.fn();
jest.mock('../../../src/agents/uploads/agentUploads.service', () => ({ getAgentUploadsService: () => mockUploads }));
jest.mock('../../../src/repositories/notebook.repository', () => ({ notebookRepository: mockNotebooks }));
jest.mock('../../../src/services/ai/gemini.provider', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({ generateResponse: (...a: any[]) => mockGenerate(...a) })),
}));
jest.mock('../../../src/config/firebase', () => ({
  firebaseApp: { storage: () => ({ bucket: () => ({ file: () => ({ download: (...a: any[]) => mockDownload(...a) }) }) }) },
}));
jest.mock('../../../src/config/env', () => ({ env: {} }));
jest.mock('../../../src/services/fileParser.service', () => ({ FileParserService: { extractText: (...a: any[]) => mockExtract(...a) } }));

import { registerDocumentTools, documentSections } from '../../../src/agents/tools/adapters/document.adapter';
import { registerArtifactTools } from '../../../src/agents/tools/adapters/artifact.adapter';
import { registerFlashcardTools } from '../../../src/agents/tools/adapters/flashcards.adapter';
import { registerQuizTools } from '../../../src/agents/tools/adapters/quiz.adapter';
import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';
import { documentStudyPackWorkflow, partsFromGoal } from '../../../src/agents/workflows/documentStudyPack.workflow';
import { validatePlan } from '../../../src/agents/runtime/PlanValidator';
import { resolveBudget } from '../../../src/agents/runtime/AgentPolicy';
import { routeGoal } from '../../../src/agents/runtime/GoalRouter';
import { StepState } from '../../../src/agents/runtime/agent.types';

const ctx = { userId: 'student-1', runId: 'run-1', stepId: 's', signal: new AbortController().signal };
const PAGES = [
  { pageNumber: 1, text: 'Photosynthesis. Photosynthesis is the process by which green plants make their own food using light energy. It takes place in the chloroplasts of leaf cells. '.repeat(3) },
  { pageNumber: 2, text: 'The light reaction occurs in the grana of the chloroplast, while the dark reaction occurs in the stroma. Chlorophyll a is the primary pigment of photosynthesis. '.repeat(3) },
];
const REF = { kind: 'upload' as const, id: 'up-1', title: 'Photosynthesis notes.pdf' };

const registry = () => registerDocumentTools(registerQuizTools(registerFlashcardTools(registerArtifactTools(new ToolRegistry()))));
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
  mockUploads.read.mockResolvedValue({ upload: { uploadId: 'up-1', name: 'Photosynthesis notes.pdf', userId: 'student-1' }, pages: PAGES });
});

describe('what to make', () => {
  it.each([
    ['Read this uploaded PDF and create revision notes + flashcards + quiz.', ['notes', 'flashcards', 'quiz']],
    ['Make flashcards from my uploaded PDF', ['flashcards']],
    ['Summarise my document', ['notes']],
    ['Read this and help me study', ['notes', 'flashcards', 'quiz']],
  ])('%s → %j', (goal, parts) => {
    expect(partsFromGoal(goal)).toEqual(parts);
  });

  it('routes a request about the student’s own document to the study pack', () => {
    expect(routeGoal('Read this uploaded PDF and create revision notes + flashcards + quiz.', { hasDocument: true })).toMatchObject({ mode: 'agent', workflowId: 'document_study_pack' });
    expect(routeGoal('Read this uploaded PDF and create revision notes + flashcards + quiz.')).toMatchObject({ workflowId: 'document_study_pack' });
    expect(routeGoal('Make a quiz from this', { hasDocument: true }).workflowId).toBe('document_study_pack');
    // Without their own document, "flashcards from this formula chart" still reuses the chart.
    expect(routeGoal('Create flashcards from this formula chart.').workflowId).toBe('flashcards_from_artifact');
    // A question with a file attached is still a question.
    expect(routeGoal('What is osmosis?', { hasDocument: true }).mode).toBe('chat');
  });
});

describe('the plan', () => {
  it('reads the attached document, then writes the three in parallel, then saves each', () => {
    const plan = documentStudyPackWorkflow.buildPlan('Read this uploaded PDF and create revision notes + flashcards + quiz.', { uploadIds: ['up-1'] });
    const result = validatePlan(plan, registry(), resolveBudget(documentStudyPackWorkflow.budget));
    expect(result.errors).toEqual([]);
    expect(plan.steps[0]).toMatchObject({ tool: 'read_my_document', input: { uploadIds: ['up-1'] }, label: 'Reading your document' });
    for (const id of ['notes', 'cards', 'quiz']) expect(plan.steps.find((s) => s.id === id)?.dependsOn).toEqual(['read']);
    expect(plan.steps.map((s) => s.tool)).toEqual(
      expect.arrayContaining(['write_revision_notes', 'write_document_flashcards', 'write_document_quiz', 'create_document_artifact', 'create_flashcards_artifact', 'create_quiz_artifact']),
    );
  });

  it('makes only what was asked for', () => {
    const plan = documentStudyPackWorkflow.buildPlan('Make flashcards from my uploaded PDF');
    expect(plan.steps.map((s) => s.id)).toEqual(['read', 'cards', 'save_cards']);
    expect(plan.steps[0].label).toBe('Finding your latest upload');
  });

  it('says how to attach a document when there is none', () => {
    const plan = documentStudyPackWorkflow.buildPlan('Read my uploaded PDF and make notes');
    const steps = new Map<string, StepState>(plan.steps.map((s) => [s.id, { id: s.id, label: s.label, tool: s.tool!, status: 'completed', attempts: 1 } as StepState]));
    const r = documentStudyPackWorkflow.evaluate({ goal: plan.goal, plan, steps, outputs: new Map([['read', { found: false }]]) });
    expect(r.outcome).toBe('no_result');
    expect(r.summary).toMatch(/Attach the PDF to your message/);
  });
});

describe('read_my_document', () => {
  it('reads the attached upload through its owner-scoped store', async () => {
    const { data } = await run('read_my_document', { uploadIds: ['up-1'] });
    expect(mockUploads.read).toHaveBeenCalledWith('student-1', 'up-1');
    expect(data).toMatchObject({ found: true, via: 'attachment', pageCount: 2, document: REF, truncated: false });
  });

  it('otherwise takes the newest document in the student’s OWN notebooks, never a shared one', async () => {
    mockNotebooks.getNotebooksByUser.mockResolvedValue([
      { id: 'nb-shared', owner: 'teacher-9', viewers: ['student-1'] },
      { id: 'nb-mine', owner: 'student-1' },
    ]);
    mockNotebooks.getSources.mockImplementation(async (id: string) =>
      id === 'nb-mine' ? [{ id: 'src-1', notebookId: 'nb-mine', title: 'Biology chapter.pdf', storagePath: 'u/student-1/a.pdf', status: 'READY', createdAt: 5, mimeType: 'application/pdf' }] : [{ id: 'src-9', notebookId: 'nb-shared', title: 'Shared.pdf', storagePath: 'x', status: 'READY', createdAt: 9 }],
    );
    mockNotebooks.getNotebook.mockResolvedValue({ id: 'nb-mine', owner: 'student-1' });
    mockDownload.mockResolvedValue([Buffer.from('pdf')]);
    mockExtract.mockResolvedValue(PAGES);
    const { data } = await run('read_my_document', { uploadIds: [] });
    expect(data).toMatchObject({ found: true, via: 'latest_upload', document: { kind: 'source', id: 'src-1', notebookId: 'nb-mine', title: 'Biology chapter.pdf' } });
    expect(mockNotebooks.getSources).not.toHaveBeenCalledWith('nb-shared');
    expect(mockNotebooks.getNotebook).toHaveBeenCalledWith('student-1', 'nb-mine');
  });

  it('reports nothing found instead of guessing', async () => {
    mockNotebooks.getNotebooksByUser.mockResolvedValue([]);
    expect((await run('read_my_document', { uploadIds: [] })).data).toEqual({ found: false });
  });
});

describe('the writers keep only what the document states', () => {
  const quote1 = 'Photosynthesis is the process by which green plants make their own food using light energy';
  const quote2 = 'The light reaction occurs in the grana of the chloroplast, while the dark reaction occurs in the stroma';

  it('notes: a point whose quote is not in the document is dropped; kept points cite their page', async () => {
    mockGenerate.mockResolvedValue({
      reply: JSON.stringify({
        notes: [
          { passage: 'P1', heading: 'What photosynthesis is', points: [
            { point: 'Photosynthesis is the process by which green plants make food using light energy.', evidence: quote1 },
            { point: 'Photosynthesis releases 686 kcal per mole of glucose.', evidence: 'Photosynthesis stores 686 kcal per mole of glucose made' },
          ] },
        ],
      }),
      usage: { promptTokens: 1000, completionTokens: 200 },
    });
    const { data, usage } = await run('write_revision_notes', { document: REF });
    expect(data.stats).toEqual({ checked: 2, kept: 1, rejected: { evidence_not_in_source: 1 } });
    expect(data.sections[0].blocks[0].items[0]).toMatch(/\(p\. 1\)$/);
    expect(data.title).toBe('Photosynthesis notes — Revision Notes');
    expect(usage?.costUsd).toBeGreaterThan(0);
  });

  it('flashcards: a card whose quote does not give its answer is dropped', async () => {
    mockGenerate.mockResolvedValue({
      reply: JSON.stringify({ cards: [
        { passage: 'P1', front: 'Where does the dark reaction occur?', back: 'stroma', evidence: quote2 },
        { passage: 'P1', front: 'Where does the light reaction occur?', back: 'mitochondria', evidence: quote2 },
      ] }),
      usage: { promptTokens: 800, completionTokens: 150 },
    });
    const { data } = await run('write_document_flashcards', { document: REF, count: 5 });
    expect(data.cards).toEqual([{ front: 'Where does the dark reaction occur?', back: 'stroma', kind: 'definition', note: 'p. 2 of your document' }]);
    expect(data.stats.rejected).toEqual({ answer_not_supported: 1 });
  });

  it('quiz: only questions the document backs and the independent solver agrees with', async () => {
    mockGenerate
      .mockResolvedValueOnce({
        reply: JSON.stringify({ questions: [
          { passage: 'P1', question: 'Where does the light reaction of photosynthesis occur?', options: ['Grana', 'Stroma', 'Cytoplasm', 'Nucleus'], correctIndex: 0, explanation: 'Grana hold the thylakoids.', evidence: quote2 },
          { passage: 'P1', question: 'Where does the dark reaction of photosynthesis occur?', options: ['Grana', 'Stroma', 'Cytoplasm', 'Nucleus'], correctIndex: 1, explanation: '', evidence: quote2 },
        ] }),
        usage: { promptTokens: 900, completionTokens: 300 },
      })
      // The solver agrees with the first and not the second.
      .mockResolvedValueOnce({ reply: JSON.stringify({ answers: [{ id: 'q1', answer: 'A' }, { id: 'q2', answer: 'NONE' }] }), usage: { promptTokens: 200, completionTokens: 10 } });
    const { data } = await run('write_document_quiz', { document: REF, count: 5 });
    expect(data.questions).toHaveLength(1);
    expect(data.questions[0]).toMatchObject({ correctAnswerIndex: 0, questionOrigin: 'CURRICULUM_SYNTHESIZED', explanation: expect.stringMatching(/Your document says: “The light reaction occurs.*” \(p\. 2\)/) });
    expect(data.validation).toEqual({ checked: 2, accepted: 1, rejected: { not_settled_by_evidence: 1 } });
  });
});

describe('documentSections', () => {
  it('works from the opening part of a long document and says so', () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ pageNumber: i + 1, text: `Page ${i + 1}. ${'Plant cells contain chloroplasts and a cell wall. '.repeat(40)}` }));
    const { sections, truncated } = documentSections(long);
    expect(truncated).toBe(true);
    expect(sections.reduce((n, s) => n + s.text.length, 0)).toBeLessThanOrEqual(30_000 + 4_000);
  });
});
