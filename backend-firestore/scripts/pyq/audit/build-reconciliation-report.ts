/**
 * The §25 reconciliation report, in the requested schema. READ-ONLY.
 *
 * One row per registry paper at EXAM+YEAR+SESSION+SHIFT+PAPER granularity, plus rows for
 * question clusters that exist in Firestore but match no registry paper (so nothing is hidden by
 * being unregistered), plus aggregate totals.
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { toQdrantId } from '../../../src/services/rag/qdrantFilter';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { env } from '../../../src/config/env';
import * as fs from 'fs';
import * as path from 'path';

const OUT_JSON = path.join(__dirname, 'out', 'RECONCILIATION-REPORT.json');
const OUT_CSV = path.join(__dirname, 'out', 'RECONCILIATION-REPORT.csv');

const derive = (qid: string) => toQdrantId(env.PINECONE_NAMESPACE, `vec_${qid.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
const shiftNo = (v?: any) => { if (!v) return null; const m = String(v).match(/shift\s*(\d+)/i) || String(v).match(/^\s*(\d+)\s*$/); return m ? Number(m[1]) : null; };
const sessionNos = (v?: any) => (!v || !/session/i.test(String(v))) ? [] : Array.from(String(v).matchAll(/\d+/g), (m) => Number(m[0]));

const ACCEPTED = new Set(['RIGHTS_APPROVED', 'READY_FOR_INDEX', 'VERIFIED', 'ACTIVE', 'EXTRACTED', 'VERIFICATION_PENDING', 'INDEXED']);
const isAccepted = (q: any) => ACCEPTED.has(String(q.ingestionState));

/** A question whose bucket or sourceType contradicts its verification claim. */
const trustTierError = (q: any) =>
  (q.corpusBucket === 'PRACTICE_MOCK' || q.sourceType === 'GENERATED' || q.sourceType === 'TEMPLATE') &&
  (q.verificationStatus === 'OFFICIAL_CONFIRMED' || q.rightsStatus === 'OFFICIAL_SOURCE_REVIEWED');

/** A question that cannot state where it came from. */
const provenanceError = (q: any) =>
  !q.sourceId || !q.examId || q.year == null || !q.verificationStatus ||
  !Array.isArray(q.provenanceRecords) || q.provenanceRecords.length === 0;

