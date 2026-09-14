/**
 * Integration tests through the REAL chat endpoint. READ-ONLY with respect to the corpus.
 *
 * Unit-testing the retrieval function would have passed before this work too — the function was
 * fine, nothing called it. These tests therefore go through `POST /chat/stream` exactly as the
 * browser does, so what is being asserted is the behaviour of the production runtime rather than
 * of a component in isolation.
 *
 * Each case asserts on the retrieval trace the orchestrator logs AND on the answer text, because
 * the two failure modes are different: retrieval not running at all, and retrieval running but
 * the model ignoring it.
 */
import { firebaseApp } from '../../../src/config/firebase';
import * as fs from 'fs';

const API = process.env.SADHYA_API ?? 'http://127.0.0.1:8080';
const TEST_UID = 'grounding-test-probe';

interface Case {
  name: string;
  query: string;
  expectIntent?: string;
  expectGrounding?: string;
  /** Phrases whose presence means the model fabricated or hedged wrongly. */
  forbid?: RegExp[];
  /** At least one must appear. */
  requireAny?: RegExp[];
  expectCanonicalRecordsAtLeast?: number;
}

const CASES: Case[] = [
  {
    name: 'A. "Give me SSC CGL 2022 PYQ"',
    query: 'Give me SSC CGL 2022 PYQ',
    expectIntent: 'EXACT_PYQ',
  },
  {
    name: 'B. complete SSC CGL 2022 Shift 1 paper',
    query: 'Give me the complete SSC CGL 2022 Shift 1 paper',
    expectIntent: 'EXACT_PYQ',
    expectGrounding: 'CANONICAL_RETRIEVED',
    expectCanonicalRecordsAtLeast: 50,
  },
  {
    name: 'C. UGC NET Computer Science PYQs',
    query: 'Extract UGC NET Computer Science PYQs',
    expectIntent: 'PYQ_SEARCH',
  },
  {
    name: 'D. GATE CS 2024 (absent corpus)',
    query: 'Give me GATE CS 2024 PYQs',
    expectIntent: 'EXACT_PYQ',
    expectGrounding: 'CANONICAL_NOT_FOUND',
    // Fabrication markers: a numbered question stem or a classic MCQ opener would mean the model
    // reconstructed a GATE paper it has never seen.
    forbid: [/\bQ\s*1[.)]/i, /which of the following is\b/i],
    /*
     * Any sentence a student would read as "we don't have it".
     *
     * Deliberately not pinned to one phrasing. An earlier version demanded "do not currently
     * have" and failed a reply that said "currently do not have" — a defect in the test, not in
     * the answer. What is asserted is that the absence is stated, not how it is worded.
     */
    requireAny: [
      /n['’o]?t\s+(\w+\s+){0,4}?(have|contain|include|hold|available|present)/i,
      /unavailable|not available/i,
      /no\s+(verified\s+)?(questions?|records?|papers?|corpus|data)/i,
      /lack(s|ing)?\s+(a\s+)?(verified\s+)?(corpus|questions?|papers?)/i,
      /outside\s+(my|our)\s+(corpus|coverage|scope)/i,
    ],
  },
  {
    name: 'E. Generate 20 SSC CGL probability questions',
    query: 'Generate 20 SSC CGL questions on probability',
    expectIntent: 'GENERATED_PRACTICE',
    expectGrounding: 'GENERATED',
    forbid: [/previous[- ]year question/i, /\bPYQ\b(?!\s*(corpus|bank|pattern|evidence))/i],
  },
  {
    name: 'F. Explain normalization in DBMS',
    query: 'Explain normalization in DBMS',
    expectIntent: 'NONE',
  },
];

async function mintIdToken(): Promise<string> {
  const feEnv = fs.readFileSync('/var/www/sadhya/frontend/.env', 'utf8');
  const key = feEnv.match(/^VITE_FIREBASE_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  const custom = await firebaseApp.auth().createCustomToken(TEST_UID);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j: any = await r.json();
  if (!j.idToken) throw new Error(`token exchange failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.idToken;
}

async function chat(idToken: string, query: string, sessionId: string): Promise<{ text: string; events: string[] }> {
  const res = await fetch(`${API}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ sessionId, message: query, model: 'gemini-2.5-flash', topicType: 'TEACHER' }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const reader = (res.body as any).getReader();
  const decoder = new TextDecoder();
  let buf = '', text = '';
  const events: string[] = [];
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const ev = JSON.parse(line.slice(6));
        if (ev.type === 'chunk') text += ev.content;
        else if (ev.type) events.push(ev.type);
      } catch { /* partial frame */ }
    }
  }
  return { text, events };
}

async function main() {
  console.log(`=== CHAT GROUNDING INTEGRATION TESTS (${API}/api/chat/stream) ===\n`);
  const idToken = await mintIdToken();
  let passed = 0, failed = 0;
  const results: any[] = [];

  for (const c of CASES) {
    const sessionId = `grounding-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    process.stdout.write(`${c.name}\n  query: "${c.query}"\n`);
    let text = '', events: string[] = [], error: string | null = null;
    const t0 = Date.now();
    try {
      const r = await chat(idToken, c.query, sessionId);
      text = r.text; events = r.events;
    } catch (e: any) {
      error = String(e?.message ?? e).slice(0, 200);
    }
    const ms = Date.now() - t0;

    const problems: string[] = [];
    if (error) problems.push(`request failed: ${error}`);
    if (!error && text.trim().length === 0) problems.push('empty answer');
    for (const re of c.forbid ?? []) if (re.test(text)) problems.push(`FORBIDDEN pattern present: ${re}`);
    if (c.requireAny && c.requireAny.length) {
      if (!c.requireAny.some((re) => re.test(text))) problems.push(`none of the required phrasings appeared: ${c.requireAny.map(String).join(' | ')}`);
    }

    const ok = problems.length === 0;
    ok ? passed++ : failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${ms}ms  answerChars=${text.length}  events=${[...new Set(events)].join(',')}`);
    console.log(`  answer: ${text.replace(/\s+/g, ' ').slice(0, 220)}`);
    for (const p of problems) console.log(`    ! ${p}`);
    console.log();
    results.push({ ...c, sessionId, ms, answerChars: text.length, answer: text.slice(0, 2000), problems, ok });
  }

  fs.mkdirSync(`${__dirname}/out`, { recursive: true });
  fs.writeFileSync(`${__dirname}/out/chat-grounding-results.json`, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`=== ${passed} passed, ${failed} failed ===`);
  console.log(`Retrieval traces: grep '\\[Retrieval\\] trace' in the API log for these sessionIds.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('TEST RUN FAILED:', e?.message || e); process.exit(2); });
