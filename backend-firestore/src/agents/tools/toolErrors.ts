import { FailureClass } from '../runtime/agent.types';

/**
 * A classified tool failure. Tools throw this (or anything else, which gets classified) and the
 * ToolExecutor decides whether to retry from `failureClass` alone — never from message wording
 * at the call site.
 */
export class ToolError extends Error {
  readonly failureClass: FailureClass;

  constructor(failureClass: FailureClass, message: string) {
    super(message);
    this.name = 'ToolError';
    this.failureClass = failureClass;
  }
}

/** Failure classes worth another attempt. Everything else is final on the first occurrence. */
export const RETRYABLE_FAILURES: ReadonlySet<FailureClass> = new Set<FailureClass>(['timeout', 'rate_limit', 'network']);

/**
 * Classify an arbitrary error. Providers and the existing services surface transient problems as
 * text (Google often reports 429/503 only in the message), so the text is inspected as a last
 * resort — after a typed ToolError and after HTTP-ish status/code fields.
 */
export function classifyError(err: unknown): FailureClass {
  if (err instanceof ToolError) return err.failureClass;
  const e = err as any;
  if (e?.name === 'AbortError') return 'cancelled';

  const status = e?.status ?? e?.statusCode ?? e?.response?.status ?? e?.code;
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'permission';
  if (status === 404) return 'not_found';
  if (typeof status === 'number' && status >= 500 && status < 600) return 'network';
  if (typeof e?.code === 'string' && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE'].includes(e.code)) {
    return 'network';
  }

  const msg = String(e?.message ?? e ?? '');
  if (/timed out|timeout/i.test(msg)) return 'timeout';
  if (/\b429\b|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(msg)) return 'rate_limit';
  if (/\b50[0-4]\b|UNAVAILABLE|ECONNRESET|socket hang up|network|fetch failed/i.test(msg)) return 'network';
  if (/permission|forbidden|not allowed|access denied/i.test(msg)) return 'permission';
  if (/is required|invalid|must be|no query supplied/i.test(msg)) return 'validation';
  return 'internal';
}

/** Student-safe wording per failure class — shown in "what failed" lists, never raw error text. */
export function describeFailure(failureClass: FailureClass): string {
  switch (failureClass) {
    case 'validation': return 'the request was not in a form this step can use';
    case 'permission': return 'that material is not available to your account';
    case 'not_found': return 'the material was not found';
    case 'timeout': return 'the step took too long';
    case 'rate_limit': return 'the AI service was busy';
    case 'network': return 'a service could not be reached';
    case 'cancelled': return 'the task was stopped';
    case 'budget': return 'the task reached its size limit';
    default: return 'an unexpected error occurred';
  }
}
