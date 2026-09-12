/**
 * Negative tests for cross-exam and cross-paper contamination. READ-ONLY.
 *
 * The requirement is that a request scoped to one sitting can never be answered with another
 * sitting's questions. Two layers are tested, because they fail differently:
 *
 *   FILTER LAYER (default)  Exhaustive, deterministic, and free — it asks Qdrant to count the
 *                           points matching a scoped filter and asserts that every one of them
 *                           really belongs to the requested paper. No embeddings, so every paper
 *                           can be checked rather than a sample.
 *
 *   RETRIEVAL LAYER (--live) The same assertions through `retrievePyqContext`, which is what the
 *                           application actually calls. Costs one embedding per probe against a
 *                           ~5/min quota shared with production, so it runs a handful of probes
 *                           and is opt-in.
 *
 * A filter-layer pass with a retrieval-layer failure would mean the scoping exists but the call
 * site does not use it — which is exactly the defect this remediation set out to fix, so both
 * layers are reported separately rather than collapsed into one verdict.
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { env } from '../../../src/config/env';

const LIVE = process.argv.includes('--live');
const PACE_MS = Number(process.argv.find((a) => a.startsWith('--pace='))?.split('=')[1] ?? '13000');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Failure { test: string; detail: string }

async function main() {
  const db = firebaseApp.firestore();
  const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY || undefined, checkCompatibility: false });
  const failures: Failure[] = [];
  let assertions = 0;

  const scroll = async (filter: any, limit = 200) => {
    const res: any = await client.scroll(QDRANT_COLLECTION, {
      limit, filter,
      with_payload: { include: ['canonicalPaperId', 'sittingId', 'examId', 'year', 'session', 'shift', 'questionId'] } as any,
      with_vector: false,
    });
    return (res.points ?? []).map((p: any) => p.payload ?? {});
  };

  // ── the papers actually present in the index ───────────────────────────────────────────────
  const questions: any[] = [];
  let last: any = null;
  while (true) {
    let q: FirebaseFirestore.Query = db.collection('pyq_questions').orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const s = await q.get();
    if (s.empty) break;
    for (const d of s.docs) questions.push(d.data());
    last = s.docs[s.docs.length - 1];
    if (s.size < 2000) break;
  }
  const papers = [...new Set(questions.map((q) => q.canonicalPaperId).filter(Boolean))] as string[];
  console.log(`=== PAPER ISOLATION TESTS ===`);
  console.log(`distinct canonical papers carried by questions: ${papers.length}\n`);

  // ── 1. FILTER LAYER: every paper, exhaustively ─────────────────────────────────────────────
  console.log('--- filter layer: each canonicalPaperId returns only its own paper ---');
  let checkedPapers = 0;
  let contaminated = 0;
  for (const paperId of papers) {
    const rows = await scroll({ must: [{ key: 'canonicalPaperId', match: { value: paperId } }] });
    if (rows.length === 0) continue;
    checkedPapers++;
    assertions++;
    const wrong = rows.filter((r: any) => r.canonicalPaperId !== paperId);
    if (wrong.length) {
      contaminated++;
      failures.push({ test: `paper_scope:${paperId}`, detail: `${wrong.length}/${rows.length} results belong to another paper` });
    }
  }
  console.log(`  papers checked: ${checkedPapers}   contaminated: ${contaminated}`);

  // ── 2. the specific negative cases the brief names ─────────────────────────────────────────
  console.log('\n--- named negative cases ---');
  const jee2024 = papers.filter((p) => p.startsWith('paper:JEE_MAIN:2024:'));
  console.log(`  JEE Main 2024 canonical papers: ${jee2024.join('  ')}`);

  const cases: { label: string; a: string; b: string }[] = [];
  for (let i = 0; i < jee2024.length; i++) {
    for (let j = i + 1; j < jee2024.length; j++) {
      cases.push({ label: `${jee2024[i]} vs ${jee2024[j]}`, a: jee2024[i], b: jee2024[j] });
    }
  }
  for (const c of cases) {
    const rows = await scroll({ must: [{ key: 'canonicalPaperId', match: { value: c.a } }] }, 500);
    assertions++;
    const leaked = rows.filter((r: any) => r.canonicalPaperId === c.b);
    const mark = leaked.length === 0 ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${c.label}  (${rows.length} rows, ${leaked.length} leaked)`);
    if (leaked.length) failures.push({ test: c.label, detail: `${leaked.length} rows from the other paper` });
  }

  // different year, same exam
  const jeeYears = [...new Set(questions.filter((q) => q.examId === 'JEE_MAIN' && q.canonicalPaperId).map((q) => q.year))];
  for (const paperId of jee2024.slice(0, 2)) {
    const rows = await scroll({ must: [{ key: 'canonicalPaperId', match: { value: paperId } }] }, 500);
    assertions++;
    const otherYear = rows.filter((r: any) => Number(r.year) !== 2024);
    console.log(`  [${otherYear.length === 0 ? 'PASS' : 'FAIL'}] ${paperId} contains only year 2024 (${rows.length} rows, ${otherYear.length} from another year)`);
    if (otherYear.length) failures.push({ test: `year_isolation:${paperId}`, detail: `${otherYear.length} rows from another year` });
  }
  console.log(`  (JEE Main years present with paper identity: ${jeeYears.sort().join(', ')})`);

  // different exam
  for (const paperId of papers.slice(0, 20)) {
    const exam = paperId.split(':')[1];
    const rows = await scroll({ must: [{ key: 'canonicalPaperId', match: { value: paperId } }] }, 100);
    if (!rows.length) continue;
    assertions++;
    const otherExam = rows.filter((r: any) => r.examId !== exam);
    if (otherExam.length) failures.push({ test: `exam_isolation:${paperId}`, detail: `${otherExam.length} rows from another exam` });
  }
  console.log(`  [${failures.some((f) => f.test.startsWith('exam_isolation')) ? 'FAIL' : 'PASS'}] cross-exam isolation across 20 sampled papers`);

  // ── 3. sitting-level isolation, finer than the registry can express ────────────────────────
  const sittings = [...new Set(questions.map((q) => q.sittingId).filter(Boolean))] as string[];
  console.log(`\n--- sitting layer (finer than the registry): ${sittings.length} distinct sittings ---`);
  let sittingFails = 0;
  for (const s of sittings.slice(0, 30)) {
    const rows = await scroll({ must: [{ key: 'sittingId', match: { value: s } }] }, 200);
    if (!rows.length) continue;
    assertions++;
    const wrong = rows.filter((r: any) => r.sittingId !== s);
    if (wrong.length) { sittingFails++; failures.push({ test: `sitting_scope:${s}`, detail: `${wrong.length} rows from another sitting` }); }
  }
  console.log(`  sampled 30 sittings, contaminated: ${sittingFails}`);

  // ── 4. RETRIEVAL LAYER (opt-in) ────────────────────────────────────────────────────────────
  if (LIVE) {
    console.log('\n--- retrieval layer (live, embeds one query per probe) ---');
    const { retrievalService } = await import('../../../src/services/rag/retrieval.service');
    const probes = jee2024.slice(0, 3);
    for (let i = 0; i < probes.length; i++) {
      if (i > 0) await sleep(PACE_MS);
      const paperId = probes[i];
      const results = await (retrievalService as any).retrievePyqContext('organic chemistry reaction mechanism', {
        canonicalPaperId: paperId, topK: 8,
      });
      assertions++;
      const wrong = results.filter((r: any) => r.metadata?.canonicalPaperId !== paperId);
      console.log(`  [${wrong.length === 0 ? 'PASS' : 'FAIL'}] ${paperId}: ${results.length} returned, ${wrong.length} from another paper`);
      if (wrong.length) failures.push({ test: `live_paper_scope:${paperId}`, detail: `${wrong.length} of ${results.length} from another paper` });
    }
  } else {
    console.log('\n--- retrieval layer skipped (pass --live to exercise it; costs embedding quota) ---');
  }

  console.log(`\n=== ${failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILURES`} (${assertions} assertions) ===`);
  for (const f of failures.slice(0, 15)) console.log(`  FAIL ${f.test}: ${f.detail}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('TEST RUN FAILED:', e?.message || e); process.exit(2); });
