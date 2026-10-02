/**
 * The chapter handout: its composer (deterministic, no model), its plan (validated against the
 * REAL tool schemas, not fakes), and what it tells the student.
 */
import { cleanHeadings, composeChapterHandout, conceptName, displayCase, looksLikeFormula } from '../../../src/agents/tools/adapters/compose.adapter';
import { chapterHandoutWorkflow } from '../../../src/agents/workflows/chapterHandout.workflow';
import { validatePlan } from '../../../src/agents/runtime/PlanValidator';
import { resolveBudget } from '../../../src/agents/runtime/AgentPolicy';
import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';
import { registerCurriculumTools } from '../../../src/agents/tools/adapters/curriculum.adapter';
import { registerComposeTools } from '../../../src/agents/tools/adapters/compose.adapter';
import { registerArtifactTools } from '../../../src/agents/tools/adapters/artifact.adapter';
import { documentSpecSchema } from '../../../src/agents/artifacts/artifact.types';
import { StepState } from '../../../src/agents/runtime/agent.types';

const RESOLVED = {
  resolved: true,
  notebookId: 'ncert-c11-physics',
  sourceId: 's4',
  bookTitle: 'NCERT Class 11 Physics',
  chapterName: 'Laws of Motion',
  chapterTitle: 'NCERT Class 11 Physics (Part 1) - Chapter 4',
  headings: ['4.1 INTRODUCTION', '4.3 THE LAW OF INERTIA', '4.4 NEWTON’S FIRST LAW OF MOTION', '4.4 Newton’s first law of motion', 'Summary', 'Exercises'],
};
const GRAPH = {
  nodes: [
    { label: "Newton's First Law of Motion: 'Everybody continues to be in its state of rest'", type: 'CONCEPT' },
    { label: 'Inertia', type: 'CONCEPT' },
    { label: 'inertia', type: 'CONCEPT' },
    { label: 'F (t ) = ma', type: 'FORMULA' },
  ],
  relationships: [{ from: 'Inertia', to: 'Mass', type: 'RELATED_TO' }],
};
const ASSETS = { types: ['KEY_FORMULAE', 'FLASHCARDS', 'SOMETHING_NEW'] };

describe('compose helpers', () => {
  it('title-cases shouted headings but leaves written case alone', () => {
    expect(displayCase('WORK, ENERGY AND POWER')).toBe('Work, Energy and Power');
    expect(displayCase('Laws of Motion')).toBe('Laws of Motion');
  });

  it('strips numbering, drops chapter furniture and duplicates', () => {
    expect(cleanHeadings(RESOLVED.headings)).toEqual(['The Law of Inertia', 'Newton’s First Law of Motion']);
  });

  it('shortens sentence-length concept labels to their name, capitalised', () => {
    expect(conceptName(GRAPH.nodes[0].label)).toBe("Newton's First Law of Motion");
    expect(conceptName('impulse')).toBe('Impulse');
  });

  it('recognises formulae and worked calculations, and nothing else', () => {
    for (const f of ['F = ma', 'Change in momentum = 0.15 × 12 – (–0.15 × 12) = 3.6 N s', 'v^2', 'p ∝ v', '2 x 3', 'a ≈ g']) {
      expect(looksLikeFormula(f)).toBe(true);
    }
    for (const t of ['Newton’s second law of motion', 'Work-energy theorem', 'Centripetal force (fc)', 'Motion in a Straight Line', '2D motion']) {
      expect(looksLikeFormula(t)).toBe(false);
    }
  });
});

describe('composeChapterHandout on the real Laws of Motion graph shape', () => {
  // Captured from the production graph for NCERT Class 11 Physics Chapter 4.
  const real = composeChapterHandout({
    chapter: RESOLVED,
    graph: {
      nodes: [
        { label: 'Change in momentum = 0.15 × 12 – (–0.15 × 12) = 3.6 N s', type: 'CONCEPT' },
        { label: 'impulse', type: 'CONCEPT' },
        { label: 'Inertia', type: 'CONCEPT' },
      ],
      relationships: [
        { from: 'Inertia', to: 'Newton’s first law of motion' },
        { from: 'Newton’s first law of motion', to: 'Inertia' },
        { from: 'Change in momentum = 0.15 × 12 – (–0.15 × 12) = 3.6 N s', to: 'impulse' },
      ],
    },
    assets: ASSETS,
  });
  const byHeading = Object.fromEntries(real.sections.map((s) => [s.heading, (s.blocks[0] as any).items]));

  it('keeps a worked calculation out even when the graph files it as a concept', () => {
    expect(JSON.stringify(real)).not.toMatch(/3\.6 N s/);
    expect(byHeading['Key concepts']).toEqual(['Impulse', 'Inertia']);
  });

  it('lists a relationship once, whichever way the graph stored it', () => {
    expect(byHeading['How the ideas connect']).toEqual(['Inertia — Newton’s first law of motion']);
  });
});

