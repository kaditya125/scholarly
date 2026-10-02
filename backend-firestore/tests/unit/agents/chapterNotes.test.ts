/**
 * Phase 6 — revision notes for an NCERT chapter: written from the chapter's own text, under its own
 * section headings, every point kept only when the chapter sentence stating it is really there.
 */
const mockPages = jest.fn();
const mockGenerate = jest.fn();
jest.mock('../../../src/agents/tools/adapters/chapterText', () => {
  const actual = jest.requireActual('../../../src/agents/tools/adapters/chapterText');
  return { ...actual, loadChapterPages: (...a: any[]) => mockPages(...a) };
});
jest.mock('../../../src/services/ai/gemini.provider', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({ generateResponse: (...a: any[]) => mockGenerate(...a) })),
}));

import { registerChapterNotesTools, withinBudget } from '../../../src/agents/tools/adapters/chapterNotes.adapter';
import { registerCurriculumTools } from '../../../src/agents/tools/adapters/curriculum.adapter';
import { registerArtifactTools } from '../../../src/agents/tools/adapters/artifact.adapter';
import { ChapterTextError } from '../../../src/agents/tools/adapters/chapterText';
import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';
import { chapterNotesWorkflow } from '../../../src/agents/workflows/chapterNotes.workflow';
import { createDefaultWorkflowRegistry } from '../../../src/agents/workflows';
import { validatePlan } from '../../../src/agents/runtime/PlanValidator';
import { resolveBudget } from '../../../src/agents/runtime/AgentPolicy';
import { routeGoal } from '../../../src/agents/runtime/GoalRouter';
import { StepState } from '../../../src/agents/runtime/agent.types';

const ctx = { userId: 'student-1', runId: 'run-1', stepId: 'notes', signal: new AbortController().signal };
const PAGES = [
  { pageNumber: 1, text: 'CHAPTER FIVE LAWS OF MOTION 5.1 Introduction 5.2 Aristotle’s Fallacy' },
  {
    pageNumber: 2,
    text: '5.2 ARISTOTLE’S FALLACY Aristotle held the view that if a body is moving, something external is required to keep it moving. According to this view, an arrow shot from a bow keeps flying since the air behind the arrow keeps pushing it.',
  },
  {
    pageNumber: 3,
    text: '5.3 THE LAW OF INERTIA Galileo studied motion of objects on an inclined plane. The state of rest or uniform linear motion both imply zero acceleration. Galileo arrived at the conclusion that the property of the body to resist a change in its state of motion is inertia.',
  },
];
const HEADINGS = ['5.2 Aristotle’s Fallacy', '5.3 The Law of Inertia'];
const input = { notebookId: 'ncert-c11-physics-1', sourceId: 's5', chapterName: 'Laws of Motion', bookTitle: 'NCERT Physics Part I, Class 11', headings: HEADINGS };

const run = async (over: Record<string, any> = {}) => {
  const tool = registerChapterNotesTools(new ToolRegistry()).get('write_chapter_revision_notes')!;
  const result = await tool.execute(tool.inputSchema.parse({ ...input, ...over }), ctx);
  tool.outputSchema.parse(result.data);
  return result;
};
const reply = (notes: any[]) => ({ reply: JSON.stringify({ notes }), usage: { promptTokens: 1000, completionTokens: 200 } });

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
  mockPages.mockResolvedValue({ notebookId: input.notebookId, sourceId: input.sourceId, pages: PAGES, chars: 600 });
});

