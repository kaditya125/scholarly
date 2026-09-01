/**
 * Re-anchor already-ingested PYQ questions to syllabus nodes using the corrected matcher.
 *
 * ── WHY A BACKFILL AND NOT A RE-INGEST ────────────────────────────────────────────────────
 * The questions are already extracted, verified, rights-processed and embedded. Only the
 * topic → node link was computed with the old substring matcher, so re-running the whole
 * pipeline would re-embed 415 questions to change one field — real money and quota for a
 * result that is already sitting in the index.
 *
 * ── ZERO EMBEDDING CALLS, AND HOW THAT IS GUARANTEED ──────────────────────────────────────
 * `syllabusNodeId` is carried in Pinecone metadata as well as Firestore, so fixing only
 * Firestore would leave retrieval filtering on stale values. Pinecone has no metadata-only
 * update in this codebase's client wrapper, so this script FETCHES the existing vectors —
 * values included — and re-upserts them with corrected metadata. The vector values are the
 * ones already stored; nothing is sent to an embedding provider. That is the whole reason
 * this is safe to run against production.
 *
 *   npx tsx scripts/pyq/backfill-node-anchors.ts --exam SSC_CGL              (dry run)
 *   npx tsx scripts/pyq/backfill-node-anchors.ts --exam SSC_CGL --apply
 *
 * Dry run is the default and prints a full before/after with a sample of every change, so the
 * matcher's judgement can be reviewed before anything is written.
 */

import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { syllabusGraphService } from '../../src/services/exam/syllabusGraph.service';
import { matchTopicToNode } from '../../src/services/pyq/pyqTaxonomyNormalizer.service';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { env } from '../../src/config/env';

const args = process.argv.slice(2);
const examIdx = args.indexOf('--exam');
const EXAM = examIdx !== -1 ? String(args[examIdx + 1] || '').toUpperCase() : '';
const APPLY = args.includes('--apply');
const CYCLE = '2026';

