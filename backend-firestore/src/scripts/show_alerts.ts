/**
 * Prints the live unresolved admin_alerts (what the dashboard "alerts" badge counts).
 */
import { auth } from '../config/firebase';

const BASE = process.env.E2E_BASE || 'http://localhost:8081';
const WEB_API_KEY = 'AIzaSyC9zvzKpYi0gu_z3L1IAWSCfdMSzK3OhzM';

async function main() {
  const custom = await auth.createCustomToken('show-alerts-admin', { role: 'super_admin' });
  const ex = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }) });
  const { idToken }: any = await ex.json();

  const res = await fetch(`${BASE}/api/admin/security/threats`, { headers: { Authorization: `Bearer ${idToken}` } });
  const data: any = await res.json();
  console.log('stats:', JSON.stringify(data.stats));
  console.log('threats:');
  (data.threats || []).forEach((t: any) => {
    console.log(`  [${t.severity}] ${t.type} — ${t.message}  (${t.timestamp ? new Date(t.timestamp).toLocaleString() : ''}) status=${t.status}`);
  });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
