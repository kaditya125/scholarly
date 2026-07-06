/**
 * Verifies that a live AI chat request is now recorded in the Firestore telemetry
 * that the Admin AI Monitoring dashboard reads. Start the server first (port 8081):
 *   $env:PORT='8081'; npx tsx src/server.ts
 */
import { auth } from '../config/firebase';

const BASE = process.env.E2E_BASE || 'http://localhost:8081';
const WEB_API_KEY = 'AIzaSyC9zvzKpYi0gu_z3L1IAWSCfdMSzK3OhzM';

async function idToken(uid: string, role?: string): Promise<string> {
  const t = await auth.createCustomToken(uid, role ? { role } : {});
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, returnSecureToken: true }) });
  const d: any = await res.json();
  if (!d.idToken) throw new Error('token exchange failed: ' + JSON.stringify(d));
  return d.idToken;
}

async function getMetrics(adminAuth: string) {
  const r = await fetch(`${BASE}/api/admin/metrics/ai`, { headers: { Authorization: `Bearer ${adminAuth}` } });
  return r.json() as any;
}

async function main() {
  const adminTok = await idToken('verify-telemetry-admin', 'super_admin');
  const userTok = await idToken('verify-telemetry-user', 'student');

  const before = await getMetrics(adminTok);
  console.log(`BEFORE: requestsToday=${before.requestsToday}, providers=${before.providers?.length}`);

  // Fire a real chat request through the workflow.
  console.log('Sending a live chat request...');
  const chat = await fetch(`${BASE}/api/chat/stream`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userTok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'telemetry-verify-' + Date.now(), message: 'In one sentence, what is Ohm\'s law?', model: 'groq', topicType: 'chat' }),
  });
  console.log(`  chat HTTP ${chat.status}`);
  // Drain the SSE stream to completion.
  let chunks = 0;
  if (chat.body) {
    const reader = (chat.body as any).getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const s = dec.decode(value, { stream: true });
      chunks += (s.match(/"type":"chunk"/g) || []).length;
    }
  }
  console.log(`  streamed ~${chunks} chunk events`);

  // Telemetry is written fire-and-forget after the stream; give Firestore a moment.
  await new Promise((r) => setTimeout(r, 5000));

  const after = await getMetrics(adminTok);
  console.log(`AFTER:  requestsToday=${after.requestsToday}, providers=${after.providers?.length}, avgLatencyMs=${after.avgLatencyMs}, totalTokensToday=${after.totalTokensToday}, totalCostToday=${after.totalCostToday}`);
  if (after.providers?.length) {
    console.log('  provider breakdown:', JSON.stringify(after.providers));
  }

  const ok = (after.requestsToday ?? 0) > (before.requestsToday ?? 0);
  console.log(ok ? '\n✅ PASS: live chat request was recorded in telemetry.' : '\n❌ FAIL: requestsToday did not increase.');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('verify error:', e); process.exit(1); });