describe('write_chapter_revision_notes', () => {
  it('keeps only points the chapter states, under the chapter’s own headings, with pages', async () => {
    mockGenerate.mockResolvedValue(
      reply([
        {
          passage: 'P1',
          heading: 'Aristotle',
          points: [
            { point: 'Aristotle held that something external is required to keep a moving body moving.', evidence: 'Aristotle held the view that if a body is moving, something external is required to keep it moving.' },
            // Not in the chapter at all.
            { point: 'Aristotle proved that heavy objects fall faster than light ones.', evidence: 'Aristotle proved that heavier objects fall faster.' },
          ],
        },
        {
          passage: 'P2',
          heading: 'Inertia',
          points: [
            { point: 'Inertia is the property of a body to resist a change in its state of motion.', evidence: 'the property of the body to resist a change in its state of motion is inertia' },
            // A repeat of the point above.
            { point: 'Inertia is the property of a body to resist a change in its state of motion.', evidence: 'the property of the body to resist a change in its state of motion is inertia' },
            // Quoted sentence is real but says something else.
            { point: 'Galileo showed that friction is the cause of all motion on inclined planes.', evidence: 'Galileo studied motion of objects on an inclined plane.' },
          ],
        },
      ]),
    );
    const { data, usage } = await run();
    expect(mockPages).toHaveBeenCalledWith('ncert-c11-physics-1', 's5');
    expect(data.title).toBe('Laws of Motion — Revision Notes');
    expect(data.subtitle).toBe('NCERT Physics Part I, Class 11');
    expect(data.sections.map((s: any) => s.heading)).toEqual(['5.2 Aristotle’s Fallacy', '5.3 The Law of Inertia']);
    expect(data.sections[0].blocks[0].items).toEqual(['Aristotle held that something external is required to keep a moving body moving. (p. 2)']);
    expect(data.sections[1].blocks[0].items).toEqual(['Inertia is the property of a body to resist a change in its state of motion. (p. 3)']);
    expect(data.stats).toEqual({ checked: 5, kept: 2, rejected: { evidence_not_in_source: 1, claim_not_supported: 1 } });
    expect(data.kept).toEqual([
      expect.objectContaining({ page: 2, section: '5.2 Aristotle’s Fallacy', evidence: expect.stringContaining('something external is required') }),
      expect.objectContaining({ page: 3, section: '5.3 The Law of Inertia' }),
    ]);
    expect(data.truncated).toBe(false);
    expect(data.sourceNote).toBe('Every point here is stated in the chapter, on the page of the chapter PDF given in brackets.');
    expect(usage).toEqual({ tokens: 1200, costUsd: expect.any(Number) });
    // The writer is told what the passages are.
    expect(mockGenerate.mock.calls[0][1]).toMatch(/passages of an NCERT textbook chapter/);
  });

  it('gives nothing rather than unverified notes', async () => {
    mockGenerate.mockResolvedValue(reply([{ passage: 'P1', heading: 'x', points: [{ point: 'Something the chapter never says at all.', evidence: 'Not in the chapter.' }] }]));
    await expect(run()).rejects.toThrow(/nothing verified/);
  });

  it('refuses a source that is not a curriculum chapter', async () => {
    mockPages.mockRejectedValue(new ChapterTextError('NOT_CURRICULUM', 'That is not a curriculum chapter.'));
    await expect(run()).rejects.toMatchObject({ failureClass: 'permission' });
  });

  it('covers a long chapter up to a section, and says which', () => {
    const big = (id: string, n: number) => ({ id, heading: `Section ${id}`, text: 'x'.repeat(n), pages: [1] });
    const { sections, truncated } = withinBudget([big('a', 30_000), big('b', 25_000), big('c', 20_000)]);
    expect(sections.map((s) => s.id)).toEqual(['a', 'b']);
    expect(truncated).toBe(true);
  });
});

