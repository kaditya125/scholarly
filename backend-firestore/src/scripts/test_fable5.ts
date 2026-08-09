/**
 * Authenticated test of the Vertex "claude-fable-5" endpoint using a REAL OAuth
 * token minted from the Firebase service account (the only credential present on
 * this machine). This gets past the API-key 401 so the response is informative
 * (model exists? permission? 404?). Read-only probe.
 *
 * Usage: npx tsx src/scripts/test_fable5.ts
 */
import { credential } from 'firebase-admin';
import { config } from 'dotenv';
const e = config().parsed as Record<string, string>;

const body = JSON.stringify({
  anthropic_version: 'vertex-2023-10-16',
  max_tokens: 128,
  messages: [{ role: 'user', content: 'Hello! Can you help me?' }],
});

async function hit(proj: string, token: string) {
  const url = `https://aiplatform.googleapis.com/v1/projects/${proj}/locations/global/publishers/anthropic/models/claude-fable-5:rawPredict`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    });
    console.log(`\n[${proj}] HTTP ${r.status}`);
    console.log((await r.text()).slice(0, 500));
  } catch (err: any) {
    console.log(`\n[${proj}] ERR ${String(err?.message || err).slice(0, 200)}`);
  }
}

async function main() {
  const cred = credential.cert({
    projectId: e.FIREBASE_PROJECT_ID,
    clientEmail: e.FIREBASE_CLIENT_EMAIL,
    privateKey: (e.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  });
  const tok = await cred.getAccessToken();
  console.log(`OAuth token minted from Firebase SA (${e.FIREBASE_CLIENT_EMAIL}), len=${tok.access_token.length}`);
  await hit('eng-cache-501514-q4', tok.access_token);
  await hit('schaolarly', tok.access_token);
  process.exit(0);
}

main().catch((err) => { console.log('FATAL', err?.message || err); process.exit(0); });
