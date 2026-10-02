/**
 * The workspace opens a document the moment it exists, so the run must say so as it happens —
 * and record it on the run for anyone who arrives after the fact.
 */
import { fakeTool, fixedWorkflow, makeRuntime, registryOf } from './helpers';

const plan = {
  successCriteria: [],
  estimatedComplexity: 'low' as const,
  requiresUserApproval: false,
  steps: [
    { id: 'look', objective: 'o', label: 'Looking', type: 'retrieve' as const, tool: 'lookup', input: { query: 'q' }, dependsOn: [] },
    { id: 'make', objective: 'o', label: 'Making the PDF', type: 'export' as const, tool: 'make_pdf', input: { query: 'q' }, dependsOn: ['look'] },
  ],
};

describe('artifact events', () => {
  it('emits agent.artifact.ready once, between the tool finishing and the step completing', async () => {
    const { runtime, store } = makeRuntime(
      registryOf(
        fakeTool('lookup', async () => ({ found: true })),
        fakeTool('make_pdf', async () => ({ artifactId: 'art-1', title: 'Laws of Motion', pageCount: 2 }), { permissions: ['write:own-artifact'] }),
      ),
      [fixedWorkflow('wf', plan)],
    );
    const run = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'wf', source: 'api' });
    await runtime.waitForRun(run.runId);

    const events = await store.listEvents(run.runId, 0);
    const ready = events.filter((e) => e.type === 'agent.artifact.ready');
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({ stepId: 'make', label: 'Laws of Motion', data: { artifactId: 'art-1', pageCount: 2 } });

    const order = events.filter((e) => e.stepId === 'make').map((e) => e.type);
    expect(order.indexOf('agent.tool.completed')).toBeLessThan(order.indexOf('agent.artifact.ready'));
    expect(order.indexOf('agent.artifact.ready')).toBeLessThan(order.indexOf('agent.step.completed'));

    const final = await store.getRun(run.runId);
    expect(final!.artifactIds).toEqual(['art-1']);
  });

  it('does not announce an existing artifact that a tool merely looked up', async () => {
    const { runtime, store } = makeRuntime(
      registryOf(
        // Reads the student's chart to build on it — returns its id, writes nothing.
        fakeTool('lookup', async () => ({ found: true, artifactId: 'old-chart', title: 'Old chart' }), { permissions: ['read:own-artifact'] }),
        fakeTool('make_pdf', async () => ({ artifactId: 'new-deck', title: 'Deck', cardCount: 12, kind: 'flashcards' }), {
          permissions: ['write:own-artifact'],
        }),
      ),
      [fixedWorkflow('wf', plan)],
    );
    const run = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'wf', source: 'api' });
    await runtime.waitForRun(run.runId);

    const ready = (await store.listEvents(run.runId, 0)).filter((e) => e.type === 'agent.artifact.ready');
    expect(ready.map((e) => e.data?.artifactId)).toEqual(['new-deck']);
    expect(ready[0].data).toMatchObject({ kind: 'flashcards', cardCount: 12 });
    expect((await store.getRun(run.runId))!.artifactIds).toEqual(['new-deck']);
  });

  it('emits nothing artifact-related for a run that produces no document', async () => {
    const { runtime, store } = makeRuntime(
      registryOf(fakeTool('lookup', async () => ({ found: true })), fakeTool('make_pdf', async () => ({ ok: true }))),
      [fixedWorkflow('wf', plan)],
    );
    const run = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'wf', source: 'api' });
    await runtime.waitForRun(run.runId);
    const events = await store.listEvents(run.runId, 0);
    expect(events.some((e) => e.type === 'agent.artifact.ready')).toBe(false);
    expect((await store.getRun(run.runId))!.artifactIds).toEqual([]);
  });
});
