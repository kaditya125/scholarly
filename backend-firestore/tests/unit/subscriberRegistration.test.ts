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
// Bootstrap also starts the automation trigger dispatcher — a separate, legitimate consumer of
// several of these events. Its workflow lookup reads Firestore (which hangs without credentials);
// no workflows are configured here, so it evaluates nothing.
jest.mock('../../src/core/automation/engine/AutomationExecutionRepository', () => ({
  automationExecutionRepository: { listWorkflows: jest.fn().mockResolvedValue([]) },
}));

import { eventBus } from '../../src/core/events/EventBus';
import { registerEventSubscribers } from '../../src/core/events/subscribers';

const handlerCount = (event: string): number =>
  ((eventBus as any).handlers.get(event) as Set<unknown> | undefined)?.size ?? 0;

const EVENTS = ['learning.test_completed', 'podcast.completed', 'podcast.failed', 'user.registered', 'notebook.ingested'];
let afterFirst: Record<string, number>;

describe('registerEventSubscribers: exactly-once registration', () => {
  it('registers on the first call and reports it', () => {
    expect(registerEventSubscribers()).toEqual({ registered: true });
    afterFirst = Object.fromEntries(EVENTS.map((e) => [e, handlerCount(e)]));
    // One app subscriber per event, plus the automation dispatcher on the events it triggers on
    // (learning.test_completed, user.registered) — distinct consumers, not duplicates.
    expect(afterFirst).toEqual({
      'learning.test_completed': 2, 'podcast.completed': 1, 'podcast.failed': 1, 'user.registered': 2, 'notebook.ingested': 1,
    });
  });

  it('THE REGRESSION: repeated bootstrap does not add a second handler', () => {
    // Simulates the same startup path running twice (double import, re-entrant bootstrap).
    expect(registerEventSubscribers()).toEqual({ registered: false });
    expect(registerEventSubscribers()).toEqual({ registered: false });

    for (const e of EVENTS) expect(handlerCount(e)).toBe(afterFirst[e]);
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
