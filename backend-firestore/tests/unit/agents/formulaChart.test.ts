/**
 * The flagship formula chart and its follow-up flashcards: what goes into the chart (verified
 * material only, cited), how the plans validate against the REAL tool schemas, and that the
 * flashcards reuse the chart rather than rebuilding it.
 */
const mockPages = jest.fn();
jest.mock('../../../src/agents/tools/adapters/chapterText', () => {
  const actual = jest.requireActual('../../../src/agents/tools/adapters/chapterText');
  return { ...actual, loadChapterPages: (...a: any[]) => mockPages(...a) };
});

import { composeFormulaChart, registerFormulaChartTools } from '../../../src/agents/tools/adapters/formulaChart.adapter';
import { composeFlashcards, registerFlashcardTools } from '../../../src/agents/tools/adapters/flashcards.adapter';
import { registerCurriculumTools } from '../../../src/agents/tools/adapters/curriculum.adapter';
import { registerArtifactTools } from '../../../src/agents/tools/adapters/artifact.adapter';
import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';
import { ChapterTextError } from '../../../src/agents/tools/adapters/chapterText';
import { buildChapterIndex, buildGlossary, symbolsOf } from '../../../src/agents/tools/adapters/formulaVerify';
import { documentSpecSchema, flashcardsSpecSchema } from '../../../src/agents/artifacts/artifact.types';
import { formulaChartWorkflow } from '../../../src/agents/workflows/formulaChart.workflow';
import { flashcardsFromArtifactWorkflow } from '../../../src/agents/workflows/flashcardsFromArtifact.workflow';
import { validatePlan } from '../../../src/agents/runtime/PlanValidator';
import { resolveBudget } from '../../../src/agents/runtime/AgentPolicy';
import { StepState } from '../../../src/agents/runtime/agent.types';

const CHAPTER = {
  resolved: true,
  notebookId: 'ncert-c11-physics',
  sourceId: 's4',
  bookTitle: 'NCERT Class 11 Physics',
  chapterName: 'Laws of Motion',
  chapterTitle: 'NCERT Class 11 Physics (Part 1) - Chapter 4',
  headings: ['4.1 INTRODUCTION', '4.2 ARISTOTLE’S FALLACY', '4.5 Newton’s second law of motion', '4.9 Common forces in mechanics', 'Summary'],
};
const VERIFICATION = {
  verified: [
    { formula: 'F = ma', meaning: 'Force equals mass times acceleration', sources: ['study_notes'], status: 'verified', match: 'exact', section: '4.5 Newton’s second law of motion', page: 7 },
    { formula: 'f_c = mv^2/R', meaning: 'Centripetal force', sources: ['study_notes', 'knowledge_graph'], equation: '4.16', status: 'verified', match: 'equation', section: '4.10 Circular motion', page: 15 },
    { formula: 'f_s <= μ_s N', sources: ['knowledge_graph'], status: 'verified', match: 'exact', section: '4.9 Common forces in mechanics', page: 12 },
  ],
  rejected: [{ formula: 'F_x = dp_x/dt = ma_x', sources: ['study_notes'], status: 'not_found' }],
  definitions: [
    { term: 'Newton’s first law of motion', definition: 'Every body continues to be in its state of rest…', section: '4.4 NEWTON’S FIRST LAW OF MOTION', page: 3 },
    { term: 'inertia', definition: 'Inertia means ‘resistance to change’.', page: 3 },
  ],
  glossary: [{ symbol: 'F', name: 'Force', unit: 'newton (N)' }],
};
const NOTES = {
  assets: [
    { type: 'COMMON_MISTAKES', content: { mistakes: ['Confusing action-reaction pairs with balanced forces.', 'Thinking F = ma is a separate force.'] } },
    { type: 'EXAM_TIPS', content: { tips: ['Draw a free-body diagram first.'] } },
    { type: 'HIGH_YIELD_FACTS', content: { facts: ['fk = μkN for kinetic friction.', 'Action and reaction act on different bodies.'] } },
  ],
};

