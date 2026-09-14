/**
 * Data availability audit for the corpora the chat was tested against. READ-ONLY.
 *
 * The reported failure was the assistant inventing SSC CGL / UGC NET / GATE questions. Before
 * any conclusion about retrieval, this establishes what actually exists — an assistant cannot
 * retrieve a paper the corpus does not hold, and the fix for "missing" is not the same as the fix
 * for "present but unreachable".
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { env } from '../../../src/config/env';

async function main() {
  const db = firebaseApp.firestore();
  const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY || undefined, checkCompatibility: false });

  // ── every exam present in the question bank ────────────────────────────────────────────────
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

  const byExam = new Map<string, number>();
  for (const q of questions) byExam.set(String(q.examId), (byExam.get(String(q.examId)) ?? 0) + 1);
  console.log('=== EXAMS IN pyq_questions ===');
  for (const [k, v] of [...byExam.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(18)} ${v}`);

  // ── the three the user tested ──────────────────────────────────────────────────────────────
  const probe = (pattern: RegExp) => questions.filter((q) =>
    pattern.test(String(q.examId)) || pattern.test(String(q.examName ?? '')));
  console.log('\n=== THE THREE TESTED CORPORA ===');
  for (const [label, re] of [['UGC NET', /UGC|NET/i], ['GATE', /^GATE|_GATE|GATE_/i]] as [string, RegExp][]) {
    const hits = probe(re);
    console.log(`  ${label.padEnd(10)} questions=${hits.length}  ${hits.length ? `examIds=${JSON.stringify([...new Set(hits.map((h) => h.examId))])}` : 'NOT PRESENT IN CORPUS'}`);
  }

  // SSC CGL 2022 in detail — the exact request that was tested
  const ssc22 = questions.filter((q) => q.examId === 'SSC_CGL' && q.year === 2022);
  console.log(`\n=== SSC CGL 2022 (the exact tested request) ===`);
  console.log(`  questions: ${ssc22.length}`);
  const shifts = new Map<string, number>();
  for (const q of ssc22) shifts.set(String(q.shift ?? '(none)'), (shifts.get(String(q.shift ?? '(none)')) ?? 0) + 1);
  console.log(`  shifts:`);
  for (const [k, v] of [...shifts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${k.padEnd(26)} ${v}`);
  const subj = new Map<string, number>();
  for (const q of ssc22) subj.set(String(q.subject ?? '(none)'), (subj.get(String(q.subject ?? '(none)')) ?? 0) + 1);
  console.log(`  subjects: ${JSON.stringify([...subj.entries()])}`);
  const papers = new Map<string, number>();
  for (const q of ssc22) papers.set(String(q.canonicalPaperId ?? '(unresolved)'), (papers.get(String(q.canonicalPaperId ?? '(unresolved)')) ?? 0) + 1);
  console.log(`  canonical papers:`);
  for (const [k, v] of [...papers.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(42)} ${v}`);

  const withText = ssc22.filter((q) => q.questionText && String(q.questionText).trim().length > 10);
  const withOpts = ssc22.filter((q) => q.options && (Array.isArray(q.options) ? q.options.length : Object.keys(q.options).length) > 0);
  const withAns = ssc22.filter((q) => q.correctAnswer);
  const withProv = ssc22.filter((q) => Array.isArray(q.provenanceRecords) && q.provenanceRecords.length > 0);
  console.log(`  completeness: text=${withText.length}  options=${withOpts.length}  answer=${withAns.length}  provenance=${withProv.length}`);
  console.log(`  sample question: ${String(ssc22[0]?.questionText ?? '(none)').slice(0, 90)}`);
  console.log(`  sample options : ${JSON.stringify(ssc22[0]?.options ?? null).slice(0, 100)}`);
  console.log(`  sample answer  : ${ssc22[0]?.correctAnswer ?? '(none)'}  qNo=${ssc22[0]?.questionNumber}`);

  // ── syllabus corpora ───────────────────────────────────────────────────────────────────────
  console.log('\n=== SYLLABUS / EXAM COLLECTIONS ===');
  for (const col of ['exams', 'exam_syllabi', 'exam_syllabi_graphs', 'exam_official_sources', 'pyq_source_registry']) {
    try {
      const snap = await db.collection(col).limit(400).get();
      const ids = snap.docs.slice(0, 8).map((d) => d.id);
      console.log(`  ${col.padEnd(24)} docs=${snap.size}${snap.size === 400 ? '+' : ''}  e.g. ${ids.slice(0, 4).join(', ')}`);
    } catch (e: any) {
      console.log(`  ${col.padEnd(24)} ERROR ${e?.message?.slice(0, 50)}`);
    }
  }

  // which exams have a syllabus at all
  try {
    const ex = await db.collection('exams').limit(200).get();
    console.log(`\n  exams collection ids: ${ex.docs.map((d) => d.id).slice(0, 25).join(', ')}`);
  } catch {}

  // ── vector side ────────────────────────────────────────────────────────────────────────────
  const count = async (filter: any) => {
    const r: any = await (client as any).count(QDRANT_COLLECTION, { exact: true, filter });
    return r?.count ?? 0;
  };
  console.log('\n=== VECTOR SIDE (Qdrant) ===');
  for (const exam of ['SSC_CGL', 'JEE_MAIN', 'UPSC_CSE', 'NEET_UG', 'UGC_NET', 'GATE', 'GATE_CS']) {
    const n = await count({ must: [{ key: 'examId', match: { value: exam } }, { key: 'content_type', match: { value: 'pyq' } }] });
    console.log(`  ${exam.padEnd(12)} pyq vectors = ${n}`);
  }
  const ssc22vec = await count({ must: [
    { key: 'examId', match: { value: 'SSC_CGL' } },
    { key: 'year', match: { value: 2022 } },
    { key: 'content_type', match: { value: 'pyq' } },
  ] });
  console.log(`  SSC_CGL 2022 pyq vectors = ${ssc22vec}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
