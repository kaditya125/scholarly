/**
 * Phase 2 audit: corpus utilization, metadata completeness, syllabus wiring, paper identity.
 * STRICTLY READ-ONLY — no writes to Firestore, no writes to Qdrant, no embeddings spent.
 *
 * Every figure is recomputed from live data. Counts are deliberately not compared against any
 * previously-reported number: the corpus nearly doubled between two audits a day apart, so a
 * constant baked into this script would be wrong before it was useful.
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { toQdrantId } from '../../../src/services/rag/qdrantFilter';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { env } from '../../../src/config/env';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.join(__dirname, 'out', 'phase2-corpus-audit.json');
const derive = (qid: string) => toQdrantId(env.PINECONE_NAMESPACE, `vec_${qid.replace(/[^a-zA-Z0-9_-]/g, '_')}`);

const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';
const hasList = (v: any) =>
  Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : false);

async function main() {
  const db = firebaseApp.firestore();
  const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY || undefined, checkCompatibility: false });

  // ── load ───────────────────────────────────────────────────────────────────────────────────
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
    process.stderr.write(`\r  loading ${questions.length}`);
  }
  process.stderr.write('\r');

  const pointIds = new Set<string>();
  let offset: any = undefined;
  while (true) {
    const res: any = await client.scroll(QDRANT_COLLECTION, {
      limit: 2000, offset, with_payload: { include: ['content_type'] } as any, with_vector: false,
    });
    for (const p of res.points ?? []) if (p.payload?.content_type === 'pyq') pointIds.add(String(p.id));
    offset = res.next_page_offset;
    if (!offset) break;
  }

  console.log(`=== PHASE 2 CORPUS AUDIT ===`);
  console.log(`questions ${questions.length}   pyq vectors ${pointIds.size}\n`);

  // ── §2 per-exam utilization + metadata completeness ────────────────────────────────────────
  const FIELDS: Array<[string, (q: any) => boolean]> = [
    ['text', (q) => has(q.questionText) && String(q.questionText).trim().length > 5],
    ['options', (q) => hasList(q.options)],
    ['answer', (q) => has(q.correctAnswer)],
    ['explanation', (q) => has(q.explanation) || has(q.solution)],
    ['provenance', (q) => Array.isArray(q.provenanceRecords) && q.provenanceRecords.length > 0],
    ['year', (q) => has(q.year)],
    ['paper', (q) => has(q.paper)],
    ['shift/session', (q) => has(q.shift) || has(q.session)],
    ['subject', (q) => has(q.subject)],
    ['topic', (q) => has(q.topic)],
    ['difficulty', (q) => has(q.difficulty)],
    ['questionType', (q) => has(q.questionType)],
    ['syllabusNode', (q) => has(q.syllabusNodeId)],
    ['canonicalPaper', (q) => has(q.canonicalPaperId)],
  ];

  const byExam = new Map<string, any[]>();
  for (const q of questions) {
    const k = String(q.examId ?? 'undefined');
    if (!byExam.has(k)) byExam.set(k, []);
    byExam.get(k)!.push(q);
  }

  const examRows: any[] = [];
  console.log('--- per-exam coverage ---');
  console.log(`  ${'exam'.padEnd(14)} ${'canon'.padStart(7)} ${'vectors'.padStart(8)} ${'cover'.padStart(7)}  ${'missing'.padStart(7)}`);
  for (const [exam, list] of [...byExam.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const vec = list.filter((q) => pointIds.has(derive(q.questionId))).length;
    const cover = list.length ? (vec / list.length) * 100 : 0;
    console.log(`  ${exam.padEnd(14)} ${String(list.length).padStart(7)} ${String(vec).padStart(8)} ${cover.toFixed(1).padStart(6)}% ${String(list.length - vec).padStart(8)}`);
    const meta: Record<string, number> = {};
    for (const [name, fn] of FIELDS) meta[name] = list.filter(fn).length;
    examRows.push({ exam, canonical: list.length, vectors: vec, coveragePercent: +cover.toFixed(2), missingVectors: list.length - vec, metadata: meta });
  }

  console.log('\n--- metadata completeness (% of that exam) ---');
  const header = FIELDS.map(([n]) => n.slice(0, 6).padStart(7)).join('');
  console.log(`  ${'exam'.padEnd(14)}${header}`);
  for (const r of examRows) {
    const cells = FIELDS.map(([n]) => {
      const pct = r.canonical ? (r.metadata[n] / r.canonical) * 100 : 0;
      return `${pct.toFixed(0)}%`.padStart(7);
    }).join('');
    console.log(`  ${r.exam.padEnd(14)}${cells}`);
  }

  // ── §5 syllabus wiring ─────────────────────────────────────────────────────────────────────
  console.log('\n--- syllabus collections ---');
  const syllabi = (await db.collection('exam_syllabi').limit(500).get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const graphs = await db.collection('exam_syllabi_graphs').limit(50).get();
  const exams = (await db.collection('exams').limit(200).get()).docs.map((d) => d.id);
  console.log(`  exams              ${exams.length}`);
  console.log(`  exam_syllabi       ${syllabi.length}`);
  console.log(`  exam_syllabi_graphs ${graphs.size}`);
  const syllabusExams = [...new Set(syllabi.map((s: any) => s.examId).filter(Boolean))];
  console.log(`  syllabi cover exams: ${JSON.stringify(syllabusExams.slice(0, 20))}`);
  const corpusExams = [...byExam.keys()];
  const syllabusMissing = corpusExams.filter((e) => !syllabusExams.includes(e));
  console.log(`  corpus exams WITHOUT a syllabus: ${JSON.stringify(syllabusMissing)}`);
  if (syllabi[0]) {
    console.log(`  syllabus doc fields: ${Object.keys(syllabi[0]).sort().join(', ')}`);
  }

  // ── §12 paper identity: where do the counts disagree? ──────────────────────────────────────
  console.log('\n--- paper identity: canonical groups holding more than the registry expects ---');
  const registry = (await db.collection('pyq_source_registry').get()).docs.map((d) => d.data() as any);
  const expectedFor = new Map<string, number>();
  for (const s of registry) {
    if (typeof s.questionCountDiscovered === 'number' && s.questionCountDiscovered > 0) {
      const k = `${s.examId}|${s.year}`;
      expectedFor.set(k, Math.max(expectedFor.get(k) ?? 0, s.questionCountDiscovered));
    }
  }
  const byPaper = new Map<string, any[]>();
  for (const q of questions) {
    if (!q.canonicalPaperId) continue;
    if (!byPaper.has(q.canonicalPaperId)) byPaper.set(q.canonicalPaperId, []);
    byPaper.get(q.canonicalPaperId)!.push(q);
  }
  const overloaded: any[] = [];
  for (const [paperId, list] of byPaper) {
    const [, exam, year] = paperId.split(':');
    const expected = expectedFor.get(`${exam}|${year}`) ?? null;
    const sittings = [...new Set(list.map((q) => q.sittingId).filter(Boolean))];
    const dates = [...new Set(list.map((q) => q.normalizedSittingDate).filter(Boolean))];
    if (expected && list.length > expected * 1.2) {
      overloaded.push({ paperId, records: list.length, expected, distinctSittings: sittings.length, distinctDates: dates.slice(0, 8), sittingIds: sittings.slice(0, 6) });
    }
  }
  overloaded.sort((a, b) => b.records - a.records);
  console.log(`  canonical papers holding >120% of the registry's expected count: ${overloaded.length}`);
  for (const o of overloaded.slice(0, 10)) {
    console.log(`    ${o.paperId.padEnd(44)} records=${String(o.records).padStart(4)} expected=${String(o.expected).padStart(4)} sittings=${o.distinctSittings} dates=${JSON.stringify(o.distinctDates)}`);
  }

  // Do dated sittings actually separate them cleanly?
  console.log('\n--- would a date-bearing identity separate these? ---');
  for (const o of overloaded.slice(0, 4)) {
    const list = byPaper.get(o.paperId)!;
    const bySitting = new Map<string, number>();
    for (const q of list) bySitting.set(String(q.sittingId ?? '(no sittingId)'), (bySitting.get(String(q.sittingId ?? '(no sittingId)')) ?? 0) + 1);
    console.log(`  ${o.paperId}`);
    for (const [sid, n] of [...bySitting.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`      ${sid.padEnd(40)} ${n}`);
    }
  }

  // ── mapping provenance: is topic source-derived or inferred? (§6) ──────────────────────────
  console.log('\n--- topic mapping provenance (§6) ---');
  const withTopic = questions.filter((q) => has(q.topic));
  const withNode = questions.filter((q) => has(q.syllabusNodeId));
  console.log(`  questions with a topic        : ${withTopic.length} (${((withTopic.length / questions.length) * 100).toFixed(1)}%)`);
  console.log(`  questions with syllabusNodeId : ${withNode.length} (${((withNode.length / questions.length) * 100).toFixed(1)}%)`);
  const mappingFields = ['topicSource', 'topicMappingStatus', 'mappingConfidence', 'topicOrigin'];
  for (const f of mappingFields) {
    const n = questions.filter((q) => has(q[f])).length;
    console.log(`  field '${f}': ${n > 0 ? `${n} present` : 'ABSENT from schema'}`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totals: { questions: questions.length, pyqVectors: pointIds.size },
    perExam: examRows,
    syllabus: { exams: exams.length, syllabi: syllabi.length, graphs: graphs.size, syllabusExams, corpusExamsWithoutSyllabus: syllabusMissing },
    paperIdentity: { overloadedPapers: overloaded },
    topicMapping: { withTopic: withTopic.length, withSyllabusNode: withNode.length },
  }, null, 2));
  console.log(`\n-> ${OUT}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
