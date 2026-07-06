/**
 * Live admin API smoke test.
 * Mints real Firebase ID tokens (with a `role` custom claim) and exercises every
 * /api/admin endpoint against the running server, verifying RBAC and that each
 * module returns REAL data (or an honest empty result). Start the server first:
 *   npx tsx src/server.ts
 */
import { auth } from '../config/firebase';

const BASE = process.env.E2E_BASE || 'http://localhost:8080';
const WEB_API_KEY = 'AIzaSyC9zvzKpYi0gu_z3L1IAWSCfdMSzK3OhzM';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name} ${detail}`);
  cond ? pass++ : fail++;
};

async function idTokenWithRole(uid: string, role?: string): Promise<string> {
  const claims = role ? { role } : {};
  const customToken = await auth.createCustomToken(uid, claims);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) }
  );
  const data: any = await res.json();
  if (!data.idToken) throw new Error('Token exchange failed: ' + JSON.stringify(data));
  return data.idToken;
}

const GET_ENDPOINTS = [
  '/api/admin/metrics/ai',
  '/api/admin/metrics/costs',
  '/api/admin/system/health',
  '/api/admin/evaluation',
  '/api/admin/curriculum/jobs',
  '/api/admin/knowledge-graph/nodes',
  '/api/admin/vector-db/namespaces',
  '/api/admin/prompts',
  '/api/admin/assets',
  '/api/admin/notebooks',
  '/api/admin/feature-flags',
  '/api/admin/users',
  '/api/admin/security/threats',
  '/api/admin/logs',
  '/api/admin/notifications',
  '/api/admin/backups',
  '/api/admin/settings',
];

function summarize(url: string, body: any): string {
  try {
    if (url.endsWith('/metrics/ai')) return `requestsToday=${body.requestsToday}, providers=${body.providers?.length}, timeline=${body.timeline?.length}`;
    if (url.endsWith('/metrics/costs')) return `total=$${body.totalCostUSD}, records=${body.recordCount}, dailyPoints=${body.dailyCosts?.length}`;
    if (url.endsWith('/system/health')) return `status=${body.status}, uptime=${body.uptimeSeconds}s, services=${body.services?.length}, heap=${body.memory?.heapUsedMB}MB`;
    if (url.endsWith('/evaluation')) return `score=${body.overallScore}, feedback7d=${body.evaluationsThisWeek}, failures=${body.recentFailures?.length}`;
    if (url.endsWith('/curriculum/jobs')) return `jobs=${body.jobs?.length}, totalSources=${body.stats?.totalSources}`;
    if (url.endsWith('/knowledge-graph/nodes')) return `nodes=${body.stats?.totalNodes}, edges=${body.stats?.totalEdges}, sample=${body.nodes?.length}`;
    if (url.endsWith('/vector-db/namespaces')) return `index=${body.indexName}, dim=${body.dimension}, totalVectors=${body.totalVectors}, ns=${body.namespaces?.length}`;
    if (url.endsWith('/prompts')) return `prompts=${body.prompts?.length}, experiments=${body.experiments?.length}`;
    if (url.endsWith('/assets')) return `assets=${body.assets?.length}`;
    if (url.endsWith('/notebooks')) return `total=${body.stats?.totalNotebooks}, sample=${body.notebooks?.length}`;
    if (url.endsWith('/feature-flags')) return `flags=${body.flags?.length}`;
    if (url.endsWith('/users')) return `users=${body.users?.length}, total=${body.stats?.totalUsers}, staff=${body.stats?.staffAndAdmins}`;
    if (url.endsWith('/security/threats')) return `threats=${body.threats?.length}, passRate=${body.stats?.guardrailPassRate}%`;
    if (url.endsWith('/logs')) return `logs=${body.logs?.length}, source=${body.source}`;
    if (url.endsWith('/notifications')) return `notifications=${body.notifications?.length}`;
    if (url.endsWith('/backups')) return `supported=${body.supported}, backups=${body.backups?.length}`;
    if (url.endsWith('/settings')) return `env=${body.settings?.environment}, model=${body.settings?.chatModel}, flags=${body.featureFlags?.length}`;
  } catch { /* ignore */ }
  return JSON.stringify(body).slice(0, 120);
}

async function main() {
  console.log('=== LIVE ADMIN API TEST ===\n');

  // 1. No token -> 401
  const noAuth = await fetch(`${BASE}/api/admin/users`);
  check('GET /api/admin/users without token = 401', noAuth.status === 401, `(got ${noAuth.status})`);

  // 2. Non-admin role (student) -> 403
  const studentToken = await idTokenWithRole('live-admin-test-student', 'student');
  const studentRes = await fetch(`${BASE}/api/admin/users`, { headers: { Authorization: `Bearer ${studentToken}` } });
  check('GET /api/admin/users as student = 403', studentRes.status === 403, `(got ${studentRes.status})`);

  // 3. No role claim -> 403
  const noRoleToken = await idTokenWithRole('live-admin-test-norole');
  const noRoleRes = await fetch(`${BASE}/api/admin/users`, { headers: { Authorization: `Bearer ${noRoleToken}` } });
  check('GET /api/admin/users with no role = 403', noRoleRes.status === 403, `(got ${noRoleRes.status})`);

  // 4. Admin role -> 200 on every endpoint, with real data summary
  const adminToken = await idTokenWithRole('live-admin-test-admin', 'admin');
  const authH: any = { Authorization: `Bearer ${adminToken}` };
  console.log('\n--- Admin token (role=admin) against every module ---');
  for (const url of GET_ENDPOINTS) {
    try {
      const res = await fetch(`${BASE}${url}`, { headers: authH });
      let body: any = {};
      try { body = await res.json(); } catch { /* non-json */ }
      check(`GET ${url} = 200`, res.status === 200, `-> ${res.status === 200 ? summarize(url, body) : 'HTTP ' + res.status}`);
    } catch (e) {
      check(`GET ${url} = 200`, false, `(error: ${(e as Error).message})`);
    }
  }

  // 5. Moderator role also allowed
  const modToken = await idTokenWithRole('live-admin-test-mod', 'moderator');
  const modRes = await fetch(`${BASE}/api/admin/settings`, { headers: { Authorization: `Bearer ${modToken}` } });
  check('GET /api/admin/settings as moderator = 200', modRes.status === 200, `(got ${modRes.status})`);

  // 6. Feature flag toggle (PATCH) round-trip
  const flagsRes = await fetch(`${BASE}/api/admin/feature-flags`, { headers: authH });
  const flagsBody: any = await flagsRes.json().catch(() => ({}));
  const firstFlag = flagsBody.flags?.[0];
  if (firstFlag) {
    const target = !firstFlag.enabled;
    const patch = await fetch(`${BASE}/api/admin/feature-flags/${firstFlag.name}`, {
      method: 'PATCH', headers: { ...authH, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: target }),
    });
    const patchBody: any = await patch.json().catch(() => ({}));
    check(`PATCH /api/admin/feature-flags/${firstFlag.name} = 200`, patch.status === 200, `(set enabled=${patchBody.enabled})`);
    // revert
    await fetch(`${BASE}/api/admin/feature-flags/${firstFlag.name}`, {
      method: 'PATCH', headers: { ...authH, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: firstFlag.enabled }),
    });
  } else {
    console.log('   (no feature flags returned to toggle)');
  }

  console.log(`\n=== ADMIN API RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Admin test error:', e); process.exit(1); });
