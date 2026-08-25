/**
 * The production failure this guards against: Upstash's request allowance ran out, and four
 * independent Redis clients each kept issuing commands and logging every rejection. Nothing
 * stopped asking, and the workers that did pause never resumed.
 */
import {
  isQuotaError,
  isRedisOverQuota,
  noteRedisError,
  redisQuotaStatus,
  __resetRedisQuotaBreaker,
} from '../../src/services/redisQuota';

const QUOTA_ERR = new Error(
  'ERR max requests limit exceeded. Limit: 500000, Usage: 500003. See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details',
);

beforeEach(() => {
  __resetRedisQuotaBreaker();
  jest.restoreAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('recognising the quota rejection', () => {
  it('matches the exact wording Upstash returns', () => {
    expect(isQuotaError(QUOTA_ERR)).toBe(true);
  });

  it('does not treat an ordinary connection fault as a quota problem', () => {
    // These must stay retryable. Tripping the breaker on a dropped socket would disable Redis
    // for the whole cooldown over something the client recovers from on its own.
    expect(isQuotaError(new Error('connect ECONNREFUSED 127.0.0.1:6379'))).toBe(false);
    expect(isQuotaError(new Error('Socket closed unexpectedly'))).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });
});

describe('the breaker', () => {
  it('is closed until a quota rejection arrives', () => {
    expect(isRedisOverQuota()).toBe(false);
  });

  it('opens on a quota rejection and reports it once, not once per caller', () => {
    expect(noteRedisError(QUOTA_ERR, 'cache.get')).toBe(true);
    expect(isRedisOverQuota()).toBe(true);

    // Three more consumers hit the same wall; none of them should log again.
    noteRedisError(QUOTA_ERR, 'EventBus.pubClient');
    noteRedisError(QUOTA_ERR, 'EventBus.subClient');
    noteRedisError(QUOTA_ERR, 'NotificationWorker');

    expect(console.error).toHaveBeenCalledTimes(1);
    const status = redisQuotaStatus();
    expect(status.overQuota).toBe(true);
    expect(status.tripCount).toBe(1);
    expect(status.lastSource).toBe('cache.get');
  });

  it('leaves the breaker closed for a non-quota error', () => {
    expect(noteRedisError(new Error('Socket closed unexpectedly'), 'cache.get')).toBe(false);
    expect(isRedisOverQuota()).toBe(false);
  });

  it('closes again once the cooldown elapses, so recovery does not need a restart', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T00:00:00Z'));
    noteRedisError(QUOTA_ERR, 'cache.get');
    expect(isRedisOverQuota()).toBe(true);

    jest.setSystemTime(new Date('2026-08-26T00:14:00Z')); // still inside the 15m window
    expect(isRedisOverQuota()).toBe(true);

    jest.setSystemTime(new Date('2026-08-26T00:16:00Z')); // past it
    expect(isRedisOverQuota()).toBe(false);
    jest.useRealTimers();
  });

  it('re-trips if the quota is still gone after the cooldown', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T00:00:00Z'));
    noteRedisError(QUOTA_ERR, 'cache.get');
    jest.setSystemTime(new Date('2026-08-26T00:16:00Z'));
    expect(isRedisOverQuota()).toBe(false);

    noteRedisError(QUOTA_ERR, 'cache.get');
    expect(isRedisOverQuota()).toBe(true);
    expect(redisQuotaStatus().tripCount).toBe(2);
    jest.useRealTimers();
  });
});
