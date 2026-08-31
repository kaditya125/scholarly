import { container, TOKENS } from './container';
import { bootstrapDI } from './registry';

/**
 * The initialization contract for anything that runs application services OUTSIDE server.ts.
 *
 * ── THE INCIDENT THIS EXISTS TO PREVENT ───────────────────────────────────────────────────
 * A diagnostic probe imported studentContext.service directly under `tsx` and called
 * aggregateContext(). Because nothing had run bootstrapDI(), the container was empty and
 * fetchAnalytics threw:
 *
 *     Dependency not found for token: Symbol(IMemoryProvider)
 *
 * The service caught it, logged a warning and returned null — its designed degradation. The probe
 * printed "analytics: null" and that was reported as a PRODUCTION DEFECT affecting every student.
 * It was not. server.ts calls bootstrapDI() at line 15, before routes are required and long
 * before app.listen(), and the running server has never logged that error.
 *
 * The bug was in the probe, and the cost was a false production diagnosis. What made it possible
 * is that an unbootstrapped container fails exactly like a broken one: quietly, through a
 * degradation path that is correct behaviour when a provider is genuinely unavailable.
 *
 * ── WHAT THIS IS, AND IS NOT ──────────────────────────────────────────────────────────────
 * It is a thin, idempotent wrapper over the PRODUCTION bootstrapDI(). It is deliberately not a
 * second registration system: a probe that registers its own providers proves nothing about the
 * application, and a second source of truth for provider wiring would drift from the first.
 *
 *     Production   server.ts → bootstrapDI() → application
 *     Diagnostic   probe     → bootstrapForProbe() → bootstrapDI() → application services
 *
 * One source of truth, entered from two places.
 */

let bootstrapped = false;

/**
 * Initialize the production DI graph for a diagnostic, script or integration run.
 *
 * Idempotent: bootstrapDI() constructs fresh provider instances on every call, so running it
 * twice would silently replace singletons that callers may already hold a reference to. Safe to
 * call at the top of every probe without checking first.
 */
export function bootstrapForProbe(): void {
  if (bootstrapped) return;
  bootstrapDI();
  bootstrapped = true;
}

/** True once the production DI graph has been initialized in this process, by any route. */
export function isDIReady(): boolean {
  try {
    container.resolve(TOKENS.MemoryProvider);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fail loudly, and say what the failure does NOT mean.
 *
 * Call at the top of any probe that touches DI-dependent services. The message matters as much as
 * the throw: the original incident was not caused by a missing error, it was caused by a real
 * error being misread as evidence about production. Anyone who hits this should immediately know
 * it says nothing about production health.
 */
export function assertDIReady(probeName = 'this diagnostic'): void {
  if (isDIReady()) return;
  throw new Error(
    [
      '',
      'DI BOOTSTRAP REQUIRED',
      '',
      `${probeName} depends on the application DI container, which has not been initialized.`,
      'Call bootstrapForProbe() from core/di/probeBootstrap before invoking application services.',
      '',
      'THIS FAILURE DOES NOT REPRESENT PRODUCTION HEALTH.',
      'server.ts calls bootstrapDI() before routes are loaded; a standalone script does not.',
      '',
    ].join('\n'),
  );
}
