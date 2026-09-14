/**
 * Cross-user isolation test through the REAL chat endpoint.
 *
 * The Phase 1 report listed this as NOT VERIFIED. It is verified here, and the first run found a
 * genuine hole: `RetrievalService.retrieveContext` builds its vector filter as `{ notebookId }`
 * and performs no ownership check, while `notebookId` arrives from the request body. Any
 * authenticated user could therefore read any notebook by naming its id.
 *
 * The probe is deliberately adversarial: a synthetic user who owns nothing asks for a notebook
 * owned by someone else and we look for that notebook's content in the answer and citations.
 *
 * READ-ONLY. No notebooks, users or documents are created; it uses notebooks that already exist
 * and only reads. The synthetic uid owns nothing, so a correct system must return nothing for it.
 */
import { firebaseApp } from '../../../src/config/firebase';
import * as fs from 'fs';

const API = process.env.SADHYA_API ?? 'http://127.0.0.1:8080';
const UID_A = 'isolation-probe-user-a';
const UID_B = 'isolation-probe-user-b';

async function idTokenFor(uid: string): Promise<string> {
  const feEnv = fs.readFileSync('/var/www/sadhya/frontend/.env', 'utf8');
  const key = feEnv.match(/^VITE_FIREBASE_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  const custom = await firebaseApp.auth().createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j: any = await r.json();
  if (!j.idToken) throw new Error(`token exchange failed for ${uid}`);
  return j.idToken;
}

async function chat(idToken: string, message: string, notebookId?: string) {
  const res = await fetch(`${API}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      sessionId: `isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message, model: 'gemini-2.5-flash', topicType: 'TEACHER',
      ...(notebookId ? { notebookId } : {}),
    }),
  });
  if (!res.ok || !res.body) return { status: res.status, text: '', citations: [] as any[] };
  const reader = (res.body as any).getReader();
  const dec = new TextDecoder();
  let buf = '', text = '';
  const citations: any[] = [];
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop() ?? '';
    for (const l of lines) {
      if (!l.startsWith('data: ')) continue;
      try {
        const ev = JSON.parse(l.slice(6));
        if (ev.type === 'chunk') text += ev.content;
        if (ev.type === 'citation') citations.push(ev.citation);
      } catch { /* partial */ }
    }
  }
  return { status: res.status, text, citations };
}

