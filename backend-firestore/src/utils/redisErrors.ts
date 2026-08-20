import { SocketClosedUnexpectedlyError, ConnectionTimeoutError } from 'redis';

/**
 * Classifies transient Redis *infrastructure* disconnects.
 *
 * WHY THIS EXISTS: production restarted roughly every six hours. A managed-Redis TLS connection
 * that had been idle was dropped by the provider; node-redis surfaced that as
 * SocketClosedUnexpectedlyError, and because the process-level uncaughtException handler only
 * recognised ECONNRESET / EPIPE / ETIMEDOUT it fell through to a graceful shutdown and PM2
 * restarted the API.
 *
 * That mattered well beyond the dropped requests: the EventBus is deliberately at-most-once with
 * no replay, so every restart is a window in which a published learning event can be lost. The
 * durable-evidence reconciliation is what recovers from that, but the correct fix is not to lean
 * on recovery — it is to stop treating a routine reconnect as a fatal fault.
 *
 * IDENTIFICATION IS STRUCTURAL, NOT STRING-BASED. `instanceof` is checked first: `redis`
 * re-exports the very same class object as `@redis/client` (verified), and the dependency tree
 * resolves to a single copy, so the check is reliable. `constructor.name` is checked next to
 * survive a future duplicate copy of the package, where `instanceof` would silently fail across
 * realms. Note that `err.name` is useless here — these classes never assign it, so it is the
 * inherited `'Error'`. The message comparison is last and exact, purely as a backstop.
 *
 * Deliberately NARROW. It matches connection-lifecycle faults that node-redis recovers from by
 * reconnecting on its own. It does NOT match ClientClosedError or ClientOfflineError (those mean
 * the application used a client it had already closed — a real bug, and it should stay fatal),
 * and it does not match command or reply errors.
 */
export function isTransientRedisDisconnect(err: unknown): boolean {
  if (!err) return false;

  if (err instanceof SocketClosedUnexpectedlyError) return true;
  if (err instanceof ConnectionTimeoutError) return true;

  const ctor = (err as any)?.constructor?.name;
  if (ctor === 'SocketClosedUnexpectedlyError' || ctor === 'ConnectionTimeoutError') return true;

  // Socket-level codes raised by Node itself rather than by node-redis. These were already
  // treated as transient before this change; kept so the classification is in one place.
  const code = String((err as any)?.code || '').toUpperCase();
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ETIMEDOUT') return true;

  const message = String((err as any)?.message || '');
  if (message === 'Socket closed unexpectedly' || message === 'Connection timeout') return true;

  // Node surfaces these as message text on some socket paths, with no `code` set.
  const lower = message.toLowerCase();
  return lower.includes('econnreset') || lower.includes('epipe') || lower.includes('etimedout');
}