describe('chapter_revision_notes workflow', () => {
  const steps = (status: Record<string, StepState['status']> = {}) =>
    new Map<string, StepState>(['resolve_chapter', 'notes', 'render'].map((id) => [id, { id, label: id, tool: id, status: status[id] ?? 'completed', attempts: 1 } as StepState]));

  it('plans resolve → write → render against the real tools, and is registered', () => {
    const plan = chapterNotesWorkflow.buildPlan('Make revision notes on Laws of Motion, Class 11 Physics');
    const registry = registerChapterNotesTools(registerArtifactTools(registerCurriculumTools(new ToolRegistry())));
    expect(validatePlan(plan, registry, resolveBudget(chapterNotesWorkflow.budget))).toMatchObject({ ok: true });
    expect(plan.steps.map((s) => s.tool)).toEqual(['resolve_curriculum_chapter', 'write_chapter_revision_notes', 'create_document_artifact']);
    expect(createDefaultWorkflowRegistry().ids()).toContain('chapter_revision_notes');
  });

  it('asks which chapter rather than guessing', () => {
    const r = chapterNotesWorkflow.evaluate({
      goal: 'g',
      steps: steps({ notes: 'skipped', render: 'skipped' }),
      outputs: new Map([['resolve_chapter', { resolved: false, alternatives: [{ chapterName: 'Laws of Motion' }, { chapterName: 'Motion in a Plane' }] }]]),
    } as any);
    expect(r.outcome).toBe('no_result');
    expect(r.summary).toMatch(/couldn't pin down which chapter/);
    expect(r.summary).toMatch(/Laws of Motion/);
  });

  it('reports what it kept, what it left out and why', () => {
    const outputs = new Map<string, unknown>([
      ['resolve_chapter', { resolved: true, chapterName: 'Laws of Motion', bookTitle: 'NCERT Physics Part I, Class 11' }],
      ['notes', { title: 'Laws of Motion — Revision Notes', sections: [{ heading: '5.2' }, { heading: '5.3' }], stats: { checked: 30, kept: 24, rejected: { evidence_not_in_source: 4, claim_not_supported: 2 } } }],
      ['render', { artifactId: 'a1', pageCount: 3 }],
    ]);
    const r = chapterNotesWorkflow.evaluate({ goal: 'g', steps: steps(), outputs } as any);
    expect(r.outcome).toBe('success');
    expect(r.summary).toContain('## Laws of Motion — Revision Notes\n\n24 points under 2 of the chapter\'s sections, from NCERT Physics Part I, Class 11 — a 3-page PDF.');
    expect(r.summary).toContain('Left out: 4 because their quoted sentence is not in the chapter; 2 because the quoted sentence does not say what the point claims.');
  });

  it('is honest when writing or saving fails', () => {
    const resolved = ['resolve_chapter', { resolved: true, chapterName: 'Laws of Motion', bookTitle: 'NCERT Physics Part I, Class 11' }] as [string, unknown];
    const noNotes = chapterNotesWorkflow.evaluate({ goal: 'g', steps: steps({ notes: 'failed', render: 'skipped' }), outputs: new Map([resolved]) } as any);
    expect(noNotes.outcome).toBe('no_result');
    const noPdf = chapterNotesWorkflow.evaluate({ goal: 'g', steps: steps({ render: 'failed' }), outputs: new Map([resolved, ['notes', { title: 't', sections: [], stats: { kept: 3 } }]]) } as any);
    expect(noPdf.outcome).toBe('partial');
  });
});

describe('routing notes requests', () => {
  it.each(['Make revision notes on Laws of Motion, Class 11 Physics', 'Give me short notes of chapter 5 class 11 physics', 'I need notes on photosynthesis'])(
    'sends chapter notes to chapter_revision_notes: %s',
    (msg) => {
      expect(routeGoal(msg)).toMatchObject({ mode: 'agent', workflowId: 'chapter_revision_notes' });
    },
  );

  it('leaves syllabus-wide notes, notes from something they have, and their own documents alone', () => {
    expect(routeGoal('Create revision notes for the SSC CGL syllabus').workflowId).toBeUndefined();
    expect(routeGoal('Make notes from this chat').workflowId).not.toBe('chapter_revision_notes');
    expect(routeGoal('Make revision notes from my uploaded PDF')).toMatchObject({ workflowId: 'document_study_pack' });
    expect(routeGoal('Revise my notes').workflowId).toBeUndefined();
  });
});