async function main() {
  const db = firebaseApp.firestore();
  const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY || undefined, checkCompatibility: false });

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
      with_payload: { include: ['content_type', 'vectorKind', 'questionId', 'examId', 'year', 'session', 'shift', 'paper', 'corpusBucket', 'sourceType', 'verificationStatus'] } as any,
      with_vector: false,
    });
    for (const p of res.points ?? []) points.push({ id: String(p.id), payload: p.payload ?? {} });
    offset = res.next_page_offset;
    if (!offset) break;
  }
  // True PYQ vectors only. Practice-bank points carry a different payload contract and are a
  // separate corpus; counting them here would invent orphans that are not orphans.
  const pyqPoints = points.filter((p) => p.payload.content_type === 'pyq');

  for (const q of questions) q.__pid = derive(q.questionId);
  const pointById = new Map(pyqPoints.map((p) => [p.id, p]));
  const liveIds = new Set(questions.map((q) => q.__pid));
  const orphanPoints = pyqPoints.filter((p) => !liveIds.has(p.id));

  const corroborates = (q: any, s: any) => {
    if (q.examId !== s.examId || q.year !== s.year) return false;
    const ps = sessionNos(s.session), qs = sessionNos(q.session);
    if (ps.length && qs.length && !qs.some((n) => ps.includes(n))) return false;
    const a = shiftNo(s.shift), b = shiftNo(q.shift);
    if (a !== null && b !== null && a !== b) return false;
    return true;
  };

  const claimed = new Set<string>();
  const rows: any[] = [];

  for (const s of sources) {
    const sameYear = questions.filter((q) => q.examId === s.examId && q.year === s.year);
    const mine = (!s.session && !s.shift) ? sameYear : sameYear.filter((q) => corroborates(q, s));
    for (const q of mine) claimed.add(q.questionId);

    const accepted = mine.filter(isAccepted);
    const matched = accepted.filter((q) => pointById.has(q.__pid));
    const orphansHere = orphanPoints.filter(
      (p) => p.payload.examId === s.examId && Number(p.payload.year) === Number(s.year),
    );
    const provErrs = mine.filter(provenanceError).length;
    const trustErrs = mine.filter(trustTierError).length;

    let status: string;
    if (sameYear.length === 0) status = s.sourceUrl ? 'SOURCE_AVAILABLE_NOT_INGESTED' : 'SOURCE_UNAVAILABLE';
    else if (mine.length === 0) status = 'NO_SITTING_MATCH';
    else if (matched.length === 0) status = 'PARTIAL_UNINDEXED';
    else if (matched.length < accepted.length) status = 'PARTIAL';
    else status = 'COMPLETE';

    rows.push({
      exam: s.examId, year: s.year, session: s.session ?? null, shift: s.shift ?? null,
      paperId: s.sourceId, paper: s.paper ?? null,
      firestoreCount: mine.length,
      qdrantCount: matched.length + orphansHere.length,
      matchedCount: matched.length,
      missingVectors: accepted.length - matched.length,
      orphanVectors: orphansHere.length,
      duplicateVectors: 0,
      provenanceErrors: provErrs,
      trustTierErrors: trustErrs,
      acceptedCount: accepted.length,
      coveragePercent: accepted.length ? +((matched.length / accepted.length) * 100).toFixed(1) : 0,
      status,
    });
  }

  // Questions no registry paper claims — reported rather than dropped.
  const unclaimed = questions.filter((q) => !claimed.has(q.questionId));
  const unclaimedByKey = new Map<string, any[]>();
  for (const q of unclaimed) {
    const k = `${q.examId}|${q.year}|${q.session ?? ''}|${q.shift ?? ''}|${q.paper ?? ''}`;
    if (!unclaimedByKey.has(k)) unclaimedByKey.set(k, []);
    unclaimedByKey.get(k)!.push(q);
  }
  for (const [k, list] of unclaimedByKey) {
    const [exam, year, session, shift, paper] = k.split('|');
    const accepted = list.filter(isAccepted);
    const matched = accepted.filter((q) => pointById.has(q.__pid));
    rows.push({
      exam, year: year === 'undefined' ? null : Number(year), session: session || null, shift: shift || null,
      paperId: null, paper: paper || null,
      firestoreCount: list.length, qdrantCount: matched.length, matchedCount: matched.length,
      missingVectors: accepted.length - matched.length, orphanVectors: 0, duplicateVectors: 0,
      provenanceErrors: list.filter(provenanceError).length,
      trustTierErrors: list.filter(trustTierError).length,
      acceptedCount: accepted.length,
      coveragePercent: accepted.length ? +((matched.length / accepted.length) * 100).toFixed(1) : 0,
      status: 'NOT_IN_REGISTRY',
    });
  }

  const accepted = questions.filter(isAccepted);
  const aggregate = {
    firestoreQuestions: questions.length,
    firestoreAccepted: accepted.length,
    validQdrantPyqVectors: pyqPoints.length,
    matchedVectors: questions.filter((q) => pointById.has(q.__pid)).length,
    acceptedWithoutVector: accepted.filter((q) => !pointById.has(q.__pid)).length,
    orphanVectors: orphanPoints.length,
    duplicateQdrantPoints: 0,
    duplicateFirestoreQuestionIds: questions.length - new Set(questions.map((q) => q.questionId)).size,
    provenanceErrors: questions.filter(provenanceError).length,
    trustTierErrors: questions.filter(trustTierError).length,
    questionsNotInRegistry: unclaimed.length,
    registryPapers: sources.length,
    paperStatus: {} as Record<string, number>,
  };
  for (const r of rows) if (r.paperId) aggregate.paperStatus[r.status] = (aggregate.paperStatus[r.status] ?? 0) + 1;

  console.log('=== AGGREGATE ===');
  for (const [k, v] of Object.entries(aggregate)) console.log(`  ${k.padEnd(32)} ${typeof v === 'object' ? JSON.stringify(v) : v}`);

  console.log('\n=== PAPER STATUS ===');
  for (const [k, v] of Object.entries(aggregate.paperStatus).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(32)} ${v}`);

  const cols = ['exam', 'year', 'session', 'shift', 'paperId', 'paper', 'firestoreCount', 'qdrantCount', 'matchedCount', 'missingVectors', 'orphanVectors', 'duplicateVectors', 'provenanceErrors', 'trustTierErrors', 'acceptedCount', 'coveragePercent', 'status'];
  const csv = [cols.join(',')].concat(
    rows.map((r) => cols.map((c) => { const v = (r as any)[c]; return v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v); }).join(',')),
  ).join('\n');

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), aggregate, rows }, null, 2));
  fs.writeFileSync(OUT_CSV, csv);
  console.log(`\n-> ${OUT_JSON}\n-> ${OUT_CSV}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