describe('composeFormulaChart', () => {
  const chart = composeFormulaChart({ chapter: CHAPTER, verification: VERIFICATION, notes: NOTES });
  const headings = chart.sections.map((s) => s.heading);

  it('is a document the renderer accepts, titled for the chapter', () => {
    expect(() => documentSpecSchema.parse(chart)).not.toThrow();
    expect(chart.title).toBe('Laws of Motion — Formula Chart');
    expect(chart.sourceNote).toMatch(/found in the text of the chapter's NCERT PDF/);
  });

  it('follows the brief’s structure: overview, laws, definitions, formulae, symbols, limits, notes', () => {
    expect(headings).toEqual([
      'Chapter overview',
      'Core laws',
      'Definitions',
      'Formulae: Newton’s second law of motion',
      'Formulae: Circular motion',
      'Symbols and SI units',
      'Limits and special cases',
      'Common mistakes (study notes)',
      'Quick tips (study notes)',
      'Exam relevance (study notes)',
    ]);
  });

  it('cites every formula to where it was found', () => {
    const formulae = chart.sections.flatMap((s) => s.blocks).filter((b: any) => b.type === 'formulae').flatMap((b: any) => b.items);
    expect(formulae.map((f: any) => f.formula)).toEqual(['F = ma', 'f_c = mv^2/R', 'f_s <= μ_s N']);
    expect(formulae[0].note).toBe('§4.5 Newton’s second law of motion · p. 7 of the chapter PDF');
    expect(formulae[1].note).toMatch(/^Eq\. \(4\.16\) · §4\.10 Circular motion · p\. 15/);
  });

  it('never lets an unverified formula in, not even through the study notes', () => {
    const text = JSON.stringify(chart);
    expect(text).not.toContain('dp_x/dt'); // rejected candidate
    expect(text).not.toContain('Thinking F = ma'); // a note carrying a formula
    expect(text).not.toContain('fk = μkN');
    expect(text).toContain('Draw a free-body diagram first.');
  });

  it('refuses to produce a chart with nothing verified in it', () => {
    expect(() => composeFormulaChart({ chapter: CHAPTER, verification: { ...VERIFICATION, verified: [] }, notes: NOTES })).toThrow(/nothing verified/);
    expect(() => composeFormulaChart({ chapter: { resolved: false }, verification: VERIFICATION, notes: NOTES })).toThrow(/not identified/);
  });
});

describe('glossary', () => {
  it('reads symbols, not words or subscripts', () => {
    expect([...symbolsOf('F = ma')].sort()).toEqual(['F', 'a', 'm']);
    expect(symbolsOf('Impulse = Force × time duration').has('g')).toBe(false);
    expect([...symbolsOf('f_s <= μ_s N')].sort()).toEqual(['N', 'friction', 'μ'].sort());
    expect(symbolsOf('f_c = mv^2/R').has('centripetal')).toBe(true);
    expect(symbolsOf('1 N = 1 kg m s^-2').size).toBe(0);
  });

  it('lists a meaning only when the chapter attests it — p is not momentum in a chapter without momentum', () => {
    const mechanics = buildChapterIndex([{ pageNumber: 1, text: 'The momentum of a body. Mass and velocity.' }]);
    const thermo = buildChapterIndex([{ pageNumber: 1, text: 'The pressure of a gas. Mass and velocity.' }]);
    expect(buildGlossary(['p = mv'], mechanics).map((g) => g.symbol)).toEqual(['m', 'p', 'v']);
    expect(buildGlossary(['p = mv'], thermo).map((g) => g.symbol)).toEqual(['m', 'v']);
  });
});

describe('verify_formulae_against_chapter', () => {
  const registry = () => registerFormulaChartTools(new ToolRegistry());
  const ctx: any = { userId: 'u1', runId: 'r', stepId: 's', signal: new AbortController().signal };

  it('verifies against the loaded chapter and drops definitions from a “fallacy” section', async () => {
    mockPages.mockResolvedValue({
      notebookId: 'n',
      sourceId: 's',
      chars: 999,
      pages: [
        { pageNumber: 2, text: '4.2 ARISTOTLE’S FALLACY\nAn external force is required to keep a body in motion, said Aristotle.' },
        { pageNumber: 7, text: '4.5 NEWTON’S SECOND LAW OF MOTION\nF = ma. The momentum of a body is its mass times its velocity.' },
      ],
    });
    const tool = registry().get('verify_formulae_against_chapter')!;
    const { data } = await tool.execute(
      tool.inputSchema.parse({
        notebookId: 'n',
        sourceId: 's',
        headings: ['4.2 ARISTOTLE’S FALLACY', '4.5 Newton’s second law of motion'],
        definitions: [{ term: 'Aristotelian law of motion', definition: 'An external force is required to keep a body in motion, said Aristotle.' }],
        candidates: [
          { formula: 'F = ma', sources: ['study_notes'] },
          { formula: 'E = mc^2', sources: ['study_notes'] },
        ],
      }),
      ctx,
    );
    tool.outputSchema.parse(data);
    expect(data.verified.map((v: any) => v.formula)).toEqual(['F = ma']);
    expect(data.rejected.map((v: any) => v.formula)).toEqual(['E = mc^2']);
    expect(data.definitions).toEqual([]); // what the chapter disproves is not a law to learn
  });

  it('reports a non-curriculum notebook as a permission failure', async () => {
    mockPages.mockRejectedValue(new ChapterTextError('NOT_CURRICULUM', 'nope'));
    const tool = registry().get('verify_formulae_against_chapter')!;
    await expect(tool.execute({ notebookId: 'x', sourceId: 's', headings: [], definitions: [], candidates: [] }, ctx)).rejects.toMatchObject({ failureClass: 'permission' });
  });
});

describe('composeFlashcards — reusing the chart', () => {
  const chart = composeFormulaChart({ chapter: CHAPTER, verification: VERIFICATION, notes: NOTES });
  const deck = composeFlashcards({ artifactId: 'chart-1', title: chart.title, spec: chart });

  it('makes a valid deck linked to the chart it came from', () => {
    expect(() => flashcardsSpecSchema.parse(deck)).not.toThrow();
    expect(deck.sourceArtifactId).toBe('chart-1');
    expect(deck.title).toBe('Laws of Motion — Formula Chart — Flashcards');
  });

  it('asks the meaning and answers with the verified formula, keeping its citation', () => {
    const card = deck.cards.find((c) => c.back === 'F = ma')!;
    expect(card).toMatchObject({ kind: 'formula', front: 'Which formula says: Force equals mass times acceleration?' });
    expect(card.note).toMatch(/p\. 7/);
  });

  it('uses a cloze when the formula has no meaning', () => {
    expect(deck.cards.find((c) => c.back === 'f_s <= μ_s N')).toMatchObject({ front: 'Complete: f_s = ?' });
  });

  it('adds cards for laws, definitions and symbols, and nothing from the study notes', () => {
    const kinds = deck.cards.map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(['formula', 'definition', 'symbol']));
    expect(JSON.stringify(deck)).not.toContain('free-body');
  });
});

