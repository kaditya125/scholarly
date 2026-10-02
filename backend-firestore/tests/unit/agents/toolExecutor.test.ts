import { z } from 'zod';
import { ToolExecutor, BudgetMeter } from '../../../src/agents/tools/ToolExecutor';
import { ToolError, classifyError } from '../../../src/agents/tools/toolErrors';
import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';
import { fakeTool, noSleep, noUsage, registryOf } from './helpers';

function meter(limit = 100): BudgetMeter & { calls: number } {
  const m = {
    calls: 0,
    beforeToolCall() {
      if (m.calls + 1 > limit) throw new ToolError('budget', 'limit');
      m.calls += 1;
    },
    recordUsage() {},
  };
  return m;
}

const ctx = (signal = new AbortController().signal) => ({ userId: 'u1', runId: 'r1', stepId: 's1', signal });

describe('ToolExecutor', () => {
  it('refuses an unregistered tool without calling anything', async () => {
    const ex = new ToolExecutor(new ToolRegistry(), { sleep: noSleep, estimateUsage: noUsage });
    const out = await ex.execute('ghost', {}, ctx(), meter());
    expect(out).toMatchObject({ ok: false, failureClass: 'validation', attempts: 0, calls: [] });
  });

  it('rejects invalid input before the first attempt', async () => {
    const impl = jest.fn(async () => ({ ok: 1 }));
    const tool = fakeTool('t', impl, { inputSchema: z.object({ examId: z.string() }) });
    const ex = new ToolExecutor(registryOf(tool), { sleep: noSleep, estimateUsage: noUsage });
    const m = meter();
    const out = await ex.execute('t', { examId: 42 }, ctx(), m);
    expect(out.failureClass).toBe('validation');
    expect(impl).not.toHaveBeenCalled();
    expect(m.calls).toBe(0);
  });

  it('retries a transient failure with backoff and then succeeds', async () => {
    let n = 0;
    const tool = fakeTool('t', async () => {
      n += 1;
      if (n === 1) throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      return { value: 7 };
    }, { retry: { maxAttempts: 3, baseBackoffMs: 50 } });
    const sleeps: number[] = [];
    const ex = new ToolExecutor(registryOf(tool), {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      estimateUsage: noUsage,
    });
    const m = meter();
    const out = await ex.execute('t', {}, ctx(), m);
    expect(out.ok).toBe(true);
    expect(out.attempts).toBe(2);
    expect(out.calls.map((c) => c.status)).toEqual(['error', 'ok']);
    expect(out.calls[0].failureClass).toBe('network');
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(50);
    expect(m.calls).toBe(2);
  });

  it('does not retry validation or permission failures', async () => {
    const impl = jest.fn(async () => {
      throw new ToolError('permission', 'nope');
    });
    const ex = new ToolExecutor(registryOf(fakeTool('t', impl, { retry: { maxAttempts: 3, baseBackoffMs: 1 } })), { sleep: noSleep, estimateUsage: noUsage });
    const out = await ex.execute('t', {}, ctx(), meter());
    expect(out.failureClass).toBe('permission');
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it('stops after maxAttempts on repeated timeouts', async () => {
    const impl = jest.fn(() => new Promise(() => undefined));
    const tool = fakeTool('slow', impl as any, { timeoutMs: 20, retry: { maxAttempts: 2, baseBackoffMs: 1 } });
    const ex = new ToolExecutor(registryOf(tool), { sleep: noSleep, estimateUsage: noUsage });
    const out = await ex.execute('slow', {}, ctx(), meter());
    expect(out.failureClass).toBe('timeout');
    expect(out.attempts).toBe(2);
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it('honours cancellation during a call', async () => {
    const abort = new AbortController();
    const tool = fakeTool('slow', () => new Promise(() => undefined) as any, { timeoutMs: 5_000 });
    const ex = new ToolExecutor(registryOf(tool), { sleep: noSleep, estimateUsage: noUsage });
    setTimeout(() => abort.abort(), 10);
    const out = await ex.execute('slow', {}, ctx(abort.signal), meter());
    expect(out.failureClass).toBe('cancelled');
  });

  it('reports a budget stop without calling the tool', async () => {
    const impl = jest.fn(async () => ({}));
    const ex = new ToolExecutor(registryOf(fakeTool('t', impl)), { sleep: noSleep, estimateUsage: noUsage });
    const out = await ex.execute('t', {}, ctx(), meter(0));
    expect(out.failureClass).toBe('budget');
    expect(impl).not.toHaveBeenCalled();
  });

  it('treats an output that breaks the tool contract as a validation failure', async () => {
    const tool = fakeTool('t', async () => ({ wrong: true }), { outputSchema: z.object({ examId: z.string() }) });
    const ex = new ToolExecutor(registryOf(tool), { sleep: noSleep, estimateUsage: noUsage });
    const out = await ex.execute('t', {}, ctx(), meter());
    expect(out.failureClass).toBe('validation');
    expect(out.attempts).toBe(1);
  });

  it('never passes identity through tool input', async () => {
    let seen: any;
    const tool = fakeTool('t', async (input, c) => {
      seen = { input, userId: c.userId };
      return {};
    });
    const ex = new ToolExecutor(registryOf(tool), { sleep: noSleep, estimateUsage: noUsage });
    await ex.execute('t', { query: 'x' }, ctx(), meter());
    expect(seen.userId).toBe('u1');
    expect(seen.input).toEqual({ query: 'x' });
  });
});

describe('ToolRegistry', () => {
  it('refuses retries on a non-idempotent tool and duplicate names', () => {
    const r = new ToolRegistry();
    expect(() => r.register(fakeTool('w', async () => ({}), { idempotent: false, retry: { maxAttempts: 2, baseBackoffMs: 1 } }))).toThrow(/not idempotent/);
    r.register(fakeTool('ok', async () => ({})));
    expect(() => r.register(fakeTool('ok', async () => ({})))).toThrow(/already registered/);
    expect(() => r.register(fakeTool('Bad-Name', async () => ({})))).toThrow(/Invalid tool name/);
  });

  it('lists public descriptors without executable parts', () => {
    const r = registryOf(fakeTool('alpha', async () => ({})));
    const [d] = r.list();
    expect(d).toMatchObject({ name: 'alpha', category: 'knowledge', maxAttempts: 2, idempotent: true });
    expect((d as any).execute).toBeUndefined();
    expect(d.inputFields).toEqual(['query', 'examId', 'n']);
  });
});

describe('classifyError', () => {
  it.each([
    [Object.assign(new Error('x'), { status: 429 }), 'rate_limit'],
    [new Error('RESOURCE_EXHAUSTED: quota'), 'rate_limit'],
    [new Error('Request timed out after 30s'), 'timeout'],
    [Object.assign(new Error('x'), { status: 503 }), 'network'],
    [Object.assign(new Error('x'), { status: 403 }), 'permission'],
    [new Error('examId is required'), 'validation'],
    [new Error('something odd'), 'internal'],
  ])('%s → %s', (err, cls) => {
    expect(classifyError(err)).toBe(cls);
  });
});
