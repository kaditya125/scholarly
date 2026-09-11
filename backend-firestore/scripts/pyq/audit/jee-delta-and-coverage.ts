/**
 * Three things the reconciliation left open. READ-ONLY.
 *
 *   1. Exact decomposition of the JEE Main Qdrant-over-Firestore delta, to the last point.
 *   2. Cross-exam label skew: a vector whose payload names one exam while its Firestore question
 *      names another. This is the contamination risk, not a counting curiosity.
 *   3. Paper coverage against the source registry at EXAM+YEAR+SESSION+SHIFT+PAPER granularity,
 *      including an explicit state for every paper the previous audit listed as missing.
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { toQdrantId } from '../../../src/services/rag/qdrantFilter';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { env } from '../../../src/config/env';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.join(__dirname, 'out', 'jee-delta-and-coverage.json');

const derive = (questionId: string) =>
  toQdrantId(env.PINECONE_NAMESPACE, `vec_${questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);

/** Normalisers that do not destroy the raw value — used only for comparison, never written back. */
const shiftNo = (v?: string | null): number | null => {
  if (!v) return null;
  const m = String(v).match(/shift\s*(\d+)/i) || String(v).match(/^\s*(\d+)\s*$/);
  return m ? Number(m[1]) : null;
};
const sessionNos = (v?: string | null): number[] => {
  if (!v || !/session/i.test(String(v))) return [];
  return Array.from(String(v).matchAll(/\d+/g), (m) => Number(m[0]));
};

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
  }
  const sources = (await db.collection('pyq_source_registry').get()).docs.map((d) => d.data() as any);

  const points: { id: string; payload: any }[] = [];
  let offset: any = undefined;
  while (true) {
    const res: any = await client.scroll(QDRANT_COLLECTION, {
      limit: 2000, offset,
      with_payload: { include: ['content_type', 'vectorKind', 'questionId', 'examId', 'year', 'session', 'shift', 'paper', 'subject', 'corpusBucket'] } as any,
      with_vector: false,
    });
    for (const p of res.points ?? []) points.push({ id: String(p.id), payload: p.payload ?? {} });
    offset = res.next_page_offset;
    if (!offset) break;
  }
  const pyqPoints = points.filter(
    (p) => p.payload.content_type === 'pyq' || p.payload.vectorKind === 'CANONICAL_PYQ_QUESTION' || p.payload.vectorKind === 'PRACTICE_QUESTION',
  );
  console.log(`firestore=${questions.length}  qdrant-pyq=${pyqPoints.length}  registry=${sources.length}\n`);

  // uuidv5 is not free; derive once per question and carry it, rather than inside every loop.
  const qByDerived = new Map<string, any>();
  for (const q of questions) {
    q.__pid = derive(q.questionId);
    qByDerived.set(q.__pid, q);
  }

  // ── 1. JEE Main delta, exactly ─────────────────────────────────────────────────────────────
  const EX = 'JEE_MAIN';
  const fsJee = questions.filter((q) => q.examId === EX);
  const qdJee = pyqPoints.filter((p) => p.payload.examId === EX);

  let jeeMatchedBoth = 0;          // point says JEE_MAIN, its Firestore question says JEE_MAIN
  let jeeMatchedOtherExam = 0;     // point says JEE_MAIN, its Firestore question says something else
  const jeeOrphan: any[] = [];     // point says JEE_MAIN, no Firestore question at all
  const crossExamSkew: any[] = [];

  for (const p of qdJee) {
    const q = qByDerived.get(p.id);
    if (!q) { jeeOrphan.push(p); continue; }
    if (q.examId === EX) jeeMatchedBoth++;
    else {
      jeeMatchedOtherExam++;
      crossExamSkew.push({ pointId: p.id, payloadExam: p.payload.examId, firestoreExam: q.examId, questionId: q.questionId });
    }
  }
  const pointIdSet = new Set(pyqPoints.map((p) => p.id));
  const fsJeeMatched = fsJee.filter((q) => pointIdSet.has(q.__pid)).length;
  const fsJeeMissing = fsJee.length - fsJeeMatched;

  console.log('=== JEE MAIN DELTA DECOMPOSITION ===');
  console.log(`  Firestore JEE_MAIN questions            ${fsJee.length}`);
  console.log(`  Qdrant points with payload.examId=JEE   ${qdJee.length}`);
  console.log(`  delta (qdrant - firestore)              ${qdJee.length - fsJee.length}`);
  console.log(`  ---- decomposition of the Qdrant side ----`);
  console.log(`  matched, both say JEE_MAIN              ${jeeMatchedBoth}`);
  console.log(`  matched, Firestore says another exam    ${jeeMatchedOtherExam}   <- cross-exam label skew`);
  console.log(`  orphaned (no Firestore question)        ${jeeOrphan.length}`);
  console.log(`  sum                                     ${jeeMatchedBoth + jeeMatchedOtherExam + jeeOrphan.length}`);
  console.log(`  ---- Firestore side ----`);
  console.log(`  JEE_MAIN questions WITH a vector        ${fsJeeMatched}`);
  console.log(`  JEE_MAIN questions WITHOUT a vector     ${fsJeeMissing}`);
  console.log(`  identity: ${qdJee.length} - ${fsJee.length} = (${jeeMatchedOtherExam} skew) + (${jeeOrphan.length} orphan) - (${fsJeeMissing} missing) = ${jeeMatchedOtherExam + jeeOrphan.length - fsJeeMissing}`);

  if (crossExamSkew.length) {
    console.log('\n  cross-exam skew detail:');
    for (const c of crossExamSkew.slice(0, 10)) console.log(`    ${c.questionId}  firestore=${c.firestoreExam}  payload=${c.payloadExam}`);
  }

  // ── 2. cross-exam skew across the whole corpus ─────────────────────────────────────────────
  const allSkew: any[] = [];
  for (const p of pyqPoints) {
    const q = qByDerived.get(p.id);
    if (!q) continue;
    if (p.payload.examId && q.examId && p.payload.examId !== q.examId) {
      allSkew.push({ pointId: p.id, questionId: q.questionId, firestoreExam: q.examId, payloadExam: p.payload.examId });
    }
  }
  const yearSkew: any[] = [];
  for (const p of pyqPoints) {
    const q = qByDerived.get(p.id);
    if (!q) continue;
    if (p.payload.year != null && q.year != null && Number(p.payload.year) !== Number(q.year)) {
      yearSkew.push({ pointId: p.id, questionId: q.questionId, firestoreYear: q.year, payloadYear: p.payload.year });
    }
  }
  console.log(`\n=== CORPUS-WIDE LABEL SKEW ===`);
  console.log(`  vectors whose payload exam != firestore exam:  ${allSkew.length}`);
  console.log(`  vectors whose payload year != firestore year:  ${yearSkew.length}`);

  // ── 3. paper coverage against the registry ─────────────────────────────────────────────────
  const ACCEPTED = new Set(['RIGHTS_APPROVED', 'READY_FOR_INDEX', 'VERIFIED', 'ACTIVE', 'EXTRACTED', 'VERIFICATION_PENDING', 'INDEXED']);

  /** Does the question's own metadata corroborate this registry paper? */
  const corroborates = (q: any, s: any): boolean => {
    if (q.examId !== s.examId || q.year !== s.year) return false;
    const ps = sessionNos(s.session), qs = sessionNos(q.session);
    if (ps.length && qs.length && !qs.some((n) => ps.includes(n))) return false;
    const a = shiftNo(s.shift), b = shiftNo(q.shift);
    if (a !== null && b !== null && a !== b) return false;
    return true;
  };

  const rows: any[] = [];
  for (const s of sources) {
    const sameYear = questions.filter((q) => q.examId === s.examId && q.year === s.year);
    const corrob = (!s.session && !s.shift) ? sameYear : sameYear.filter((q) => corroborates(q, s));
    const accepted = corrob.filter((q) => ACCEPTED.has(String(q.ingestionState)));
    const indexed = accepted.filter((q) => pointIdSet.has(q.__pid));
    const official = corrob.filter((q) => q.corpusBucket === 'OFFICIAL_PYQ');

    let status: string;
    if (sameYear.length === 0) status = 'EMPTY';
    else if (corrob.length === 0) status = 'NO_SITTING_MATCH';
    else if (indexed.length === 0) status = 'PARTIAL_UNINDEXED';
    else if (indexed.length < accepted.length) status = 'PARTIAL';
    else status = 'COMPLETE';

    rows.push({
      paperId: s.sourceId, exam: s.examId, year: s.year, session: s.session ?? null, shift: s.shift ?? null,
      paper: s.paper ?? null, sourceTier: s.sourceTier, availabilityStatus: s.availabilityStatus,
      sourceUrl: s.sourceUrl ? 'present' : 'absent',
      expectedQuestionCount: s.questionCountDiscovered ?? null,
      examYearQuestionCount: sameYear.length,
      firestoreQuestionCount: corrob.length,
      acceptedCount: accepted.length,
      indexedCount: indexed.length,
      officialBucketCount: official.length,
      coveragePercent: accepted.length ? +((indexed.length / accepted.length) * 100).toFixed(1) : 0,
      status,
    });
  }

  const statusCounts = new Map<string, number>();
  for (const r of rows) statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
  console.log('\n=== PAPER COVERAGE (173 registry papers) ===');
  for (const [k, v] of [...statusCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${v}`);

  // ── 4. the previously-missing list, explicitly ─────────────────────────────────────────────
  const WATCH: [string, number[]][] = [
    ['JEE_MAIN', [2019, 2020, 2025, 2026]],
    ['JEE_ADVANCED', [2018, 2019, 2025]],
    ['SSC_CGL', [2020]],
    ['BPSC_CCE', [2021]],
    ['IBPS_PO', [2025]],
    ['RRB_NTPC', [2025]],
  ];
  console.log('\n=== PREVIOUSLY-MISSING PAPERS, RECHECKED ===');
  const watchOut: any[] = [];
  for (const [exam, years] of WATCH) {
    for (const y of years) {
      const papers = rows.filter((r) => r.exam === exam && r.year === y);
      const qCount = questions.filter((q) => q.examId === exam && q.year === y).length;
      const hasSource = papers.some((p) => p.sourceUrl === 'present');
      let state: string;
      if (qCount === 0 && hasSource) state = 'SOURCE_AVAILABLE_NOT_INGESTED';
      else if (qCount === 0) state = 'SOURCE_UNAVAILABLE';
      else if (papers.every((p) => p.status === 'COMPLETE')) state = 'COMPLETE';
      else state = 'PARTIAL';
      console.log(`  ${exam.padEnd(14)} ${y}  papers=${String(papers.length).padStart(2)}  questions=${String(qCount).padStart(5)}  sourceUrl=${hasSource ? 'yes' : 'no '}  -> ${state}`);
      watchOut.push({ exam, year: y, registryPapers: papers.length, firestoreQuestions: qCount, sourceUrlPresent: hasSource, state });
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    jeeMainDelta: {
      firestoreCount: fsJee.length, qdrantCount: qdJee.length, delta: qdJee.length - fsJee.length,
      matchedBothJee: jeeMatchedBoth, matchedFirestoreOtherExam: jeeMatchedOtherExam,
      orphaned: jeeOrphan.length, firestoreWithoutVector: fsJeeMissing,
      orphanRecords: jeeOrphan.map((p) => ({ pointId: p.id, ...p.payload })),
      crossExamSkew,
    },
    corpusWideSkew: { examMismatch: allSkew, yearMismatch: yearSkew },
    paperCoverage: rows,
    paperStatusCounts: Object.fromEntries(statusCounts),
    previouslyMissing: watchOut,
  }, null, 2));
  console.log(`\n-> ${OUT}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
