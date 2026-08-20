/**
 * Redis transient-disconnect classification.
 *
 * Production restarted roughly every six hours: an idle managed-Redis TLS connection was dropped,
 * node-redis raised SocketClosedUnexpectedlyError, the process-level uncaughtException handler
 * recognised only ECONNRESET / EPIPE / ETIMEDOUT, and the API shut down. Because the EventBus is
 * at-most-once with no replay, every one of those restarts was a window in which a published
 * learning event could be lost.
 *
 * The contract these lock in: known transient disconnects are survivable, everything else is
 * still fatal, and none of this changes what a FAILED PUBLISH reports.
 */
import { SocketClosedUnexpectedlyError, ConnectionTimeoutError, ClientClosedError } from 'redis';
import { isTransientRedisDisconnect } from '../../src/utils/redisErrors';

describe('A. the exact production error is classified as transient', () => {
  it('THE REGRESSION: SocketClosedUnexpectedlyError is transient', () => {
    expect(isTransientRedisDisconnect(new SocketClosedUnexpectedlyError())).toBe(true);
  });

  it('is identified by class, not by message text', () => {
    // The real proof that this is structural: an error carrying a completely different message
    // is still recognised, because the class is what is being matched.
    const err = new SocketClosedUnexpectedlyError();
    (err as any).message = 'something else entirely';
    expect(isTransientRedisDisconnect(err)).toBe(true);
  });

  it('`name` is NOT usable for this — node-redis never assigns it', () => {
    // Documents why the implementation does not check err.name: these subclasses inherit 'Error'.
    expect(new SocketClosedUnexpectedlyError().name).toBe('Error');
  });

  it('still treats the previously-handled socket codes as transient', () => {
    expect(isTransientRedisDisconnect(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isTransientRedisDisconnect(Object.assign(new Error('x'), { code: 'EPIPE' }))).toBe(true);
    expect(isTransientRedisDisconnect(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toBe(true);
    expect(isTransientRedisDisconnect(new Error('read ECONNRESET'))).toBe(true);
  });

  it('treats a connection timeout as transient', () => {
    expect(isTransientRedisDisconnect(new ConnectionTimeoutError())).toBe(true);
  });

  it('survives a duplicate copy of the redis package, where instanceof would fail', () => {
    class SocketClosedUnexpectedlyError2 extends Error {
      constructor() { super('Socket closed unexpectedly'); }
    }
    Object.defineProperty(SocketClosedUnexpectedlyError2, 'name',
      { value: 'SocketClosedUnexpectedlyError' });
    const foreign = new SocketClosedUnexpectedlyError2();
    expect(foreign instanceof SocketClosedUnexpectedlyError).toBe(false); // different realm
    expect(isTransientRedisDisconnect(foreign)).toBe(true);
  });
});

describe('C. unrelated failures remain fatal and observable', () => {
  it('an ordinary programming error is NOT transient', () => {
    expect(isTransientRedisDisconnect(new TypeError('x is not a function'))).toBe(false);
  });

  it('a Firestore/permission failure is NOT transient', () => {
    expect(isTransientRedisDisconnect(Object.assign(new Error('PERMISSION_DENIED'), { code: 7 }))).toBe(false);
  });

  it('ClientClosedError is NOT transient — using a closed client is a real bug', () => {
    expect(isTransientRedisDisconnect(new ClientClosedError())).toBe(false);
  });

  it('a command/reply error is NOT transient', () => {
    expect(isTransientRedisDisconnect(new Error('ERR unknown command'))).toBe(false);
  });

  it('null/undefined are not transient', () => {
    expect(isTransientRedisDisconnect(null)).toBe(false);
    expect(isTransientRedisDisconnect(undefined)).toBe(false);
  });
});

describe('B. the handler keeps the process alive only for transient faults', () => {
  // Mirrors the branch in server.ts without booting the server: transient -> return (alive),
  // anything else -> shutdown.
  const decide = (err: unknown): 'ALIVE' | 'SHUTDOWN' =>
    isTransientRedisDisconnect(err) ? 'ALIVE' : 'SHUTDOWN';

  it('the production error keeps the API alive', () => {
    expect(decide(new SocketClosedUnexpectedlyError())).toBe('ALIVE');
  });

  it('an unexpected exception still shuts the process down', () => {
    expect(decide(new TypeError('boom'))).toBe('SHUTDOWN');
  });
});

/**
 * D. The stability fix must not have made a failed publish look successful. Delivery reporting is
 * the contract the durable-evidence reconciliation depends on: if publish() ever claimed success
 * on failure, a submission would be marked PROJECTED for an event that reached nobody.
 */
describe('D. EventBus failure semantics are unchanged by the resilience fix', () => {
  const { EventBus } = require('../../src/core/events/EventBus');

  it('a failed publish still reports non-success', async () => {
    const bus = new EventBus();
    const b = bus as any;
    b.isRedisConnected = true;
    b.pubClient = { publish: async () => { throw new SocketClosedUnexpectedlyError(); } };

    await expect(bus.publish('user.registered', { userId: 'u1', email: 'a@b.c' })).resolves.toBe(false);
    await bus.close().catch(() => {});
  });

  it('a transient Redis error does NOT get upgraded to a successful publish', async () => {
    // The specific hazard: "transient" must mean "the process survives", never "the publish
    // worked". Recovery stays the reconciliation layer's job.
    const bus = new EventBus();
    const b = bus as any;
    b.isRedisConnected = true;
    b.pubClient = { publish: async () => { throw new SocketClosedUnexpectedlyError(); } };

    const delivered = await bus.publish('learning.test_completed', {
      userId: 'u1', attemptId: 'a1', testId: 'a1', totalQuestions: 4,
      correctCount: 1, skippedCount: 0, accuracy: 25, occurredAt: Date.now(),
    } as any, { eventId: 'learning.test_completed:a1' });

    expect(delivered).toBe(false);
    expect(isTransientRedisDisconnect(new SocketClosedUnexpectedlyError())).toBe(true);
    await bus.close().catch(() => {});
  });

  it('a successful publish still reports success', async () => {
    const bus = new EventBus();
    bus.subscribe('user.registered', async () => {});
    await expect(bus.publish('user.registered', { userId: 'u1', email: 'a@b.c' })).resolves.toBe(true);
    await bus.close().catch(() => {});
  });
});
