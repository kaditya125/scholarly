/**
 * Classify every orphaned PYQ vector, and audit trust-tier labelling. READ-ONLY.
 *
 * An orphan is a Qdrant PYQ point whose payload questionId does not exist in `pyq_questions`.
 * The requirement is to account for each one, not to delete any, so this script only reads and
 * classifies. Categories:
 *
 *   SUPERSEDED_REINGEST   the question was re-ingested under a new questionId; a live Firestore
 *                         question has the same contentHash or the same paper+questionNumber
 *   DELETED_FROM_SOURCE   nothing in Firestore corresponds; the question is simply gone
 *   PRACTICE_BANK         a practice/mock vector that was never a canonical PYQ row
 *   LEGACY_PAYLOAD        pre-contract point (no corpusBucket) that still names a live question
 *   UNRESOLVED            cannot be explained — reported rather than guessed
 *
 * Also cross-tabulates corpusBucket against verificationStatus, which is where a generated or
 * template question wearing an official label becomes visible.
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { env } from '../../../src/config/env';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.join(__dirname, 'out', 'orphan-classification.json');

async function main() {
  const db = firebaseApp.firestore();
  const report = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'out', 'reconciliation.json'), 'utf8'),
  );
  const orphans: { pointId: string; payload: any }[] = report.orphanVectors;
  console.log(`orphans to classify: ${orphans.length}\n`);

  // ── load Firestore identity indexes ────────────────────────────────────────────────────────
  const byId = new Map<string, any>();
  const byHash = new Map<string, any[]>();
  const byPaperQno = new Map<string, any[]>();
  let last: any = null;
  let n = 0;
  while (true) {
    let q: FirebaseFirestore.Query = db.collection('pyq_questions').orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const x: any = d.data();
      n++;
      byId.set(x.questionId, x);
      if (x.contentHash) {
        if (!byHash.has(x.contentHash)) byHash.set(x.contentHash, []);
        byHash.get(x.contentHash)!.push(x);
      }
      const k = `${x.examId}|${x.year}|${x.session ?? ''}|${x.shift ?? ''}|${x.questionNumber ?? ''}`;
      if (!byPaperQno.has(k)) byPaperQno.set(k, []);
      byPaperQno.get(k)!.push(x);
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 2000) break;
  }
  console.log(`firestore questions indexed: ${n}\n`);

  // ── classify ───────────────────────────────────────────────────────────────────────────────
  const buckets = new Map<string, any[]>();
  const add = (cat: string, rec: any) => {
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(rec);
  };

  for (const o of orphans) {
    const p = o.payload ?? {};
    const qid: string | undefined = p.questionId;
    const rec = {
      pointId: o.pointId, questionId: qid ?? null, examId: p.examId ?? null, year: p.year ?? null,
      session: p.session ?? null, shift: p.shift ?? null, questionNumber: p.questionNumber ?? null,
      corpusBucket: p.corpusBucket ?? null, vectorKind: p.vectorKind ?? null,
      verificationStatus: p.verificationStatus ?? null, subject: p.subject ?? null,
      evidence: '' as string,
    };

    if (qid && byId.has(qid)) {
      rec.evidence = 'questionId IS live in Firestore — derived point id did not match, payload contract drift';
      add('LEGACY_PAYLOAD', rec);
      continue;
    }

    // practice/mock vectors carry opaque hash ids and no exam identity
    if (p.corpusBucket === 'PRACTICE_MOCK' || p.vectorKind === 'PRACTICE_QUESTION') {
      rec.evidence = 'practice/mock vector; no canonical PYQ row expected';
      add('PRACTICE_BANK', rec);
      continue;
    }

    // re-ingested under a different id?
    const paperK = `${p.examId}|${p.year}|${p.session ?? ''}|${p.shift ?? ''}|${p.questionNumber ?? ''}`;
    const sameSlot = byPaperQno.get(paperK) ?? [];
    if (sameSlot.length > 0) {
      rec.evidence = `same paper+questionNumber occupied by live questionId(s): ${sameSlot.slice(0, 3).map((x) => x.questionId).join(', ')}`;
      add('SUPERSEDED_REINGEST', rec);
      continue;
    }

    if (p.examId && p.year) {
      rec.evidence = 'named a real paper slot, but no live Firestore question occupies it';
      add('DELETED_FROM_SOURCE', rec);
      continue;
    }

    rec.evidence = 'no questionId match, no bucket, no paper identity';
    add('UNRESOLVED', rec);
  }

  console.log('=== ORPHAN CLASSIFICATION ===');
  for (const [k, v] of [...buckets.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${k.padEnd(22)} ${String(v.length).padStart(5)}`);
  }

  // per-exam breakdown of orphans
  console.log('\n=== ORPHANS BY EXAM ===');
  const byExam = new Map<string, Map<string, number>>();
  for (const [cat, list] of buckets) {
    for (const r of list) {
      const e = String(r.examId ?? 'NO_EXAM');
      if (!byExam.has(e)) byExam.set(e, new Map());
      byExam.get(e)!.set(cat, (byExam.get(e)!.get(cat) ?? 0) + 1);
    }
  }
  for (const [e, m] of [...byExam.entries()].sort()) {
    const parts = [...m.entries()].map(([c, n2]) => `${c}=${n2}`).join('  ');
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    console.log(`  ${e.padEnd(14)} total=${String(total).padStart(5)}   ${parts}`);
  }

  // ── trust tier audit: does a bucket claim a verification it has not earned? ─────────────────
  console.log('\n=== corpusBucket x verificationStatus (firestore) ===');
  const cross = new Map<string, number>();
  for (const x of byId.values()) {
    const k = `${x.corpusBucket ?? 'undefined'} | ${x.verificationStatus ?? 'undefined'}`;
    cross.set(k, (cross.get(k) ?? 0) + 1);
  }
  for (const [k, v] of [...cross.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(52)} ${String(v).padStart(6)}`);
  }

  // the specific danger: a non-official bucket claiming official confirmation
  const falseOfficial = [...byId.values()].filter(
    (x) =>
      (x.corpusBucket === 'PRACTICE_MOCK' || x.sourceType === 'GENERATED' || x.sourceType === 'TEMPLATE') &&
      (x.verificationStatus === 'OFFICIAL_CONFIRMED' || x.rightsStatus === 'OFFICIAL_SOURCE_REVIEWED'),
  );
  console.log(`\n=== FALSE OFFICIAL LABELS ===`);
  console.log(`  non-official bucket claiming OFFICIAL_CONFIRMED / OFFICIAL_SOURCE_REVIEWED: ${falseOfficial.length}`);
  for (const x of falseOfficial.slice(0, 5)) {
    console.log(`    ${x.questionId} bucket=${x.corpusBucket} sourceType=${x.sourceType} vs=${x.verificationStatus} rights=${x.rightsStatus}`);
  }

  console.log('\n=== sourceType distribution ===');
  const bySt = new Map<string, number>();
  for (const x of byId.values()) bySt.set(String(x.sourceType), (bySt.get(String(x.sourceType)) ?? 0) + 1);
  for (const [k, v] of [...bySt.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(30)} ${v}`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        orphanTotal: orphans.length,
        classification: Object.fromEntries([...buckets.entries()].map(([k, v]) => [k, v.length])),
        byExam: Object.fromEntries([...byExam.entries()].map(([k, m]) => [k, Object.fromEntries(m)])),
        records: Object.fromEntries(buckets),
        corpusBucketByVerification: Object.fromEntries(cross),
        falseOfficialLabels: falseOfficial.map((x) => ({
          questionId: x.questionId, corpusBucket: x.corpusBucket, sourceType: x.sourceType,
          verificationStatus: x.verificationStatus, rightsStatus: x.rightsStatus, examId: x.examId, year: x.year,
        })),
        sourceTypeDistribution: Object.fromEntries(bySt),
      },
      null,
      2,
    ),
  );
  console.log(`\n-> ${OUT}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
