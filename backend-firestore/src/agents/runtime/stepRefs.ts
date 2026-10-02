import { StepInputRef } from './agent.types';

/**
 * Step input references: `{ "$ref": "resolve_exam", "path": "examId" }` in a step's input means
 * "the `examId` field of step resolve_exam's output". Only whole values can be references (no
 * string templating), which keeps validation and resolution trivially auditable.
 */

export function isStepInputRef(value: unknown): value is StepInputRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as any).$ref === 'string' &&
    Object.keys(value as object).every((k) => k === '$ref' || k === 'path')
  );
}

/** Every reference in an input object (top-level values only — nested refs are not supported). */
export function collectRefs(input: Record<string, unknown>): Array<{ key: string; ref: StepInputRef }> {
  const refs: Array<{ key: string; ref: StepInputRef }> = [];
  for (const [key, value] of Object.entries(input)) {
    if (isStepInputRef(value)) refs.push({ key, ref: value });
  }
  return refs;
}

/** Read a dotted path (`a.b.0.c`) from a value. Returns undefined when any segment is missing. */
export function readPath(value: unknown, path?: string): unknown {
  if (!path) return value;
  let cur: any = value;
  for (const segment of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[segment];
  }
  return cur;
}

export class UnresolvedRefError extends Error {
  constructor(readonly key: string, readonly ref: StepInputRef) {
    super(`input "${key}" references ${ref.$ref}${ref.path ? `.${ref.path}` : ''}, which produced no value`);
    this.name = 'UnresolvedRefError';
  }
}

/**
 * Replace references with the referenced outputs. A reference that resolves to null/undefined is
 * an error (the dependent step is skipped) — passing `examId: null` into a tool that requires an
 * exam is exactly how an unfiltered search happens.
 */
export function resolveStepInput(
  input: Record<string, unknown>,
  outputs: ReadonlyMap<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isStepInputRef(value)) {
      resolved[key] = value;
      continue;
    }
    const v = readPath(outputs.get(value.$ref), value.path);
    if (v === null || v === undefined) throw new UnresolvedRefError(key, value);
    resolved[key] = v;
  }
  return resolved;
}
