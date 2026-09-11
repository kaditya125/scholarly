/**
 * PYQ corpus reconciliation — Firestore <-> Qdrant, by stable question identity.
 *
 * STRICTLY READ-ONLY. This script never writes to Firestore, never writes or deletes a Qdrant
 * point, and never mutates a question. It exists to answer, from live data rather than from a
 * report: which accepted questions have a vector, which vectors have no question, what is
 * duplicated, and where provenance disagrees between the two stores.
 *
 * Identity is not a count. The join key is reconstructed the way the ingester builds it:
 *
 *     pineconeId = `vec_${questionId with non [A-Za-z0-9_-] replaced by _}`
 *     pointId    = uuidv5(`${PINECONE_NAMESPACE}:${pineconeId}`, NS_SADHYA)
 *
 * so a question and its vector are matched by derivation, not by position or by totals agreeing.
 *
 * Output: human summary on stdout, machine-readable JSON at --out (default
 * scripts/pyq/audit/out/reconciliation.json).
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { toQdrantId } from '../../../src/services/rag/qdrantFilter';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { env } from '../../../src/config/env';
import * as fs from 'fs';
import * as path from 'path';

const OUT =
  process.argv.find((a) => a.startsWith('--out='))?.split('=')[1] ??
  path.join(__dirname, 'out', 'reconciliation.json');

/** The payload keys we need to reconstruct provenance. Keeps the scroll light. */
const PAYLOAD_KEYS = [
  'content_type', 'corpusBucket', 'vectorKind', 'questionId', 'sourceId',
  'examId', 'examName', 'year', 'session', 'paper', 'shift', 'subject', 'topic',
  'questionNumber', 'verificationStatus', 'rightsStatus', 'sourceType',
  'userId', 'notebookId', 'public',
];

interface FsQuestion {
  questionId: string;
  examId?: string;
  examName?: string;
  year?: number;
  session?: string;
  shift?: string;
  paper?: string;
  subject?: string;
  questionNumber?: number;
  contentHash?: string;
  questionText?: string;
  vectorIndexed?: boolean;
  ingestionState?: string;
  verificationStatus?: string;
  rightsStatus?: string;
  corpusBucket?: string;
  sourceId?: string;
  sourceType?: string;
  sourceUrl?: string;
  provenanceRecords?: any[];
}