describe('the flagship plans validate against the real tools', () => {
  const realRegistry = () =>
    registerFlashcardTools(registerFormulaChartTools(registerArtifactTools(registerCurriculumTools(new ToolRegistry()))));

  beforeEach(() => {
    process.env.AGENT_MODE_ENABLED = 'true';
    process.env.AGENT_ARTIFACTS_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.AGENT_MODE_ENABLED;
    delete process.env.AGENT_ARTIFACTS_ENABLED;
  });

  it('formula_chart: seven real steps, in dependency order', () => {
    const plan = formulaChartWorkflow.buildPlan('Prepare a formula chart for Class 11 Physics Laws of Motion.');
    const result = validatePlan(plan, realRegistry(), resolveBudget(formulaChartWorkflow.budget));
    expect(result.errors).toEqual([]);
    expect(result.order).toEqual(['resolve_chapter', 'graph', 'notes', 'extract', 'verify', 'compose', 'render']);
  });

  it('flashcards_from_artifact: three steps, none of them retrieval', () => {
    const plan = flashcardsFromArtifactWorkflow.buildPlan('Create flashcards from this formula chart.');
    const result = validatePlan(plan, realRegistry(), resolveBudget(flashcardsFromArtifactWorkflow.budget));
    expect(result.errors).toEqual([]);
    expect(plan.steps.map((s) => s.tool)).toEqual(['find_my_latest_document', 'compose_flashcards_from_document', 'create_flashcards_artifact']);
    expect(plan.steps[0].input).toEqual({ titleContains: 'Formula Chart' });
  });

  it('flashcards_from_artifact says so when there is nothing to reuse', () => {
    const plan = flashcardsFromArtifactWorkflow.buildPlan('Create flashcards from this formula chart.');
    const steps = new Map<string, StepState>(
      ['find_document', 'compose', 'save'].map((id, i) => [id, { id, label: id, tool: 't', status: i === 0 ? 'completed' : 'skipped', attempts: 1 } as StepState]),
    );
    const r = flashcardsFromArtifactWorkflow.evaluate({ goal: 'g', plan, steps, outputs: new Map([['find_document', { found: false }]]) });
    expect(r.outcome).toBe('no_result');
    expect(r.summary).toMatch(/couldn't find a formula chart of yours/);
  });
});
