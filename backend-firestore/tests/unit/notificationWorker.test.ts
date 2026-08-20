/**
 * The notification queue consumer.
 *
 * Context: startNotificationWorker() was never called from server.ts — only from one-off scripts —
 * so production enqueued notification jobs that nothing ever drained (5 waiting, BullMQ id counter
 * at 2022). These cover the contract the bootstrap wiring depends on.
 *
 * REDIS_URL is unset under tests, so isQueueBrokerEnabled() is false and the worker constructor
 * short-circuits before touching BullMQ or Redis. That is the intended degraded path and exactly
 * what makes the singleton/idempotency behaviour testable without a broker.
 */
/*
 * The worker's transitive import graph cannot currently be compiled by ts-jest:
 *   - `uuid` ships ESM-only in dist-node and jest does not transform node_modules;
 *   - EmailNotificationService reads SMTP_* keys that are absent from the zod env schema, one of
 *     the 98 pre-existing type errors.
 * Both are mocked with factories so jest never requires — and ts-jest never compiles — the real
 * modules. Mocking here rather than widening transformIgnorePatterns or ts-jest diagnostics
 * globally, which would change how every other suite loads and could mask real errors elsewhere.
 * Neither module participates in the behaviour under test (worker lifecycle and queueing).
 */
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));
jest.mock('../../src/core/notifications/EmailNotificationService', () => ({
  emailNotificationService: { send: jest.fn(), sendEmail: jest.fn() },
}));

import * as NW from '../../src/core/workflow/jobs/NotificationWorker';
import { isQueueBrokerEnabled } from '../../src/core/workflow/jobs/BackgroundQueue';

const { startNotificationWorker } = NW;

describe('notification worker startup', () => {
  it('the broker is disabled under test, so the worker degrades instead of dialling Redis', () => {
    expect(isQueueBrokerEnabled()).toBe(false);
  });

  it('starting the worker creates the singleton', () => {
    startNotificationWorker();
    expect(NW.notificationWorker).not.toBeNull();
  });

  it('THE REGRESSION: repeated starts never create a second worker in one process', () => {
    startNotificationWorker();
    const first = NW.notificationWorker;
    startNotificationWorker();
    startNotificationWorker();

    // Same object, not merely non-null: a second BullMQ Worker on the same queue would double
    // the polling load against a quota-limited Redis for no added throughput.
    expect(NW.notificationWorker).toBe(first);
  });

  it('exposes a close() so shutdown can release the queue connection', () => {
    expect(typeof (NW.notificationWorker as any)?.close).toBe('function');
  });

  it('reports honestly that it is NOT draining when the broker is unavailable', () => {
    // The boot log is the only way anyone notices a missing queue consumer — which is exactly how
    // this worker went unnoticed. So "started" must never be claimed when nothing is attached.
    const result = startNotificationWorker();
    expect(result).toEqual({ draining: false });
    expect(NW.notificationWorker!.isDraining).toBe(false);
  });
});

/**
 * One published notification must produce exactly ONE queued job.
 *
 * This is the property the whole delivery contract rests on: the API enqueues, the worker
 * consumes, and BullMQ locks each job so it is processed once. If publish() ever enqueued twice,
 * no amount of worker-side correctness could recover — the student would get two notifications.
 */
describe('notification.created → exactly one queued job', () => {
  const realEnv = process.env.DISABLE_WORKERS;
  afterEach(() => {
    process.env.DISABLE_WORKERS = realEnv;
    jest.resetModules();
  });

  it('publishing notification.created enqueues exactly once', async () => {
    jest.resetModules();
    const enqueueNotification = jest.fn().mockResolvedValue(undefined);
    jest.doMock('../../src/core/workflow/jobs/BackgroundQueue', () => ({
      backgroundQueue: { enqueueNotification },
      isQueueBrokerEnabled: () => false,
      queueBrokerDisabledReason: () => 'REDIS_URL not set',
    }));

    const { EventBus } = require('../../src/core/events/EventBus');
    const bus = new EventBus();
    await bus.publish('notification.created', {
      userId: 'u1', category: 'learning', type: 'test.notice', title: 'T', body: 'B',
    });

    expect(enqueueNotification).toHaveBeenCalledTimes(1);
    await bus.close().catch(() => {});
  });

  it('four publishes enqueue exactly four jobs, not eight', async () => {
    jest.resetModules();
    const enqueueNotification = jest.fn().mockResolvedValue(undefined);
    jest.doMock('../../src/core/workflow/jobs/BackgroundQueue', () => ({
      backgroundQueue: { enqueueNotification },
      isQueueBrokerEnabled: () => false,
      queueBrokerDisabledReason: () => 'REDIS_URL not set',
    }));

    const { EventBus } = require('../../src/core/events/EventBus');
    const bus = new EventBus();
    for (let i = 0; i < 4; i++) {
      await bus.publish('notification.created', {
        userId: `u${i}`, category: 'learning', type: 'test.notice', title: 'T', body: 'B',
      });
    }

    expect(enqueueNotification).toHaveBeenCalledTimes(4);
    await bus.close().catch(() => {});
  });

  it('a domain event fans out to exactly one notification job', async () => {
    // podcast.completed → subscriber → notification.created → enqueue. One in, one out.
    jest.resetModules();
    const enqueueNotification = jest.fn().mockResolvedValue(undefined);
    jest.doMock('../../src/core/workflow/jobs/BackgroundQueue', () => ({
      backgroundQueue: { enqueueNotification },
      isQueueBrokerEnabled: () => false,
      queueBrokerDisabledReason: () => 'REDIS_URL not set',
    }));

    const { eventBus } = require('../../src/core/events/EventBus');
    const { registerEventSubscribers } = require('../../src/core/events/subscribers');
    registerEventSubscribers();

    await eventBus.publish('podcast.completed', { podcastId: 'p1', userId: 'u1', durationMs: 60000 });

    expect(enqueueNotification).toHaveBeenCalledTimes(1);
  });
});

/**
 * Retry/backoff is the queue's own durability guarantee and must not drift — the worker rethrows
 * on failure specifically so BullMQ can apply it.
 */
describe('retry policy is preserved', () => {
  it('enqueues with 3 attempts and exponential backoff', async () => {
    // The suites above replaced this module with a factory that exports only `backgroundQueue`;
    // resetModules clears the registry but leaves the doMock registration in place, so the real
    // class has to be un-mocked explicitly before requiring it.
    jest.dontMock('../../src/core/workflow/jobs/BackgroundQueue');
    jest.resetModules();
    const add = jest.fn().mockResolvedValue({ id: '1' });
    jest.doMock('bullmq', () => ({
      Queue: jest.fn().mockImplementation(() => ({ add, close: jest.fn() })),
      Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn(), pause: jest.fn() })),
    }));
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    process.env.DISABLE_WORKERS = 'false';

    const { BackgroundQueue } = require('../../src/core/workflow/jobs/BackgroundQueue');
    const q = new BackgroundQueue();
    await q.enqueueNotification({
      userId: 'u1', category: 'learning', type: 'test.notice', title: 'T', body: 'B',
    } as any);

    expect(add).toHaveBeenCalledWith('notification.process', expect.objectContaining({ userId: 'u1' }),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 100,
        delay: 0,
      }));

    delete process.env.REDIS_URL;
    delete process.env.DISABLE_WORKERS;
  });
});
