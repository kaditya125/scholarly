/**
 * Regression tests for cross-instance notification identity.
 *
 * THE BUG: EventBus.publish() enqueues to BullMQ inside publish() itself. Redis pub/sub broadcasts
 * a domain event to EVERY subscribed instance, so with N API instances all N ran the
 * podcast.completed subscriber, all N published notification.created, and all N enqueued their own
 * job — N jobs, N notifications, for ONE logical event. Measured pre-fix with two real processes
 * against one Redis: a single podcast.completed produced 2 BullMQ jobs.
 *
 * Nothing existing caught it: BullMQ job locking prevents one job being processed twice, not N jobs
 * being created; the NODE_APP_INSTANCE election picks which instance runs the WORKERS, and this is
 * the publish side; and the anti-spam limiter only suppresses the 4th identical event in 60s.
 *
 * WHAT THESE TESTS PIN DOWN: the dedupe id that reaches the queue must be a function of the CAUSING
 * event's identity and nothing else — no randomness, no per-process state. That is the property
 * that makes N instances collapse to one job, and it is the property that silently regresses if
 * someone reintroduces a fresh id in the subscriber.
 *
 * Delivering the same (event, payload, meta) twice is an exact simulation of two instances: a Redis
 * broadcast is one serialized message, so every instance calls executeHandlers with byte-identical
 * arguments. The only thing that differs in production is which process runs it — which is
 * precisely what must NOT influence the id.
 */

// Observe what identity actually reaches the queue. Must be `mock`-prefixed to be usable inside a
// jest.mock factory.
const mockEnqueueNotification = jest.fn();

jest.mock('../../src/core/workflow/jobs/BackgroundQueue', () => ({
  backgroundQueue: { enqueueNotification: mockEnqueueNotification },
  isQueueBrokerEnabled: () => false,
  queueBrokerDisabledReason: () => 'test',
}));

import { eventBus, EventMeta } from '../../src/core/events/EventBus';
import { registerEventSubscribers } from '../../src/core/events/subscribers';

/** enqueueNotification(payload, retries, backoffMs, delayMs, dedupeId) — the id is arg 5. */
const dedupeIds = (): Array<string | undefined> =>
  mockEnqueueNotification.mock.calls.map((c) => c[4]);

/** Deliver a broadcast exactly as a receiving instance does. */
const deliverAsInstance = (event: string, payload: any, meta: EventMeta) =>
  (eventBus as any).executeHandlers(event, payload, meta);

const podcastPayload = { podcastId: 'pod-1', userId: 'user-1', durationMs: 300_000 };

describe('notification enqueue identity is stable across instances', () => {
  beforeAll(() => {
    registerEventSubscribers();
  });

  beforeEach(() => {
    mockEnqueueNotification.mockClear();
  });

  it('THE REGRESSION: two instances receiving the SAME broadcast enqueue with the SAME dedupe id', async () => {
    const meta: EventMeta = { eventId: 'podcast.completed:abc-123', publishedAt: Date.now() };

    await deliverAsInstance('podcast.completed', podcastPayload, meta); // instance A
    await deliverAsInstance('podcast.completed', podcastPayload, meta); // instance B

    const ids = dedupeIds();
    expect(ids).toHaveLength(2);
    // Assert DEFINED before asserting equal. Checking only equality passes vacuously against the
    // pre-fix code, where both ids are undefined — verified by running this suite against the
    // reverted source: it was the one test of six that still passed.
    expect(ids[0]).toEqual(expect.any(String));
    // Pre-fix this failed: each instance minted its own random notification.created eventId, so the
    // two ids differed and BullMQ correctly created two separate jobs.
    expect(ids[0]).toBe(ids[1]);
  });

  it('derives the id from the CAUSING event, so it survives a process restart', async () => {
    const meta: EventMeta = { eventId: 'podcast.completed:abc-123', publishedAt: Date.now() };

    await deliverAsInstance('podcast.completed', podcastPayload, meta);

    expect(dedupeIds()[0]).toContain('podcast.completed:abc-123');
  });

  it('always supplies a dedupe id for notification.created', async () => {
    const meta: EventMeta = { eventId: 'podcast.completed:xyz-999', publishedAt: Date.now() };

    await deliverAsInstance('podcast.completed', podcastPayload, meta);

    expect(dedupeIds()[0]).toEqual(expect.any(String));
  });

  it('does NOT over-collapse: two genuinely different events get different ids', async () => {
    // The failure mode in the opposite direction — a dedupe key that is too coarse silently
    // swallows real notifications, which is worse than the duplication it replaces.
    await deliverAsInstance('podcast.completed', podcastPayload, {
      eventId: 'podcast.completed:first',
      publishedAt: Date.now(),
    });
    await deliverAsInstance('podcast.completed', podcastPayload, {
      eventId: 'podcast.completed:second',
      publishedAt: Date.now(),
    });

    const ids = dedupeIds();
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('distinguishes notifications of different TYPE from the same cause', async () => {
    // One cause that legitimately produces several different notifications must not have them
    // collapsed into one. The notification type is part of the identity for exactly this reason.
    const sharedCause = 'some.cause:shared-id';

    await deliverAsInstance('podcast.completed', podcastPayload, {
      eventId: sharedCause,
      publishedAt: Date.now(),
    });
    await deliverAsInstance('podcast.failed', { podcastId: 'pod-1', userId: 'user-1', error: 'boom' }, {
      eventId: sharedCause,
      publishedAt: Date.now(),
    });

    const ids = dedupeIds();
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('a directly-published notification.created still carries its own identity', async () => {
    // Direct publishes (e.g. dm.service) run in ONE process, so they never duplicated — but they
    // must still route with a defined id rather than falling through the new code path untouched.
    await eventBus.publish(
      'notification.created',
      {
        userId: 'user-1',
        category: 'system' as const,
        type: 'direct.test',
        title: 'T',
        body: 'B',
      },
      { eventId: 'notification.created:direct-1' },
    );

    expect(dedupeIds()[0]).toContain('notification.created:direct-1');
  });
});