/** Mirrors pyqVectorIngestion.service.ts exactly. Any drift here invalidates the join. */
function derivePointId(questionId: string): string {
  const pineconeId = `vec_${questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  return toQdrantId(env.PINECONE_NAMESPACE, pineconeId);
}

/** The ingester's own acceptance predicate, minus the !vectorIndexed guard. */
const ACCEPTED_STATES = new Set([
  'RIGHTS_APPROVED', 'READY_FOR_INDEX', 'VERIFIED', 'ACTIVE', 'EXTRACTED',
  'VERIFICATION_PENDING', 'INDEXED',
]);

function isAccepted(q: FsQuestion): boolean {
  return ACCEPTED_STATES.has(String(q.ingestionState));
}

/** exam + year + session + shift + paper, as the source registry dimensions it. */
function paperKey(x: {
  examId?: string; year?: number; session?: string; shift?: string; paper?: string;
}): string {
  return [
    x.examId ?? 'NO_EXAM',
    x.year ?? 'NO_YEAR',
    x.session || 'NO_SESSION',
    x.shift || 'NO_SHIFT',
    x.paper || 'NO_PAPER',
  ].join(' | ');
}

async function loadFirestore(): Promise<FsQuestion[]> {
  const db = firebaseApp.firestore();
  const out: FsQuestion[] = [];
  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (true) {
    let q: FirebaseFirestore.Query = db.collection('pyq_questions').orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) out.push(d.data() as FsQuestion);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 2000) break;
    process.stderr.write(`\r  firestore: ${out.length}`);
  }
  process.stderr.write(`\r  firestore: ${out.length} loaded\n`);
  return out;
}

interface QPoint { id: string; payload: Record<string, any> }

async function loadQdrant(client: QdrantClient): Promise<{ all: QPoint[]; pyq: QPoint[] }> {
  const all: QPoint[] = [];
  let offset: any = undefined;
  while (true) {
    const res: any = await client.scroll(QDRANT_COLLECTION, {
      limit: 2000,
      offset,
      with_payload: { include: PAYLOAD_KEYS } as any,
      with_vector: false,
    });
    for (const p of res.points ?? []) all.push({ id: String(p.id), payload: (p.payload ?? {}) as any });
    offset = res.next_page_offset;
    process.stderr.write(`\r  qdrant: ${all.length}`);
    if (!offset) break;
  }
  process.stderr.write(`\r  qdrant: ${all.length} loaded\n`);
  // A PYQ vector is one the PYQ ingester wrote: content_type 'pyq'. Also catch anything whose
  // vectorKind betrays PYQ origin, so a payload-contract drift cannot hide points from the audit.
  const pyq = all.filter(
    (p) =>
      p.payload.content_type === 'pyq' ||
      p.payload.vectorKind === 'CANONICAL_PYQ_QUESTION' ||
      p.payload.vectorKind === 'PRACTICE_QUESTION',
  );
  return { all, pyq };
}

async function main() {
  console.log('=== PYQ CORPUS RECONCILIATION (read-only) ===');
  console.log(`collection=${QDRANT_COLLECTION}  namespace=${env.PINECONE_NAMESPACE}  store=${env.VECTOR_STORE}\n`);

  const client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY || undefined,
    checkCompatibility: false,
  });

  const [fsQuestions, qd] = await Promise.all([loadFirestore(), loadQdrant(client)]);
  const { all: qAll, pyq: qPyq } = qd;

  // ── A. duplicate detection inside each store ───────────────────────────────────────────────
  const fsById = new Map<string, FsQuestion[]>();
  for (const q of fsQuestions) {
    const k = q.questionId;
    if (!fsById.has(k)) fsById.set(k, []);
    fsById.get(k)!.push(q);
  }
  const fsDuplicateIds = [...fsById.entries()].filter(([, v]) => v.length > 1).map(([k]) => k);

  const fsByHash = new Map<string, string[]>();
  for (const q of fsQuestions) {
    if (!q.contentHash) continue;
    if (!fsByHash.has(q.contentHash)) fsByHash.set(q.contentHash, []);
    fsByHash.get(q.contentHash)!.push(q.questionId);
  }
  const fsDuplicateContent = [...fsByHash.entries()].filter(([, v]) => v.length > 1);

  const qById = new Map<string, QPoint[]>();
  for (const p of qPyq) {
    if (!qById.has(p.id)) qById.set(p.id, []);
    qById.get(p.id)!.push(p);
  }
  const qDuplicatePointIds = [...qById.entries()].filter(([, v]) => v.length > 1).map(([k]) => k);

  // Two distinct points carrying the same questionId is the duplicate that actually matters.
  const qByQuestionId = new Map<string, QPoint[]>();
  for (const p of qPyq) {
    const qid = p.payload.questionId;
    if (!qid) continue;
    if (!qByQuestionId.has(qid)) qByQuestionId.set(qid, []);
    qByQuestionId.get(qid)!.push(p);
  }
  const qDuplicateQuestionIds = [...qByQuestionId.entries()].filter(([, v]) => v.length > 1);

  // ── B. the join ────────────────────────────────────────────────────────────────────────────
  const qPointIndex = new Map<string, QPoint>();
  for (const p of qPyq) qPointIndex.set(p.id, p);

  const matched: { q: FsQuestion; p: QPoint }[] = [];
  const missingVectors: FsQuestion[] = [];
  const matchedPointIds = new Set<string>();

  for (const q of fsQuestions) {
    const pid = derivePointId(q.questionId);
    const p = qPointIndex.get(pid);
    if (p) {
      matched.push({ q, p });
      matchedPointIds.add(pid);
    } else {
      missingVectors.push(q);
    }
  }

  // Orphans: a PYQ point no live Firestore question derives to.
  const orphans = qPyq.filter((p) => !matchedPointIds.has(p.id));

  // ── C. flag disagreement, not just absence ─────────────────────────────────────────────────
  const flagLiesIndexed = matched.filter(({ q }) => q.vectorIndexed !== true); // vector exists, flag says no
  const flagLiesMissing = missingVectors.filter((q) => q.vectorIndexed === true); // flag says yes, no vector

  // ── D. metadata / provenance mismatch on matched pairs ─────────────────────────────────────
  const norm = (v: any) => (v === undefined || v === null ? '' : String(v).trim());
  const metadataMismatches: any[] = [];
  for (const { q, p } of matched) {
    const diffs: string[] = [];
    for (const f of ['examId', 'year', 'session', 'shift', 'paper', 'subject', 'questionNumber'] as const) {
      if (norm((q as any)[f]) !== norm(p.payload[f])) {
        diffs.push(`${f}: firestore=${JSON.stringify((q as any)[f])} qdrant=${JSON.stringify(p.payload[f])}`);
      }
    }
    if (norm(p.payload.questionId) !== norm(q.questionId)) {
      diffs.push(`questionId: payload=${JSON.stringify(p.payload.questionId)} derived-from=${JSON.stringify(q.questionId)}`);
    }
    if (diffs.length) metadataMismatches.push({ questionId: q.questionId, pointId: p.id, diffs });
  }

  // ── E. payload identity completeness ───────────────────────────────────────────────────────
  const payloadGaps = {
    missingQuestionId: qPyq.filter((p) => !p.payload.questionId).length,
    missingExamId: qPyq.filter((p) => !p.payload.examId).length,
    missingYear: qPyq.filter((p) => p.payload.year === undefined || p.payload.year === null).length,
    missingSubject: qPyq.filter((p) => !p.payload.subject).length,
    missingSourceId: qPyq.filter((p) => !p.payload.sourceId).length,
    missingSession: qPyq.filter((p) => !p.payload.session).length,
    missingShift: qPyq.filter((p) => !p.payload.shift).length,
    // The spec asks for canonicalPaperId. Record whether the contract has one at all.
    missingCanonicalPaperId: qPyq.filter((p) => !p.payload.canonicalPaperId).length,
    nonEmptyUserId: qPyq.filter((p) => p.payload.userId).length,
  };

  // ── F. acceptance + trust tier ─────────────────────────────────────────────────────────────
  const accepted = fsQuestions.filter(isAccepted);
  const acceptedMissing = accepted.filter((q) => !qPointIndex.has(derivePointId(q.questionId)));

  const byState = new Map<string, number>();
  for (const q of fsQuestions) byState.set(String(q.ingestionState), (byState.get(String(q.ingestionState)) ?? 0) + 1);
  const byVerification = new Map<string, number>();
  for (const q of fsQuestions) byVerification.set(String(q.verificationStatus), (byVerification.get(String(q.verificationStatus)) ?? 0) + 1);
  const byBucket = new Map<string, number>();
  for (const q of fsQuestions) byBucket.set(String(q.corpusBucket), (byBucket.get(String(q.corpusBucket)) ?? 0) + 1);

  // ── G. per-exam and per-paper matrices ─────────────────────────────────────────────────────
  const perExam = new Map<string, { fs: number; qd: number; matched: number; missing: number }>();
  for (const q of fsQuestions) {
    const k = String(q.examId);
    if (!perExam.has(k)) perExam.set(k, { fs: 0, qd: 0, matched: 0, missing: 0 });
    perExam.get(k)!.fs++;
  }
  for (const p of qPyq) {
    const k = String(p.payload.examId);
    if (!perExam.has(k)) perExam.set(k, { fs: 0, qd: 0, matched: 0, missing: 0 });
    perExam.get(k)!.qd++;
  }
  for (const { q } of matched) perExam.get(String(q.examId))!.matched++;
  for (const q of missingVectors) perExam.get(String(q.examId))!.missing++;

  const perPaper = new Map<string, any>();
  for (const q of fsQuestions) {
    const k = paperKey(q);
    if (!perPaper.has(k)) perPaper.set(k, { key: k, examId: q.examId, year: q.year, session: q.session ?? null, shift: q.shift ?? null, paper: q.paper ?? null, firestoreCount: 0, qdrantCount: 0, matchedCount: 0, missingVectors: 0, accepted: 0 });
    const r = perPaper.get(k)!;
    r.firestoreCount++;
    if (isAccepted(q)) r.accepted++;
  }
  for (const p of qPyq) {
    const k = paperKey(p.payload as any);
    if (!perPaper.has(k)) perPaper.set(k, { key: k, examId: p.payload.examId, year: p.payload.year, session: p.payload.session ?? null, shift: p.payload.shift ?? null, paper: p.payload.paper ?? null, firestoreCount: 0, qdrantCount: 0, matchedCount: 0, missingVectors: 0, accepted: 0 });
    perPaper.get(k)!.qdrantCount++;
  }
  for (const { q } of matched) perPaper.get(paperKey(q))!.matchedCount++;
  for (const q of missingVectors) perPaper.get(paperKey(q))!.missingVectors++;

  // ── H. report ──────────────────────────────────────────────────────────────────────────────
  const totals = {
    firestoreQuestions: fsQuestions.length,
    firestoreAccepted: accepted.length,
    firestoreDistinctQuestionIds: fsById.size,
    firestoreDuplicateQuestionIds: fsDuplicateIds.length,
    firestoreDuplicateContentHashGroups: fsDuplicateContent.length,
    firestoreDuplicateContentHashQuestions: fsDuplicateContent.reduce((a, [, v]) => a + v.length, 0),
    qdrantPointsTotalAllTypes: qAll.length,
    qdrantPyqPoints: qPyq.length,
    qdrantNonPyqPoints: qAll.length - qPyq.length,
    qdrantDuplicatePointIds: qDuplicatePointIds.length,
    qdrantDuplicateQuestionIdGroups: qDuplicateQuestionIds.length,
    matched: matched.length,
    missingVectors: missingVectors.length,
    acceptedMissingVectors: acceptedMissing.length,
    orphanVectors: orphans.length,
    metadataMismatches: metadataMismatches.length,
    flagSaysNotIndexedButVectorExists: flagLiesIndexed.length,
    flagSaysIndexedButNoVector: flagLiesMissing.length,
    indexedPercent: +((matched.length / fsQuestions.length) * 100).toFixed(2),
    acceptedIndexedPercent: +(((accepted.length - acceptedMissing.length) / Math.max(accepted.length, 1)) * 100).toFixed(2),
  };

  console.log('\n=== TOTALS ===');
  for (const [k, v] of Object.entries(totals)) console.log(`  ${k.padEnd(42)} ${v}`);

  console.log('\n=== INGESTION STATE (firestore) ===');
  for (const [k, v] of [...byState.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)} ${v}`);
  console.log('\n=== VERIFICATION STATUS (firestore) ===');
  for (const [k, v] of [...byVerification.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)} ${v}`);
  console.log('\n=== CORPUS BUCKET (firestore) ===');
  for (const [k, v] of [...byBucket.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)} ${v}`);

  console.log('\n=== PER EXAM ===');
  console.log(`  ${'exam'.padEnd(15)} ${'firestore'.padStart(9)} ${'qdrant'.padStart(8)} ${'matched'.padStart(8)} ${'missing'.padStart(8)} ${'delta'.padStart(7)}`);
  for (const [k, r] of [...perExam.entries()].sort()) {
    console.log(`  ${k.padEnd(15)} ${String(r.fs).padStart(9)} ${String(r.qd).padStart(8)} ${String(r.matched).padStart(8)} ${String(r.missing).padStart(8)} ${String(r.qd - r.fs).padStart(7)}`);
  }

  console.log('\n=== QDRANT PAYLOAD IDENTITY GAPS (of PYQ points) ===');
  for (const [k, v] of Object.entries(payloadGaps)) console.log(`  ${k.padEnd(28)} ${v}`);

  if (orphans.length) {
    console.log('\n=== ORPHAN SAMPLE (first 10) ===');
    for (const p of orphans.slice(0, 10)) {
      console.log(`  ${p.id}  qid=${p.payload.questionId ?? '(none)'}  exam=${p.payload.examId} ${p.payload.year} bucket=${p.payload.corpusBucket} kind=${p.payload.vectorKind}`);
    }
  }
  if (metadataMismatches.length) {
    console.log('\n=== METADATA MISMATCH SAMPLE (first 5) ===');
    for (const m of metadataMismatches.slice(0, 5)) console.log(`  ${m.questionId}: ${m.diffs.join(' ; ')}`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        config: { collection: QDRANT_COLLECTION, namespace: env.PINECONE_NAMESPACE, vectorStore: env.VECTOR_STORE },
        totals,
        ingestionStates: Object.fromEntries(byState),
        verificationStatuses: Object.fromEntries(byVerification),
        corpusBuckets: Object.fromEntries(byBucket),
        payloadGaps,
        perExam: Object.fromEntries(perExam),
        perPaper: [...perPaper.values()].sort((a, b) => String(a.key).localeCompare(String(b.key))),
        orphanVectors: orphans.map((p) => ({ pointId: p.id, payload: p.payload })),
        missingVectorQuestionIds: missingVectors.map((q) => ({
          questionId: q.questionId, examId: q.examId, year: q.year, session: q.session ?? null,
          shift: q.shift ?? null, ingestionState: q.ingestionState, vectorIndexed: q.vectorIndexed ?? false,
          accepted: isAccepted(q),
        })),
        metadataMismatches,
        flagSaysIndexedButNoVector: flagLiesMissing.map((q) => q.questionId),
        flagSaysNotIndexedButVectorExists: flagLiesIndexed.map(({ q }) => q.questionId),
        firestoreDuplicateQuestionIds: fsDuplicateIds,
        firestoreDuplicateContentHashGroups: fsDuplicateContent.map(([hash, ids]) => ({ contentHash: hash, questionIds: ids })),
        qdrantDuplicateQuestionIdGroups: qDuplicateQuestionIds.map(([qid, pts]) => ({ questionId: qid, pointIds: pts.map((p) => p.id) })),
      },
      null,
      2,
    ),
  );
  console.log(`\nmachine-readable report -> ${OUT}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('RECONCILIATION FAILED:', e?.message || e);
  process.exit(1);
});
