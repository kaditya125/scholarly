/**
 * Regression tests for the EventBus delivery contract.
 *
 * Written against the concrete failure found in production verification: 4 publishes produced 8
 * handler invocations, because subscribe() registered each handler both in the handlers Map and
 * as an EventEmitter listener, and executeHandlers() dispatched through both paths.
 *
 * These run with NODE_ENV=test, so EventBus skips Redis and publish() dispatches in-process.
 * That exercises the dispatch logic — which is where the duplication lived — without depending
 * on a Redis instance. The Redis path calls the same executeHandlers(), so dispatch correctness
 * is shared; what these cannot cover is genuine cross-process delivery.
 */
import { EventBus } from '../../src/core/events/EventBus';

describe('EventBus dispatch: exactly one invocation per handler per event', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  afterEach(async () => {
    await bus.close().catch(() => {});
  });

  it('invokes a subscribe() handler exactly once per publish', async () => {
    let calls = 0;
    bus.subscribe('user.registered', async () => { calls++; });

    await bus.publish('user.registered', { userId: 'u1', email: 'a@b.c' });

    expect(calls).toBe(1);
  });

  it('THE REGRESSION: 4 publishes produce exactly 4 invocations, not 8', async () => {
    let calls = 0;
    bus.subscribe('user.registered', async () => { calls++; });

    for (let i = 0; i < 4; i++) {
      await bus.publish('user.registered', { userId: `u${i}`, email: 'a@b.c' });
    }

    expect(calls).toBe(4);
  });

  it('invokes each of several distinct handlers exactly once', async () => {
    const calls: string[] = [];
    bus.subscribe('user.registered', async () => { calls.push('a'); });
    bus.subscribe('user.registered', async () => { calls.push('b'); });

    await bus.publish('user.registered', { userId: 'u1', email: 'a@b.c' });

    expect(calls.sort()).toEqual(['a', 'b']);
  });

  it('does not invoke handlers registered for a different event', async () => {
    let calls = 0;
    bus.subscribe('podcast.failed', async () => { calls++; });

    await bus.publish('user.registered', { userId: 'u1', email: 'a@b.c' });

    expect(calls).toBe(0);
  });

  it('awaits async subscribe() handlers before publish resolves', async () => {
    // The handlers Map path awaits; the old EventEmitter path did not. A handler that has not
    // finished when publish() resolves is how evidence writes got lost mid-flight.
    let finished = false;
    bus.subscribe('user.registered', async () => {
      await new Promise((r) => setTimeout(r, 30));
      finished = true;
    });

    await bus.publish('user.registered', { userId: 'u1', email: 'a@b.c' });

    expect(finished).toBe(true);
  });

  it('one throwing handler does not prevent others from running', async () => {
    let survivorRan = false;
    bus.subscribe('user.registered', async () => { throw new Error('boom'); });
    bus.subscribe('user.registered', async () => { survivorRan = true; });

    await expect(
      bus.publish('user.registered', { userId: 'u1', email: 'a@b.c' }),
    ).resolves.not.toThrow();
    expect(survivorRan).toBe(true);
  });

  it('raw .on() listeners still receive events (EventEmitter API preserved)', async () => {
    let onCalls = 0;
    bus.on('user.registered', () => { onCalls++; });

    await bus.publish('user.registered', { userId: 'u1', email: 'a@b.c' });

    expect(onCalls).toBe(1);
  });
});
