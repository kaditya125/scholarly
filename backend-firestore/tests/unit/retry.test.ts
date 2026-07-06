import { withTimeout, withRetry } from '../../src/utils/retry';

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 100, 'x')).resolves.toBe('ok');
  });

  it('rejects when it exceeds the timeout', async () => {
    const slow = new Promise<string>((res) => setTimeout(() => res('late'), 200));
    await expect(withTimeout(slow, 20, 'x')).rejects.toThrow(/timed out/);
  });
});

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient (429) errors then succeeds', async () => {
    const err: any = new Error('rate limited');
    err.status = 429;
    const fn = jest.fn().mockRejectedValueOnce(err).mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry non-transient (400) errors', async () => {
    const err: any = new Error('bad request');
    err.status = 400;
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the configured number of retries', async () => {
    const err: any = new Error('server error');
    err.status = 500;
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow('server error');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
