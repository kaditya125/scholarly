/**
 * Bootstrap subscriber registration must produce exactly ONE logical subscriber per event.
 *
 * Context: registerEventSubscribers() was never called from server.ts, so the running server had
 * an EventBus with no mastery consumer at all. Wiring it into bootstrap fixes that — but naively
 * wiring it re-opens the door to the earlier double-delivery incident, because this function
 * builds fresh closures on every call and eventBus.subscribe() stores them in a Set that can only
 * dedupe by reference. Two bootstrap paths would therefore mean two handlers per event, and every
 * side effect (student notifications, BullMQ enqueues, and now mastery evidence) would double.
 *
 * These run with NODE_ENV=test, so publish() dispatches in-process through the same
 * executeHandlers() the Redis path uses.
 */
// The Automation Studio dispatcher is a SEPARATE subscriber with its own wiring, and it also takes
// learning.test_completed and user.registered. It is not what this file is measuring, so it is
// stubbed out to leave only the closures registerEventSubscribers() builds itself.
//
// It has to be stubbed explicitly now: subscribers.ts require()s it lazily inside a try/catch, and
// that require used to throw here — its graph reaches uuid, which Jest could not load — so the
// catch swallowed it and the dispatcher silently never subscribed under test. These assertions were
// passing on that accident. Once jest.config.js maps uuid to a CommonJS stand-in the require
// succeeds, the dispatcher subscribes exactly as it does in production, and a second (correct,
// distinct) handler appears on those two events. Stubbing pins the suite to its actual subject
// instead of to whether uuid happens to be loadable.
jest.mock('../../src/core/automation/engine/AutomationTriggerDispatcher', () => ({
  automationTriggerDispatcher: { initialize: jest.fn() },
}));

import { eventBus } from '../../src/core/events/EventBus';
import { registerEventSubscribers } from '../../src/core/events/subscribers';

const handlerCount = (event: string): number =>
  ((eventBus as any).handlers.get(event) as Set<unknown> | undefined)?.size ?? 0;

describe('registerEventSubscribers: exactly-once registration', () => {
  it('registers on the first call and reports it', () => {
    expect(registerEventSubscribers()).toEqual({ registered: true });
    expect(handlerCount('learning.test_completed')).toBe(1);
  });

  it('THE REGRESSION: repeated bootstrap does not add a second handler', () => {
    // Simulates the same startup path running twice (double import, re-entrant bootstrap).
    expect(registerEventSubscribers()).toEqual({ registered: false });
    expect(registerEventSubscribers()).toEqual({ registered: false });

    expect(handlerCount('learning.test_completed')).toBe(1);
    expect(handlerCount('podcast.completed')).toBe(1);
    expect(handlerCount('podcast.failed')).toBe(1);
    expect(handlerCount('user.registered')).toBe(1);
    expect(handlerCount('notebook.ingested')).toBe(1);
  });
});

/**
 * The existing consumers must still fire exactly once each — the behaviour the double-delivery
 * fix established, re-proven now that registration happens at bootstrap.
 */
describe('existing consumers still fire exactly once after bootstrap registration', () => {
  let notifications: number;
  const count = () => { notifications++; };

  beforeEach(() => {
    registerEventSubscribers(); // no-op after the first suite; that is the point
    notifications = 0;
    eventBus.on('notification.created', count);
  });

  afterEach(() => {
    eventBus.off('notification.created', count);
  });

  it('user.registered produces exactly one notification', async () => {
    await eventBus.publish('user.registered', { userId: 'u1', email: 'a@b.c' });
    expect(notifications).toBe(1);
  });

  it('podcast.completed produces exactly one notification', async () => {
    await eventBus.publish('podcast.completed', { podcastId: 'p1', userId: 'u1', durationMs: 60000 });
    expect(notifications).toBe(1);
  });

  it('podcast.failed produces exactly one notification', async () => {
    await eventBus.publish('podcast.failed', { podcastId: 'p1', userId: 'u1', error: 'boom' });
    expect(notifications).toBe(1);
  });

  it('notebook.ingested produces exactly one notification', async () => {
    await eventBus.publish('notebook.ingested', { notebookId: 'n1', userId: 'u1' });
    expect(notifications).toBe(1);
  });

  it('four publishes produce exactly four notifications, not eight', async () => {
    for (let i = 0; i < 4; i++) {
      await eventBus.publish('user.registered', { userId: `u${i}`, email: 'a@b.c' });
    }
    expect(notifications).toBe(4);
  });
});