describe('composeChapterHandout', () => {
  const spec = composeChapterHandout({ chapter: RESOLVED, graph: GRAPH, assets: ASSETS });

  it('produces a document the renderer accepts', () => {
    expect(() => documentSpecSchema.parse(spec)).not.toThrow();
    expect(spec.title).toBe('Laws of Motion');
    expect(spec.subtitle).toBe('NCERT Class 11 Physics');
    expect(spec.sourceNote).toMatch(/NCERT corpus/);
  });

  it('builds its sections only from the chapter’s own material', () => {
    const byHeading = Object.fromEntries(spec.sections.map((s) => [s.heading, (s.blocks[0] as any).items ?? (s.blocks[0] as any).text]));
    expect(byHeading['What this chapter covers']).toEqual(['The Law of Inertia', 'Newton’s First Law of Motion']);
    expect(byHeading['Key concepts']).toEqual(["Newton's First Law of Motion", 'Inertia']); // de-duplicated
    expect(byHeading['How the ideas connect']).toEqual(['Inertia — Mass']);
    expect(byHeading['Also on Sadhya for this chapter']).toBe('Key formulae · Flashcards · Something new.');
  });

  it('leaves formulae out — they have not been checked against the textbook', () => {
    expect(JSON.stringify(spec)).not.toContain('F (t ) = ma');
    expect(spec.sections.some((s) => s.blocks.some((b) => b.type === 'formulae'))).toBe(false);
  });

  it('refuses to compose for a chapter that was not identified', () => {
    expect(() => composeChapterHandout({ chapter: { resolved: false }, graph: GRAPH, assets: ASSETS })).toThrow(/not identified/);
  });

  it('refuses rather than printing an empty handout', () => {
    expect(() =>
      composeChapterHandout({ chapter: { ...RESOLVED, headings: [] }, graph: { nodes: [], relationships: [] }, assets: { types: [] } }),
    ).toThrow(/too little/);
  });
});

describe('chapter handout plan', () => {
  const plan = chapterHandoutWorkflow.buildPlan('Make a PDF on Laws of Motion, Class 11 Physics');

  it('resolves, gathers in parallel, composes, then renders', () => {
    expect(plan.steps.map((s) => [s.id, s.tool])).toEqual([
      ['resolve_chapter', 'resolve_curriculum_chapter'],
      ['graph', 'get_chapter_knowledge_graph'],
      ['assets', 'get_chapter_assets'],
      ['compose', 'compose_chapter_handout'],
      ['render', 'create_document_artifact'],
    ]);
    expect(plan.steps[3].dependsOn).toEqual(['resolve_chapter', 'graph', 'assets']);
  });

  it('passes the real plan validator against the real tool schemas', () => {
    process.env.AGENT_MODE_ENABLED = 'true';
    process.env.AGENT_ARTIFACTS_ENABLED = 'true';
    try {
      const registry = registerComposeTools(registerArtifactTools(registerCurriculumTools(new ToolRegistry())));
      const result = validatePlan(plan, registry, resolveBudget(chapterHandoutWorkflow.budget));
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.order).toEqual(['resolve_chapter', 'graph', 'assets', 'compose', 'render']);
    } finally {
      delete process.env.AGENT_MODE_ENABLED;
      delete process.env.AGENT_ARTIFACTS_ENABLED;
    }
  });

  it('cannot be planned while artifacts are switched off (the render tool is invisible)', () => {
    process.env.AGENT_MODE_ENABLED = 'true';
    try {
      const registry = registerComposeTools(registerArtifactTools(registerCurriculumTools(new ToolRegistry())));
      const result = validatePlan(plan, registry, resolveBudget(chapterHandoutWorkflow.budget));
      expect(result.ok).toBe(false);
      expect(result.errors.join(' ')).toMatch(/create_document_artifact/);
    } finally {
      delete process.env.AGENT_MODE_ENABLED;
    }
  });
});

describe('chapter handout result', () => {
  const plan = chapterHandoutWorkflow.buildPlan('g');
  const states = (status: Record<string, StepState['status']>) =>
    new Map(Object.entries(status).map(([id, s]) => [id, { id, label: id, tool: 't', status: s, attempts: 1 } as StepState]));

  it('reports the PDF when it was made', () => {
    const r = chapterHandoutWorkflow.evaluate({
      goal: 'g',
      plan,
      steps: states({ resolve_chapter: 'completed', graph: 'completed', assets: 'completed', compose: 'completed', render: 'completed' }),
      outputs: new Map<string, unknown>([
        ['resolve_chapter', RESOLVED],
        ['compose', composeChapterHandout({ chapter: RESOLVED, graph: GRAPH, assets: ASSETS })],
        ['render', { artifactId: 'art-1', pageCount: 2 }],
      ]),
    });
    expect(r.outcome).toBe('success');
    expect(r.summary).toMatch(/handout ready/);
    expect(r.summary).toMatch(/2-page PDF from NCERT Class 11 Physics/);
    expect(r.summary).toMatch(/Formulae are left out/);
    expect((r.data as any).artifactId).toBe('art-1');
  });

  it('asks which chapter instead of rendering a guess', () => {
    const r = chapterHandoutWorkflow.evaluate({
      goal: 'g',
      plan,
      steps: states({ resolve_chapter: 'completed', graph: 'skipped', assets: 'skipped', compose: 'skipped', render: 'skipped' }),
      outputs: new Map<string, unknown>([['resolve_chapter', { resolved: false, alternatives: [{ chapterName: 'Waves' }, { chapterName: 'Oscillations' }] }]]),
    });
    expect(r.outcome).toBe('no_result');
    expect(r.summary).toMatch(/Waves, Oscillations/);
  });

  it('says what went wrong when the chapter was found but the PDF was not made', () => {
    const steps = states({ resolve_chapter: 'completed', graph: 'completed', assets: 'completed', compose: 'completed', render: 'failed' });
    steps.get('render')!.error = { class: 'permission', message: 'you have used all your document generations' };
    const r = chapterHandoutWorkflow.evaluate({
      goal: 'g',
      plan,
      steps,
      outputs: new Map<string, unknown>([['resolve_chapter', RESOLVED]]),
    });
    expect(r.outcome).toBe('partial');
    expect(r.summary).toMatch(/couldn't finish the handout/);
    expect(r.summary).toMatch(/used all your document generations/);
  });
});
