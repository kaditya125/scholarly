import { AgentEvent } from '../../../src/agents/runtime/agent.types';
import { AgentRunError } from '../../../src/agents/runtime/AgentRuntime';
import { ToolError } from '../../../src/agents/tools/toolErrors';
import { delay, fakeTool, fixedWorkflow, makeRuntime, registryOf } from './helpers';

const step = (id: string, tool: string, input: Record<string, unknown>, dependsOn: string[] = [], optional = false) => ({
  id,
  objective: id,
  label: `Label ${id}`,
  type: 'retrieve' as const,
  tool,
  input,
  dependsOn,
  optional,
});

const basePlan = {
  successCriteria: [],
  estimatedComplexity: 'low' as const,
  requiresUserApproval: false,
};

function types(events: AgentEvent[]) {
  return events.map((e) => e.type);
}

describe('AgentRuntime', () => {
  it('runs a validated plan end to end, in parallel where possible, and records everything', async () => {
    const windows: Record<string, [number, number]> = {};
    const timed = (name: string, value: any) =>
      fakeTool(name, async () => {
        const start = Date.now();
        await delay(40);
        windows[name] = [start, Date.now()];
        return value;
      });
    const registry = registryOf(timed('resolve', { examId: 'SSC_CGL' }), timed('left', { a: 1 }), timed('right', { b: 2 }));
    const wf = fixedWorkflow('three', {
      ...basePlan,
      steps: [
        step('resolve', 'resolve', { query: 'ssc' }),
        step('left', 'left', { examId: { $ref: 'resolve', path: 'examId' } }, ['resolve']),
        step('right', 'right', { examId: { $ref: 'resolve', path: 'examId' } }, ['resolve']),
      ],
    });
    const { runtime, store, finished } = makeRuntime(registry, [wf]);

    const run = await runtime.startRun({ userId: 'u1', goal: 'overview please', workflowId: 'three', source: 'api' });
    expect(run.status).toBe('queued');
    await runtime.waitForRun(run.runId);

    const final = (await store.getRun(run.runId))!;
    expect(final.status).toBe('completed');
    expect(final.result?.outcome).toBe('success');
    expect(final.steps.map((s) => s.status)).toEqual(['completed', 'completed', 'completed']);
    expect(final.usage.toolCalls).toBe(3);
    expect(final.usage.steps).toBe(3);

    // left and right both depend only on resolve, so they overlap in time.
    expect(windows.left[0]).toBeLessThan(windows.right[1]);
    expect(windows.right[0]).toBeLessThan(windows.left[1]);

    const events = await store.listEvents(run.runId, 0);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(types(events)[0]).toBe('agent.started');
    expect(types(events)).toContain('agent.plan_ready');
    expect(types(events)).toContain('agent.verification.completed');
    expect(types(events).at(-1)).toBe('agent.completed');
    expect(types(events).filter((t) => t === 'agent.tool.completed')).toHaveLength(3);

    expect(store.toolCalls.get(run.runId)).toHaveLength(3);
    expect(store.stepOutputs.get(run.runId)?.get('resolve')?.json).toContain('SSC_CGL');
    expect(finished).toEqual([run.runId]);
  });

  it('skips dependents when an earlier step finds nothing to pass on', async () => {
    const used = jest.fn(async () => ({}));
    const registry = registryOf(fakeTool('resolve', async () => ({ examId: null })), fakeTool('use', used));
    const wf = fixedWorkflow('skip', {
      ...basePlan,
      steps: [step('resolve', 'resolve', { query: 'q' }), step('use', 'use', { examId: { $ref: 'resolve', path: 'examId' } }, ['resolve'], true)],
    });
    const { runtime, store } = makeRuntime(registry, [wf]);
    const run = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'skip', source: 'api' });
    await runtime.waitForRun(run.runId);

    const final = (await store.getRun(run.runId))!;
    expect(used).not.toHaveBeenCalled();
    expect(final.steps.find((s) => s.id === 'use')?.status).toBe('skipped');
    expect(final.status).toBe('completed');
    expect(types(await store.listEvents(run.runId, 0))).toContain('agent.step.skipped');
  });

  it('fails the run with a classified, student-safe error when a required step fails', async () => {
    const registry = registryOf(
      fakeTool('boom', async () => {
        throw new ToolError('permission', 'internal detail: bucket acl denied for projects/x');
      }),
    );
    const wf = fixedWorkflow('fail', { ...basePlan, steps: [step('only', 'boom', { query: 'q' })] });
    const { runtime, store } = makeRuntime(registry, [wf]);
    const run = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'fail', source: 'api' });
    await runtime.waitForRun(run.runId);

    const final = (await store.getRun(run.runId))!;
    expect(final.status).toBe('failed');
    expect(final.error?.class).toBe('permission');
    expect(final.error?.message).not.toMatch(/bucket|acl|projects/);
    const events = await store.listEvents(run.runId, 0);
    expect(types(events).at(-1)).toBe('agent.failed');
    expect(JSON.stringify(events)).not.toMatch(/bucket acl/);
  });

  it('rejects up front a plan that cannot fit its tool-call budget', async () => {
    const first = jest.fn(async () => ({ examId: 'X' }));
    const second = jest.fn(async () => ({}));
    const registry = registryOf(fakeTool('first', first), fakeTool('second', second));
    const wf = fixedWorkflow(
      'budgeted',
      { ...basePlan, steps: [step('a', 'first', { query: 'q' }), step('b', 'second', { examId: { $ref: 'a', path: 'examId' } }, ['a'])] },
      { budget: { maxToolCalls: 1 } },
    );
    const { runtime, store } = makeRuntime(registry, [wf]);
    const run = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'budgeted', source: 'api' });
    await runtime.waitForRun(run.runId);
    const final = (await store.getRun(run.runId))!;
    expect(final.status).toBe('failed');
    expect(final.error?.class).toBe('validation');
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('halts mid-run when retries exhaust the tool-call budget', async () => {
    let calls = 0;
    const flaky = fakeTool(
      'flaky',
      async () => {
        calls += 1;
        throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      },
      { retry: { maxAttempts: 5, baseBackoffMs: 1 } },
    );
    const after = jest.fn(async () => ({}));
    const registry = registryOf(flaky, fakeTool('after', after));
    const wf = fixedWorkflow(
      'retry-budget',
      { ...basePlan, steps: [step('a', 'flaky', { query: 'q' }), step('b', 'after', { query: 'q' }, ['a'])] },
      { budget: { maxToolCalls: 3 } },
    );
    const { runtime, store } = makeRuntime(registry, [wf]);
    const run = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'retry-budget', source: 'api' });
    await runtime.waitForRun(run.runId);
    const final = (await store.getRun(run.runId))!;
    expect(calls).toBe(3);
    expect(after).not.toHaveBeenCalled();
    expect(final.status).toBe('failed');
    expect(final.error?.class).toBe('budget');
    expect(final.usage.toolCalls).toBe(3);
  });

  it('enforces the execution-time budget', async () => {
    const registry = registryOf(fakeTool('slow', () => new Promise(() => undefined) as any, { timeoutMs: 10_000 }));
    const wf = fixedWorkflow('timed', { ...basePlan, steps: [step('a', 'slow', { query: 'q' })] }, { budget: { maxExecutionMs: 80 } });
    const { runtime, store } = makeRuntime(registry, [wf]);
    const run = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'timed', source: 'api' });
    await runtime.waitForRun(run.runId);
    const final = (await store.getRun(run.runId))!;
    expect(final.status).toBe('failed');
    expect(final.error?.class).toBe('budget');
  });

  it('cancels a running task and says so last', async () => {
    const registry = registryOf(fakeTool('slow', () => new Promise(() => undefined) as any, { timeoutMs: 10_000 }));
    const wf = fixedWorkflow('cancellable', { ...basePlan, steps: [step('a', 'slow', { query: 'q' })] });
    const { runtime, store } = makeRuntime(registry, [wf]);
    const run = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'cancellable', source: 'api' });
    await delay(30);
    await runtime.cancelRun(run.runId, 'u1');
    await runtime.waitForRun(run.runId);
    const final = (await store.getRun(run.runId))!;
    expect(final.status).toBe('cancelled');
    expect(final.cancelRequested).toBe(true);
    const events = await store.listEvents(run.runId, 0);
    expect(types(events).at(-1)).toBe('agent.cancelled');
  });

  it('cancels a queued task before it starts, without executing it', async () => {
    const hold = fakeTool('hold', () => new Promise(() => undefined) as any, { timeoutMs: 10_000 });
    const neverRun = jest.fn(async () => ({}));
    const registry = registryOf(hold, fakeTool('never', neverRun));
    const blocker = fixedWorkflow('blocker', { ...basePlan, steps: [step('a', 'hold', { query: 'q' })] });
    const queued = fixedWorkflow('queued', { ...basePlan, steps: [step('a', 'never', { query: 'q' })] });
    const { runtime, store } = makeRuntime(registry, [blocker, queued], {
      concurrency: { maxConcurrentRuns: 1, maxActiveRunsPerUser: 1, maxConcurrentStepsPerRun: 3 },
    });
    const first = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'blocker', source: 'api' });
    const second = await runtime.startRun({ userId: 'u2', goal: 'g', workflowId: 'queued', source: 'api' });
    const cancelled = await runtime.cancelRun(second.runId, 'u2');
    expect(cancelled.status).toBe('cancelled');
    expect(neverRun).not.toHaveBeenCalled();
    await runtime.cancelRun(first.runId, 'u1');
    await runtime.waitForRun(first.runId);
    expect((await store.getRun(first.runId))!.status).toBe('cancelled');
  });

  it('allows one active task per student', async () => {
    const registry = registryOf(fakeTool('hold', () => new Promise(() => undefined) as any, { timeoutMs: 10_000 }));
    const wf = fixedWorkflow('hold', { ...basePlan, steps: [step('a', 'hold', { query: 'q' })] });
    const { runtime } = makeRuntime(registry, [wf]);
    const first = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'hold', source: 'api' });
    await expect(runtime.startRun({ userId: 'u1', goal: 'g2', workflowId: 'hold', source: 'api' })).rejects.toMatchObject({
      code: 'USER_BUSY',
      statusCode: 409,
    });
    // A different student is not blocked.
    const other = await runtime.startRun({ userId: 'u2', goal: 'g', workflowId: 'hold', source: 'api' });
    await runtime.cancelRun(first.runId, 'u1');
    await runtime.cancelRun(other.runId, 'u2');
    await Promise.all([runtime.waitForRun(first.runId), runtime.waitForRun(other.runId)]);
  });

  it('charges quota before creating a run, and creates nothing when the quota is spent', async () => {
    const registry = registryOf(fakeTool('t', async () => ({})));
    const wf = fixedWorkflow('q', { ...basePlan, steps: [step('a', 't', { query: 'q' })] });
    const quota = { consumeAgentRun: jest.fn(async () => { throw Object.assign(new Error('spent'), { code: 'QUOTA_EXHAUSTED' }); }) };
    const { runtime, store } = makeRuntime(registry, [wf], { quota });
    await expect(runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'q', source: 'api' })).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
    expect(store.runsById.size).toBe(0);
  });

  it('never executes an invalid plan', async () => {
    const t = jest.fn(async () => ({}));
    const registry = registryOf(fakeTool('t', t));
    const wf = fixedWorkflow('bad', { ...basePlan, steps: [step('a', 't', { query: 'q' }), step('b', 'not_registered', { query: 'q' }, ['a'])] });
    const { runtime, store } = makeRuntime(registry, [wf]);
    const run = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'bad', source: 'api' });
    await runtime.waitForRun(run.runId);
    const final = (await store.getRun(run.runId))!;
    expect(final.status).toBe('failed');
    expect(final.error?.class).toBe('validation');
    expect(t).not.toHaveBeenCalled();
    expect(store.toolCalls.get(run.runId) ?? []).toHaveLength(0);
  });

  it('rejects unknown workflows, empty goals and oversized goals', async () => {
    const { runtime } = makeRuntime(registryOf(), []);
    await expect(runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'nope', source: 'api' })).rejects.toBeInstanceOf(AgentRunError);
    const rig = makeRuntime(registryOf(fakeTool('t', async () => ({}))), [
      fixedWorkflow('w', { ...basePlan, steps: [step('a', 't', { query: 'q' })] }),
    ]);
    await expect(rig.runtime.startRun({ userId: 'u1', goal: '   ', workflowId: 'w', source: 'api' })).rejects.toMatchObject({ code: 'INVALID_GOAL' });
    await expect(rig.runtime.startRun({ userId: 'u1', goal: 'x'.repeat(5000), workflowId: 'w', source: 'api' })).rejects.toMatchObject({ code: 'INVALID_GOAL' });
  });

  it('replays events after a sequence number, and hides a run from other students', async () => {
    const registry = registryOf(fakeTool('t', async () => ({ ok: true })));
    const wf = fixedWorkflow('r', { ...basePlan, steps: [step('a', 't', { query: 'q' })] });
    const { runtime } = makeRuntime(registry, [wf]);
    const run = await runtime.startRun({ userId: 'owner', goal: 'g', workflowId: 'r', source: 'api' });
    await runtime.waitForRun(run.runId);

    const all = await runtime.listEventsForUser(run.runId, 'owner', 0);
    const tail = await runtime.listEventsForUser(run.runId, 'owner', 3);
    expect(tail.map((e) => e.seq)).toEqual(all.filter((e) => e.seq > 3).map((e) => e.seq));

    await expect(runtime.getRunForUser(run.runId, 'intruder')).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    await expect(runtime.listEventsForUser(run.runId, 'intruder', 0)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(runtime.cancelRun(run.runId, 'intruder')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('streams events live to subscribers as they happen', async () => {
    const registry = registryOf(fakeTool('t', async () => ({ ok: true })));
    const wf = fixedWorkflow('live', { ...basePlan, steps: [step('a', 't', { query: 'q' })] });
    const { runtime } = makeRuntime(registry, [wf]);
    const seen: AgentEvent[] = [];
    const run = await runtime.startRun({ userId: 'u1', goal: 'g', workflowId: 'live', source: 'api' });
    const unsubscribe = runtime.subscribe(run.runId, (e) => seen.push(e));
    await runtime.waitForRun(run.runId);
    unsubscribe();
    expect(seen.length).toBeGreaterThan(3);
    expect(seen.at(-1)?.type).toBe('agent.completed');
  });

  it('marks runs orphaned by a dead process as failed, continuing the event sequence', async () => {
    const { runtime, store } = makeRuntime(registryOf(), []);
    const now = Date.now();
    await store.createRun({
      runId: 'orphan',
      userId: 'u1',
      goal: 'g',
      workflowId: 'w',
      source: 'api',
      status: 'executing',
      steps: [{ id: 'a', label: 'A', tool: 't', status: 'completed', attempts: 1 }],
      budget: { maxSteps: 1, maxToolCalls: 1, maxTokens: 1, maxExecutionMs: 1, maxCostUsd: 1 },
      usage: { steps: 1, toolCalls: 1, tokens: 0, costUsd: 0, elapsedMs: 0 },
      artifactIds: [],
      cancelRequested: false,
      lastEventSeq: 2,
      lease: { owner: 'dead', expiresAt: now - 1_000 },
      createdAt: now - 60_000,
      updatedAt: now - 60_000,
    });
    // Events beyond the doc's lastEventSeq exist (heartbeat lag) and must not be overwritten.
    for (const seq of [1, 2, 3, 4]) await store.appendEvent({ runId: 'orphan', seq, type: 'agent.step.started', ts: now });
    await store.createRun({
      runId: 'alive',
      userId: 'u2',
      goal: 'g',
      workflowId: 'w',
      source: 'api',
      status: 'executing',
      steps: [],
      budget: { maxSteps: 1, maxToolCalls: 1, maxTokens: 1, maxExecutionMs: 1, maxCostUsd: 1 },
      usage: { steps: 0, toolCalls: 0, tokens: 0, costUsd: 0, elapsedMs: 0 },
      artifactIds: [],
      cancelRequested: false,
      lastEventSeq: 0,
      lease: { owner: 'other-live-instance', expiresAt: now + 60_000 },
      createdAt: now,
      updatedAt: now,
    });

    expect(await runtime.recoverInterruptedRuns()).toBe(1);
    const orphan = (await store.getRun('orphan'))!;
    expect(orphan.status).toBe('failed');
    expect(orphan.error?.message).toMatch(/interrupted/);
    const events = await store.listEvents('orphan', 0);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(events.at(-1)?.type).toBe('agent.failed');
    expect((await store.getRun('alive'))!.status).toBe('executing');
  });
});
