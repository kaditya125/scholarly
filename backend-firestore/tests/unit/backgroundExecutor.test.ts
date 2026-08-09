import { BackgroundExecutor } from '../../src/core/workflow/jobs/BackgroundExecutor';

// Silence the winston logger during these tests (they intentionally trigger error/warn logs).
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));

describe('BackgroundExecutor', () => {
  it('runs an enqueued job and reports completion', async () => {
    const exec = new BackgroundExecutor();
    const run = jest.fn().mockResolvedValue(undefined);

    exec.enqueue({ name: 'job-a', run });
    await exec.onIdle();

    expect(run).toHaveBeenCalledTimes(1);
    expect(exec.getStats().completed).toBe(1);
    expect(exec.getStats().failed).toBe(0);
  });

  it('enqueue returns immediately (does not block on the job)', async () => {
    const exec = new BackgroundExecutor();
    let ran = false;
    exec.enqueue({ name: 'slow', run: async () => { await new Promise(r => setTimeout(r, 20)); ran = true; } });
    // Synchronously after enqueue the job has NOT run yet (scheduled via setImmediate).
    expect(ran).toBe(false);
    await exec.onIdle();
    expect(ran).toBe(true);
  });

  it('retries a failing job with the configured retry count, then succeeds', async () => {
    const exec = new BackgroundExecutor();
    const run = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce(undefined);

    exec.enqueue({ name: 'flaky', run, retries: 2, backoffMs: 0 });
    await exec.onIdle();

    expect(run).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(exec.getStats().completed).toBe(1);
    expect(exec.getStats().retried).toBe(2);
    expect(exec.getStats().failed).toBe(0);
  });

  it('gives up after exhausting retries and records a failure without throwing', async () => {
    const exec = new BackgroundExecutor();
    const run = jest.fn().mockRejectedValue(new Error('always fails'));

    // enqueue must not throw even though the job always fails.
    expect(() => exec.enqueue({ name: 'doomed', run, retries: 1, backoffMs: 0 })).not.toThrow();
    await exec.onIdle();

    expect(run).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    expect(exec.getStats().failed).toBe(1);
    expect(exec.getStats().completed).toBe(0);
  });

  it('respects the concurrency cap', async () => {
    const exec = new BackgroundExecutor(2);
    let active = 0;
    let maxActive = 0;
    const make = () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 15));
      active--;
    };
    for (let i = 0; i < 6; i++) exec.enqueue({ name: `c${i}`, run: make() });
    await exec.onIdle();

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(exec.getStats().completed).toBe(6);
  });

  it('onIdle resolves immediately when nothing is queued', async () => {
    const exec = new BackgroundExecutor();
    await expect(exec.onIdle()).resolves.toBeUndefined();
  });

  it('integration: runs a batch of workflow-style jobs to completion and isolates a failing one', async () => {
    const exec = new BackgroundExecutor();
    const ran: string[] = [];
    exec.enqueue({ name: 'analytics.logWorkflowMetrics', run: async () => { ran.push('analytics'); } });
    exec.enqueue({ name: 'telemetry.persist', run: async () => { ran.push('telemetry'); } });
    exec.enqueue({ name: 'memory.updateSession', run: async () => { throw new Error('firestore blip'); }, retries: 0 });
    exec.enqueue({ name: 'profile.extract', run: async () => { ran.push('profile'); } });
    await exec.onIdle();

    // The failing job does not prevent the others from completing.
    expect(ran.sort()).toEqual(['analytics', 'profile', 'telemetry']);
    expect(exec.getStats().completed).toBe(3);
    expect(exec.getStats().failed).toBe(1);
  });
});
