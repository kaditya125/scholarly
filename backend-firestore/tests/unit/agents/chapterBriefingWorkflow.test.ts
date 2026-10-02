import { chapterBriefingWorkflow } from '../../../src/agents/workflows/chapterBriefing.workflow';
import { StepState } from '../../../src/agents/runtime/agent.types';

const LABELS: Record<string, string> = {
  resolve_chapter: 'Finding the chapter',
  graph: 'Reading the chapter’s concept graph',
  assets: 'Checking existing study material',
};

function states(status: Record<string, StepState['status']>): Map<string, StepState> {
  return new Map(
    Object.entries(status).map(([id, s]) => [id, { id, label: LABELS[id], tool: 't', status: s, attempts: 1 } as StepState]),
  );
}

const plan = chapterBriefingWorkflow.buildPlan('Laws of Motion, Class 11 Physics');

const RESOLVED = {
  resolved: true,
  needsClarification: false,
  notebookId: 'ncert-c11-physics',
  bookTitle: 'NCERT Class 11 Physics',
  sourceId: 's4',
  chapterName: 'Laws of Motion',
  chapterTitle: 'NCERT Class 11 Physics (Part 1) - Chapter 4',
  confidence: 0.95,
  headings: ['4.1 INTRODUCTION', '4.3 THE LAW OF INERTIA', '4.4 NEWTON’S FIRST LAW OF MOTION'],
  alternatives: [],
};

describe('chapter briefing workflow', () => {
  it('plans the chapter lookup first and the two reads in parallel after it', () => {
    expect(plan.steps.map((s) => s.id)).toEqual(['resolve_chapter', 'graph', 'assets']);
    expect(plan.steps[0].dependsOn).toEqual([]);
    expect(plan.steps[1].dependsOn).toEqual(['resolve_chapter']);
    expect(plan.steps[2].dependsOn).toEqual(['resolve_chapter']);
    expect(plan.steps[1].input.notebookId).toEqual({ $ref: 'resolve_chapter', path: 'notebookId' });
    expect(plan.steps[2].input.chapterTitle).toEqual({ $ref: 'resolve_chapter', path: 'chapterTitle' });
  });

  it('does not spend embedding quota: no vector retrieval step in the default plan', () => {
    expect(plan.steps.map((s) => s.tool)).not.toContain('retrieve_curriculum_context');
  });

  it('briefs the chapter from the graph and the existing assets', () => {
    const r = chapterBriefingWorkflow.evaluate({
      goal: 'Laws of Motion, Class 11 Physics',
      plan,
      steps: states({ resolve_chapter: 'completed', graph: 'completed', assets: 'completed' }),
      outputs: new Map<string, unknown>([
        ['resolve_chapter', RESOLVED],
        [
          'graph',
          {
            nodeCount: 3,
            edgeCount: 1,
            nodes: [
              { id: 'n1', label: 'Newton’s first law', type: 'CONCEPT' },
              { id: 'n2', label: 'Inertia', type: 'CONCEPT' },
              { id: 'n3', label: 'F = ma', type: 'FORMULA' },
            ],
            relationships: [{ from: 'Newton’s first law', to: 'Inertia', type: 'RELATED_TO' }],
          },
        ],
        ['assets', { assetCount: 12, types: ['KEY_FORMULAE', 'FLASHCARDS'] }],
      ]),
    });
    expect(r.outcome).toBe('success');
    expect(r.summary).toMatch(/Laws of Motion — NCERT Class 11 Physics/);
    expect(r.summary).toMatch(/95% confidence/);
    expect(r.summary).toMatch(/THE LAW OF INERTIA/);
    expect(r.summary).toMatch(/Newton’s first law/);
    expect(r.summary).toMatch(/F = ma/);
    expect(r.summary).toMatch(/12 study assets: key formulae, flashcards/);
    expect((r.data as any).chapter).toMatchObject({ sourceId: 's4', notebookId: 'ncert-c11-physics' });
  });

  it('asks which chapter was meant instead of briefing a guess', () => {
    const r = chapterBriefingWorkflow.evaluate({
      goal: 'motion, class 11 physics',
      plan,
      steps: states({ resolve_chapter: 'completed', graph: 'skipped', assets: 'skipped' }),
      outputs: new Map<string, unknown>([
        [
          'resolve_chapter',
          {
            resolved: false,
            needsClarification: true,
            reason: 'ambiguous',
            alternatives: [
              { chapterName: 'Laws of Motion', sourceId: 's4', chapterTitle: 't', score: 0.5, matchedOn: [] },
              { chapterName: 'MOTION IN A PLANE', sourceId: 's3', chapterTitle: 't', score: 0.5, matchedOn: [] },
            ],
          },
        ],
      ]),
    });
    expect(r.outcome).toBe('no_result');
    expect(r.summary).toMatch(/couldn't pin down which chapter/);
    expect(r.summary).toMatch(/Laws of Motion, MOTION IN A PLANE/);
    expect(r.summary).toMatch(/won't guess a chapter/);
    expect((r.data as any).needsClarification).toBe(true);
  });

  it('asks for a class and subject when nothing narrowed the book down', () => {
    const r = chapterBriefingWorkflow.evaluate({
      goal: 'something about waves',
      plan,
      steps: states({ resolve_chapter: 'completed', graph: 'skipped', assets: 'skipped' }),
      outputs: new Map<string, unknown>([
        [
          'resolve_chapter',
          {
            resolved: false,
            needsClarification: true,
            reason: 'need_class_and_subject',
            alternatives: [],
            candidateBooks: [{ notebookId: 'ncert-c11-physics', title: 'NCERT Class 11 Physics' }],
          },
        ],
      ]),
    });
    expect(r.summary).toMatch(/Tell me the class and subject/);
    expect(r.summary).toMatch(/NCERT Class 11 Physics/);
  });

  it('says plainly when a resolved chapter has nothing stored for it yet', () => {
    const r = chapterBriefingWorkflow.evaluate({
      goal: 'g',
      plan,
      steps: states({ resolve_chapter: 'completed', graph: 'completed', assets: 'completed' }),
      outputs: new Map<string, unknown>([
        ['resolve_chapter', RESOLVED],
        ['graph', { nodeCount: 0, edgeCount: 0, nodes: [], relationships: [] }],
        ['assets', { assetCount: 0, types: [], assets: [] }],
      ]),
    });
    expect(r.outcome).toBe('partial');
    expect(r.summary).toMatch(/has not mapped any concepts from this chapter yet/);
    expect(r.summary).toMatch(/No study material has been generated/);
  });
});