async function main() {
  if (!EXAM) {
    console.error('Error: --exam <examId> is required, e.g. --exam SSC_CGL');
    process.exit(1);
  }

  console.log('='.repeat(62));
  console.log(`PYQ NODE RE-ANCHOR  ${EXAM}  [${APPLY ? 'APPLY' : 'DRY RUN'}]`);
  console.log('='.repeat(62));

  const nodes = await syllabusGraphService.getSyllabusNodes({ examId: EXAM, cycleId: CYCLE })
    .catch(() => [] as any[]);
  if (!nodes?.length) {
    console.error(`No syllabus graph for ${EXAM} @ ${CYCLE}. Nothing to anchor against.`);
    process.exit(1);
  }
  console.log(`syllabus nodes available : ${nodes.length}`);

  const snap = await db.collection('pyq_questions').where('examId', '==', EXAM).get();
  console.log(`questions                : ${snap.size}\n`);

  let before = 0, after = 0, changed = 0, cleared = 0, unchanged = 0;
  const changes: Array<{ id: string; questionId: string; topic: string; from: string | null; to: string; label: string; score: number }> = [];
  /*
   * Every question that SHOULD carry an anchor, whether or not Firestore changed this run.
   * The Pinecone pass works from this rather than from `changes`, so a re-run repairs index
   * metadata that has drifted from Firestore — which is exactly what happened on the first
   * run: Firestore was written, the Pinecone pass looked up the wrong ids, and the two stores
   * were left disagreeing with no way to reconcile from `changes` alone.
   */
  const desired: Array<{ questionId: string; to: string }> = [];

  for (const doc of snap.docs) {
    const q: any = doc.data();
    const prev: string | null = q.syllabusNodeId || null;
    if (prev) before++;

    const hit = matchTopicToNode(q.topic || '', nodes as any);
    const next = hit?.node.id || null;
    if (next) after++;

    if (next) desired.push({ questionId: String(q.questionId || doc.id), to: next });

    if (next && next !== prev) {
      changed++;
      changes.push({ id: doc.id, questionId: String(q.questionId || doc.id), topic: q.topic, from: prev, to: next, label: hit!.node.label, score: hit!.score });
    } else if (!next && prev) {
      /*
       * The new matcher refuses a link the old one made. Left ALONE rather than deleted:
       * removing an anchor would orphan any mastery already accumulated under that node, and
       * this script's job is to improve anchoring, not to destroy existing evidence. Counted
       * and reported so the number is visible rather than silently absorbed.
       */
      cleared++;
    } else {
      unchanged++;
    }
  }

  console.log(`anchored BEFORE : ${before}  (${Math.round(before / snap.size * 100)}%)`);
  console.log(`anchored AFTER  : ${after}  (${Math.round(after / snap.size * 100)}%)`);
  console.log(`  new or corrected links : ${changed}`);
  console.log(`  unchanged              : ${unchanged}`);
  console.log(`  old link now refused (left in place, not deleted) : ${cleared}`);
  console.log(`  distinct nodes used AFTER : ${new Set(changes.map(c => c.to)).size} newly, of ${nodes.length}`);

  console.log(`\n── sample of proposed links (max 25) ──`);
  changes.slice(0, 25).forEach((c) =>
    console.log(`  [${String(c.score).padStart(3)}] ${String(c.topic).slice(0, 32).padEnd(32)} -> ${c.label.slice(0, 52)}`));

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to persist.`);
    process.exit(0);
  }

  // ── 1. Firestore ────────────────────────────────────────────────────────────────────────
  console.log(`\nWriting ${changes.length} Firestore updates...`);
  let batch = db.batch();
  let n = 0;
  for (const c of changes) {
    batch.update(db.collection('pyq_questions').doc(c.id), {
      syllabusNodeId: c.to,
      syllabusNodeMatchScore: c.score,
      updatedAt: new Date().toISOString(),
    });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 400 !== 0) await batch.commit();
  console.log(`  Firestore updated: ${changes.length}`);

  // ── 2. Pinecone metadata, WITHOUT re-embedding ──────────────────────────────────────────
  // Fetch the stored vectors (values included) and re-upsert with the corrected
  // syllabusNodeId. The values written back are the ones Pinecone already held, so this makes
  // ZERO embedding calls.
  //
  // The vector id is NOT the Firestore document id: pyqVectorIngestion builds it as
  // `vec_${questionId}` with non-alphanumerics replaced. Getting that wrong is how the first
  // run reported "not found in index: 30" after Firestore had already been written.
  const vecId = (questionId: string) => `vec_${questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  console.log(`\nSyncing Pinecone metadata for ${desired.length} anchored questions`);
  console.log(`(re-upsert of STORED vectors; no embedding calls)...`);
  const ns = env.PINECONE_NAMESPACE;
  let synced = 0, already = 0, missing = 0;
  for (let i = 0; i < desired.length; i += 50) {
    const slice = desired.slice(i, i + 50);
    const fetched = await pineconeService.fetchVectors(slice.map((c) => vecId(c.questionId)), ns);
    const upserts: any[] = [];
    for (const c of slice) {
      const rec = fetched[vecId(c.questionId)];
      if (!rec?.values?.length) { missing++; continue; }
      // Only write when the index actually disagrees — keeps a re-run cheap and idempotent.
      if ((rec.metadata as any)?.syllabusNodeId === c.to) { already++; continue; }
      upserts.push({ id: vecId(c.questionId), values: rec.values, metadata: { ...(rec.metadata || {}), syllabusNodeId: c.to } });
    }
    if (upserts.length) { await pineconeService.upsertVectors(upserts, ns); synced += upserts.length; }
    process.stdout.write(`\r  processed ${Math.min(i + 50, desired.length)}/${desired.length}`);
  }
  console.log(`\n  updated: ${synced} | already correct: ${already} | not in index: ${missing}`);

  console.log(`\nDone.`);
  process.exit(0);
}

main().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
