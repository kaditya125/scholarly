/**
 * Live test for admin notebook operations: list, detail, archive, rename, delete + RBAC.
 * Start server first: $env:PORT='8081'; npx tsx src/server.ts
 */
import { auth } from '../config/firebase';

const BASE = process.env.E2E_BASE || 'http://localhost:8081';
const WEB_API_KEY = 'AIzaSyC9zvzKpYi0gu_z3L1IAWSCfdMSzK3OhzM';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name} ${detail}`);
  cond ? pass++ : fail++;
};

async function idToken(uid: string, role?: string): Promise<string> {
  const t = await auth.createCustomToken(uid, role ? { role } : {});
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, returnSecureToken: true }) });
  const d: any = await res.json();
  if (!d.idToken) throw new Error('token exchange failed');
  return d.idToken;
}

async function main() {
  const userTok = await idToken('nb-admin-test-owner', 'student');
  const superTok = await idToken('nb-admin-test-super', 'super_admin');
  const adminTok = await idToken('nb-admin-test-admin', 'admin');
  const uAuth: any = { Authorization: `Bearer ${userTok}`, 'Content-Type': 'application/json' };
  const sAuth: any = { Authorization: `Bearer ${superTok}`, 'Content-Type': 'application/json' };
  const aAuth: any = { Authorization: `Bearer ${adminTok}`, 'Content-Type': 'application/json' };

  // Create a notebook as a normal user.
  const created = await fetch(`${BASE}/api/notebooks`, { method: 'POST', headers: uAuth, body: JSON.stringify({ title: 'Admin Ops Test NB', color: 'bg-indigo-500' }) });
  const nb: any = await created.json();
  check('create notebook = 201', created.status === 201, `(id=${nb?.id})`);
  const id = nb.id;

  // Admin detail (ownership-agnostic).
  const detail = await fetch(`${BASE}/api/admin/notebooks/${id}`, { headers: sAuth });
  const dBody: any = await detail.json();
  check('GET /admin/notebooks/:id = 200', detail.status === 200, `(title=${dBody?.notebook?.title}, sources=${dBody?.sources?.length})`);

  // Archive.
  const arch = await fetch(`${BASE}/api/admin/notebooks/${id}`, { method: 'PATCH', headers: sAuth, body: JSON.stringify({ isArchived: true }) });
  const archBody: any = await arch.json();
  check('PATCH archive = 200', arch.status === 200 && archBody.isArchived === true, `(isArchived=${archBody?.isArchived})`);

  // Verify archive persisted.
  const detail2: any = await (await fetch(`${BASE}/api/admin/notebooks/${id}`, { headers: sAuth })).json();
  check('detail reflects archived', detail2?.notebook?.isArchived === true, `(isArchived=${detail2?.notebook?.isArchived})`);

  // Rename.
  const ren = await fetch(`${BASE}/api/admin/notebooks/${id}`, { method: 'PATCH', headers: sAuth, body: JSON.stringify({ title: 'Renamed By Admin' }) });
  check('PATCH rename = 200', ren.status === 200);
  const detail3: any = await (await fetch(`${BASE}/api/admin/notebooks/${id}`, { headers: sAuth })).json();
  check('detail reflects rename', detail3?.notebook?.title === 'Renamed By Admin', `(title=${detail3?.notebook?.title})`);

  // RBAC: delete as plain admin (not super) -> 403.
  const delAdmin = await fetch(`${BASE}/api/admin/notebooks/${id}`, { method: 'DELETE', headers: aAuth });
  check('DELETE as admin (non-super) = 403', delAdmin.status === 403, `(got ${delAdmin.status})`);

  // Delete as super_admin -> 200.
  const del = await fetch(`${BASE}/api/admin/notebooks/${id}`, { method: 'DELETE', headers: sAuth });
  check('DELETE as super_admin = 200', del.status === 200, `(got ${del.status})`);

  // Confirm gone.
  const gone = await fetch(`${BASE}/api/admin/notebooks/${id}`, { headers: sAuth });
  check('detail after delete = 404', gone.status === 404, `(got ${gone.status})`);

  console.log(`\n=== NOTEBOOK ADMIN OPS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('test error:', e); process.exit(1); });
