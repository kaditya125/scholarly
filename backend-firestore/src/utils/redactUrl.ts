/**
 * Redacts credentials from a connection URL before it reaches a log.
 *
 * WHY THIS EXISTS. Both `[EventBus] Redis Pub/Sub connected successfully to ${redisUrl}` and
 * `[BackgroundQueue] Initialized … Connecting to ${env.REDIS_URL}` wrote the FULL Upstash
 * connection string at every boot — including the password. Anyone with PM2 log access, log
 * shipping, or a support bundle had the live Redis credential, and it was reprinted on every
 * restart. Found while reading boot logs during the J.10 deployment verification.
 *
 * Keeps the parts that make a log useful — scheme, host, port, database — and removes only the
 * secret. A log line that says nothing at all is its own problem: the point is to be able to see
 * WHICH Redis the process attached to without shipping the key to read it.
 */

/**
 * `rediss://default:SECRET@host:6379/0` → `rediss://default:***@host:6379/0`
 *
 * Falls back to a scheme-only description when the value will not parse, because a malformed URL
 * must never be echoed verbatim on the assumption that it contains nothing sensitive.
 */
export function redactUrlCredentials(raw: string | undefined | null): string {
  const value = String(raw ?? '').trim();
  if (!value) return '(unset)';

  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    // A bare userinfo with no password can still be identifying; the username is kept because it is
    // usually a fixed role name ("default") and is what distinguishes one deployment from another.
    return url.toString();
  } catch {
    /*
     * Unparseable. Report the scheme ONLY when there genuinely is one.
     *
     * The first version did `value.split('://')[0]` unconditionally — but with no `://` present
     * that returns the WHOLE string, and a token like `garbage-gQAAAA…` matched the scheme regex
     * (letters, digits and hyphens are all legal in a scheme), so the secret was echoed by the very
     * function meant to redact it. Caught by its own test. The delimiter must exist, and the scheme
     * is length-capped so a long secret cannot masquerade as one.
     */
    const idx = value.indexOf('://');
    if (idx > 0 && idx <= 12) {
      const scheme = value.slice(0, idx);
      if (/^[a-z][a-z0-9+.-]*$/i.test(scheme)) return `${scheme}://<unparseable, redacted>`;
    }
    return '<redacted>';
  }
}
