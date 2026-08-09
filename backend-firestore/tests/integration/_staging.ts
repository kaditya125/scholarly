/**
 * Shared harness for STAGING integration tests.
 *
 * These tests hit a REAL running backend with REAL Firestore/Pinecone/providers. They are
 * skip-guarded: unless `STAGING_BASE_URL` is set they are skipped entirely, so they never run
 * (and never falsely pass) in CI/unit runs. Run them explicitly against staging:
 *
 *   STAGING_BASE_URL=https://staging.example.com \
 *   STUDENT_A_TOKEN=... STUDENT_B_TOKEN=... NOTEBOOK_A_ID=... \
 *   npx jest tests/integration --runInBand
 *
 * No secrets are hard-coded; everything comes from the environment of the CI/staging job.
 */

export const STAGING_BASE_URL = process.env.STAGING_BASE_URL || '';

/** Use `stagingDescribe` instead of `describe` — it becomes `describe.skip` off-staging. */
export const stagingDescribe = STAGING_BASE_URL ? describe : describe.skip;

/** True only when a chaos proxy is wired in front of the dependencies (see tests/chaos). */
export const chaosEnabled = /^(1|true|yes|on)$/i.test(process.env.CHAOS_ENABLED || '');
export const chaosDescribe = STAGING_BASE_URL && chaosEnabled ? describe : describe.skip;

export const env = {
  studentAToken: () => process.env.STUDENT_A_TOKEN || '',
  studentBToken: () => process.env.STUDENT_B_TOKEN || '',
  notebookAId: () => process.env.NOTEBOOK_A_ID || '',
  sessionAId: () => process.env.SESSION_A_ID || '',
};

export interface StagingResponse {
  status: number;
  ok: boolean;
  text: string;
  json: any;
}

/** Minimal authed fetch against staging. Uses global fetch (Node 18+/20 CI). */
export async function call(
  method: string,
  path: string,
  opts: { token?: string; body?: any; headers?: Record<string, string> } = {},
): Promise<StagingResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await fetch(`${STAGING_BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON (e.g. SSE) */ }
  return { status: res.status, ok: res.ok, text, json };
}