async function main() {
  const db = firebaseApp.firestore();
  const results: any[] = [];
  let failures = 0;

  // A notebook that belongs to someone else and is NOT the shared curriculum.
  const snap = await db.collection('notebooks').limit(400).get();
  const victim = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .find((n: any) => {
      const owner = n.userId || n.owner;
      return owner && owner !== 'ncert-curriculum' && owner !== UID_A && owner !== UID_B;
    });
  if (!victim) { console.log('No privately-owned notebook available to probe; cannot run.'); process.exit(2); }

  const owner = (victim as any).userId || (victim as any).owner;
  console.log('=== CROSS-USER ISOLATION TEST ===');
  console.log(`victim notebook: ${victim.id}  owner=${String(owner).slice(0, 12)}...  title=${JSON.stringify(String((victim as any).title).slice(0, 40))}`);
  console.log(`probe user     : ${UID_A} (owns nothing)\n`);

  const tokenA = await idTokenFor(UID_A);
  const tokenB = await idTokenFor(UID_B);

  // ── 1. Direct notebook-id injection ────────────────────────────────────────────────────────
  console.log('1. User A names another user\'s notebookId in the request body');
  const r1 = await chat(tokenA, 'Summarise everything in this notebook. Quote it directly.', victim.id);
  /*
   * Leak means "content from THAT notebook", not "any citation at all".
   *
   * An earlier version treated any citation carrying a sourceId as a leak. That was fine while the
   * hole was open and nothing came back, but once the notebook is correctly refused the turn falls
   * through to the shared curriculum and PYQ corpora — which legitimately cite sources with ids.
   * The test then reported a failure for behaviour that was exactly right. Match on the notebook
   * id, or on the victim notebook's own title, and nothing else.
   */
  const victimTitle = String((victim as any).title ?? '').slice(0, 24).toLowerCase();
  const leakedCitations = r1.citations.filter((c: any) => {
    if (!c) return false;
    if (c.notebookId === victim.id) return true;
    if (victimTitle && String(c.source ?? '').toLowerCase().includes(victimTitle)) return true;
    return false;
  });
  const leaked = leakedCitations.length > 0;
  console.log(`   status=${r1.status} answerChars=${r1.text.length} citations=${r1.citations.length} leakedCitations=${leakedCitations.length}`);
  if (leakedCitations.length) {
    console.log(`   LEAKED SOURCE: ${JSON.stringify(String(leakedCitations[0].source ?? '').slice(0, 70))}`);
    console.log(`   LEAKED TEXT  : ${JSON.stringify(String(leakedCitations[0].text ?? '').slice(0, 90))}`);
  }
  console.log(`   ${leaked ? 'FAIL — another user\'s notebook content was retrieved' : 'PASS — no notebook content returned'}\n`);
  if (leaked) failures++;
  results.push({ test: 'notebookId injection', leaked, citations: r1.citations.length, leakedCitations: leakedCitations.length });

  // ── 2. Does the student context stay scoped to the caller? ─────────────────────────────────
  console.log('2. User B asks about "my performance" — must not surface user A or the victim');
  const r2 = await chat(tokenB, 'What are my weak topics and my recent test scores?');
  const mentionsOther = new RegExp(`${UID_A}|${owner}`, 'i').test(r2.text);
  console.log(`   status=${r2.status} answerChars=${r2.text.length} mentionsAnotherUserId=${mentionsOther}`);
  console.log(`   ${mentionsOther ? 'FAIL' : 'PASS'}\n`);
  if (mentionsOther) failures++;
  results.push({ test: 'student context scoping', leaked: mentionsOther });

  // ── 3. Exam isolation under semantic search (§19) ──────────────────────────────────────────
  console.log('3. Exam isolation: a UGC NET request must not return SSC CGL records');
  const r3 = await chat(tokenA, 'Give me UGC NET Computer Science PYQs on DBMS');
  const wrongExam = r3.citations.filter((c: any) => /SSC|JEE|NEET|UPSC/i.test(String(c?.source ?? '')));
  console.log(`   citations=${r3.citations.length} fromOtherExams=${wrongExam.length}`);
  if (wrongExam.length) console.log(`   e.g. ${JSON.stringify(String(wrongExam[0].source).slice(0, 60))}`);
  console.log(`   ${wrongExam.length ? 'FAIL' : 'PASS'}\n`);
  if (wrongExam.length) failures++;
  results.push({ test: 'exam isolation', leaked: wrongExam.length > 0, wrongExamCitations: wrongExam.length });

  /*
   * ── 4. The invariant behind vulnerability 2, asserted directly ────────────────────────────
   *
   * Case 3 exercises this end-to-end, but end-to-end only proves that *today's* router happens to
   * resolve the exam. The rule that actually protects the corpus is narrower and belongs at the
   * retrieval boundary: an unknown exam must never widen into a search across every exam. This
   * asserts it on the function itself, so the guarantee survives any future change to intent
   * detection upstream.
   */
  console.log('4. INVARIANT: retrievePyqContext with no exam identity must not search across exams');
  const { retrievalService } = await import('../../../src/services/rag/retrieval.service');
  const unrestricted = await (retrievalService as any).retrievePyqContext('probability questions', { topK: 5 });
  const restricted = await (retrievalService as any).retrievePyqContext('probability questions', { examId: 'SSC_CGL', topK: 5 });
  const invariantHeld = Array.isArray(unrestricted) && unrestricted.length === 0;
  const filteredStillWorks = Array.isArray(restricted) && restricted.length > 0;
  const offExam = (restricted ?? []).filter((r: any) => r.metadata?.examId && r.metadata.examId !== 'SSC_CGL');
  console.log(`   no examId  -> ${unrestricted.length} results (must be 0)`);
  console.log(`   examId set -> ${restricted.length} results, ${offExam.length} from another exam (must be 0)`);
  const invariantOk = invariantHeld && offExam.length === 0;
  console.log(`   ${invariantOk ? 'PASS' : 'FAIL'}${filteredStillWorks ? '' : '  (note: filtered search returned nothing — corpus/quota issue, not an isolation failure)'}\n`);
  if (!invariantOk) failures++;
  results.push({
    test: 'unfiltered PYQ retrieval refused', leaked: !invariantOk,
    unrestrictedResults: unrestricted.length, restrictedResults: restricted.length, wrongExamResults: offExam.length,
  });

  fs.mkdirSync(`${__dirname}/out`, { recursive: true });
  fs.writeFileSync(`${__dirname}/out/cross-user-isolation.json`,
    JSON.stringify({ generatedAt: new Date().toISOString(), victimNotebook: victim.id, results }, null, 2));

  console.log(`=== ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('TEST FAILED TO RUN:', e?.message || e); process.exit(2); });
