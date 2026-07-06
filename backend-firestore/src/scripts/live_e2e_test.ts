/**
 * Live end-to-end smoke test.
 * Mints a real Firebase ID token (custom token -> signInWithCustomToken) and exercises
 * the running server (localhost:8080), including the Phase-2 auth/ownership behavior
 * and a live Groq chat stream. Run the server first: `npx tsx src/server.ts`.
 */
import { auth } from '../config/firebase';

const BASE = process.env.E2E_BASE || 'http://localhost:8080';
// Firebase Web API key (public identifier from frontend/src/lib/firebase.ts)
const WEB_API_KEY = 'AIzaSyC9zvzKpYi0gu_z3L1IAWSCfdMSzK3OhzM';
const TEST_UID = 'live-e2e-test-user';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'}: ${name} ${detail}`);
  cond ? pass++ : fail++;
};

async function getIdToken(uid: string): Promise<string> {
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) }
  );
  const data: any = await res.json();
  if (!data.idToken) throw new Error('Token exchange failed: ' + JSON.stringify(data));
  return data.idToken;
}

async function main() {
  // 1. Health (no auth)
  const health = await fetch(`${BASE}/health`);
  check('GET /health = 200', health.status === 200, `(got ${health.status})`);

  // 2. Protected route WITHOUT token -> 401 (verifies requireAuth)
  const noAuth = await fetch(`${BASE}/api/chat/sessions`);
  check('GET /api/chat/sessions without token = 401', noAuth.status === 401, `(got ${noAuth.status})`);

  // Mint a real Firebase ID token
  const idToken = await getIdToken(TEST_UID);
  console.log('   (obtained a real Firebase ID token)');
  const authH: any = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };

  // 3. Protected route WITH token -> 200
  const sessions = await fetch(`${BASE}/api/chat/sessions`, { headers: authH });
  check('GET /api/chat/sessions with token = 200', sessions.status === 200, `(got ${sessions.status})`);

  // 4. Notebook creation (real Firestore write, identity from token)
  const nb = await fetch(`${BASE}/api/notebooks`, { method: 'POST', headers: authH, body: JSON.stringify({ title: 'E2E Test Notebook', color: 'bg-indigo-500' }) });
  const nbData: any = await nb.json().catch(() => ({}));
  check('POST /api/notebooks = 201', nb.status === 201, `(got ${nb.status}, id=${nbData?.id ?? 'n/a'})`);

  // 5. enforceSelf: own userId is allowed (404 is fine = reached controller, no timetable yet)
  const plannerSelf = await fetch(`${BASE}/api/planner/${TEST_UID}/timetable`, { headers: authH });
  check('GET /api/planner/{self}/timetable NOT blocked (not 401/403)', plannerSelf.status !== 401 && plannerSelf.status !== 403, `(got ${plannerSelf.status})`);

  // 6. enforceSelf: another userId is forbidden -> 403
  const plannerOther = await fetch(`${BASE}/api/planner/some-other-user/timetable`, { headers: authH });
  check('GET /api/planner/{other}/timetable = 403 (enforceSelf)', plannerOther.status === 403, `(got ${plannerOther.status})`);

  // 7. Live chat stream (Groq generation via WorkflowEngine)
  console.log('\n--- Live chat stream (Groq) ---');
  const chatRes = await fetch(`${BASE}/api/chat/stream`, {
    method: 'POST', headers: authH,
    body: JSON.stringify({ sessionId: 'e2e-' + Date.now(), message: "In one sentence, what is Newton's first law of motion?", model: 'groq', topicType: 'chat' }),
  });
  check('POST /api/chat/stream = 200 (SSE)', chatRes.status === 200, `(got ${chatRes.status})`);

  let chunks = 0, gotDone = false, text = '';
  if (chatRes.body) {
    const reader = (chatRes.body as any).getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop() || '';
      for (const line of parts) {
        if (!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if (d === '[DONE]') { gotDone = true; continue; }
        try { const e = JSON.parse(d); if (e.type === 'chunk') { chunks++; text += e.content || ''; } if (e.type === 'done') gotDone = true; } catch {}
      }
    }
  }
  check('chat stream produced token chunks', chunks > 0, `(chunks=${chunks})`);
  check('chat stream completed ([DONE]/done)', gotDone);
  console.log('   AI reply (first 240 chars):', JSON.stringify(text.slice(0, 240)));

  console.log(`\n=== LIVE E2E RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('E2E error:', e); process.exit(1); });
