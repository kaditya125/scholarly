/**
 * Tell the truth about the 2,171 legacy SSC CGL records, without withdrawing them.
 *
 * THE DECISION THIS IMPLEMENTS
 *
 * These are the SSC records that predate the third-party imports: part emitted by
 * generate-ssc-shift-corpus.ts, part hand-authored in scripts/pyq/corpus. They are
 * the last SSC records still claiming `TIER_A_OFFICIAL` / `OFFICIAL_CONFIRMED`, and
 * the 1,359 embedded ones are what a student actually gets today when they ask for
 * a previous year question.
 *
 * Verification found nothing wrong with them: 2,171 of 2,171 have four options, an
 * in-range answer, a worked solution, a topic and a difficulty. Not one structural
 * defect. So they stay in service and become seed material for generation. What
 * changes is only what the corpus claims about them.
 *
 * Specifically, all 2,171 assert `correctAnswerSource: "SSC Official Final Answer
 * Key <year>"` and `rightsStatus: OFFICIAL_SOURCE_REVIEWED`, with a `sourceId` of
 * the shape `src_ssc_cgl_2024_tier1_09sepshift1_ssc`. No SSC key was ever fetched
 * and no such document is recorded anywhere. Those are the claims being retired.
 *
 * NOT QUARANTINED. `ingestionState` is left exactly as it is — 1,359 ACTIVE stay
 * ACTIVE, 812 ARCHIVED_DUPLICATE stay archived. Nothing is withdrawn from service
 * and no vector is deleted.
 *
 * PINECONE IS UPDATED TOO
 *
 * The 1,359 embedded records carry their own copies of `sourceType` and
 * `verificationStatus` in vector metadata. Fixing Firestore alone would leave a
 * retrieval-time filter disagreeing with the record it returns. Pinecone's
 * `update()` patches metadata in place, so nothing is re-embedded and no vector
 * values change.
 *
 * USAGE
 *
 *   npx tsx scripts/pyq/official/relabel-ssc-legacy.ts                 # dry run
 *   npx tsx scripts/pyq/official/relabel-ssc-legacy.ts --execute       # Firestore + Pinecone
 *   npx tsx scripts/pyq/official/relabel-ssc-legacy.ts --execute --skip-vectors
 *   npx tsx scripts/pyq/official/relabel-ssc-legacy.ts --revert out/relabel/<file>.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { env } from '../../../src/config/env';

const OUT = path.join(__dirname, 'out', 'relabel');

const NEW_ANSWER_SOURCE =
  'Sadhya internal corpus — answer not verified against an SSC-published key';
const NEW_SOURCE_NAME =
  'Sadhya internal SSC CGL corpus (authored/templated; not an SSC document)';

const FIELDS = [
  'sourceType',
  'verificationStatus',
  'correctAnswerSource',
  'rightsStatus',
  'rightsSource',
  'redistributionAllowed',
  'provenanceRecords',
] as const;
type Field = (typeof FIELDS)[number];
type Patch = Partial<Record<Field, unknown>>;

const vectorIdFor = (questionId: string) =>
  `vec_${questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

function corrections(d: any): Patch {
  const p: Patch = {};
  if (d.sourceType !== 'TIER_C_SECONDARY') p.sourceType = 'TIER_C_SECONDARY';
  if (d.verificationStatus !== 'UNVERIFIED') p.verificationStatus = 'UNVERIFIED';
  if (d.correctAnswerSource !== NEW_ANSWER_SOURCE) p.correctAnswerSource = NEW_ANSWER_SOURCE;
  if (d.rightsStatus !== 'UNKNOWN') p.rightsStatus = 'UNKNOWN';
  if (d.rightsSource !== NEW_SOURCE_NAME) p.rightsSource = NEW_SOURCE_NAME;
  if (d.redistributionAllowed !== false) p.redistributionAllowed = false;

  if (Array.isArray(d.provenanceRecords) && d.provenanceRecords.length) {
    let changed = false;
    const next = d.provenanceRecords.map((r: any) => {
      const o = { ...r };
      if (o.sourceTier !== 'TIER_C_SECONDARY') { o.sourceTier = 'TIER_C_SECONDARY'; changed = true; }
      if (o.isOfficial !== false) { o.isOfficial = false; changed = true; }
      if (o.sourceName !== NEW_SOURCE_NAME) { o.sourceName = NEW_SOURCE_NAME; changed = true; }
      return o;
    });
    if (changed) p.provenanceRecords = next;
  }
  return p;
}

const pick = (data: any, fields: Field[]): Patch => {
  const out: Patch = {};
  for (const f of fields) out[f] = data[f] === undefined ? null : data[f];
  return out;
};

async function run(execute: boolean, skipVectors: boolean) {
  fs.mkdirSync(OUT, { recursive: true });
  const col = db.collection('pyq_questions');

  const snap = await col
    .where('examId', '==', 'SSC_CGL')
    .where('sourceType', '==', 'TIER_A_OFFICIAL')
    .get();

  console.log(`\nLegacy SSC records still claiming TIER_A_OFFICIAL: ${snap.size}`);

  const pending: { id: string; patch: Patch; prior: Patch; indexed: boolean }[] = [];
  const states: Record<string, number> = {};
  snap.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const d = doc.data();
    states[String(d.ingestionState ?? '∅')] = (states[String(d.ingestionState ?? '∅')] || 0) + 1;
    const patch = corrections(d);
    const touched = Object.keys(patch) as Field[];
    if (!touched.length) return;
    pending.push({ id: doc.id, patch, prior: pick(d, touched), indexed: Boolean(d.vectorIndexed) });
  });

  const embedded = pending.filter((p) => p.indexed);
  console.log(`  already correct : ${snap.size - pending.length}`);
  console.log(`  to relabel      : ${pending.length}`);
  console.log(`  of which embedded (Pinecone metadata also patched): ${embedded.length}`);
  console.log(`  ingestionState left untouched: ${JSON.stringify(states)}`);

  if (pending.length) {
    const s = pending[0];
    console.log(`\n  sample ${s.id}`);
    for (const k of Object.keys(s.patch)) {
      const before = k === 'provenanceRecords' ? '[…]' : JSON.stringify((s.prior as any)[k]);
      const after = k === 'provenanceRecords' ? '[… sourceTier/isOfficial/sourceName corrected]' : JSON.stringify((s.patch as any)[k]);
      console.log(`    ${k}: ${before}\n      -> ${after}`);
    }
  }

  if (!execute) {
    console.log(`\nDRY RUN — nothing written. Re-run with --execute to apply.\n`);
    return;
  }
  if (!pending.length) {
    console.log('\nNothing to do.\n');
    return;
  }

  const file = path.join(OUT, `ssc-legacy-${Date.now()}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      { createdAt: new Date().toISOString(), cohort: 'ssc-legacy', docs: pending.map((p) => ({ id: p.id, prior: p.prior })) },
      null,
      2
    )
  );
  console.log(`\n  reversal saved : ${path.relative(process.cwd(), file)}`);

  for (let i = 0; i < pending.length; i += 400) {
    const batch = db.batch();
    for (const p of pending.slice(i, i + 400)) batch.update(col.doc(p.id), { ...p.patch, updatedAt: Date.now() });
    await batch.commit();
    process.stdout.write(`  Firestore ${Math.min(i + 400, pending.length)}/${pending.length}\r`);
  }
  console.log(`  Firestore ${pending.length}/${pending.length}        `);

  if (skipVectors || embedded.length === 0) {
    console.log(`  Pinecone: skipped (${embedded.length} embedded records left with stale metadata)`);
  } else {
    const idx = (pineconeService as any).getIndex.call(pineconeService);
    const ns = idx.namespace(env.PINECONE_NAMESPACE);
    let ok = 0;
    let miss = 0;
    for (const p of embedded) {
      try {
        await ns.update({
          id: vectorIdFor(p.id),
          metadata: { sourceType: 'TIER_C_SECONDARY', verificationStatus: 'UNVERIFIED' },
        });
        ok++;
      } catch {
        miss++;
      }
      if ((ok + miss) % 100 === 0) process.stdout.write(`  Pinecone ${ok + miss}/${embedded.length}\r`);
    }
    console.log(`  Pinecone ${ok}/${embedded.length} patched${miss ? `, ${miss} failed` : ''}        `);
  }

  console.log(`\n${pending.length} records relabelled. None withdrawn, none re-embedded.\n`);
}

async function revert(file: string) {
  const r = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const col = db.collection('pyq_questions');
  console.log(`Reverting ${r.docs.length} documents (saved ${r.createdAt})`);
  for (let i = 0; i < r.docs.length; i += 400) {
    const batch = db.batch();
    for (const d of r.docs.slice(i, i + 400)) {
      const prior: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d.prior)) if (v !== null) prior[k] = v;
      batch.update(col.doc(d.id), prior);
    }
    await batch.commit();
  }
  console.log(`  ${r.docs.length} reverted. Pinecone metadata is NOT reverted — re-run the`);
  console.log(`  forward pass with --skip-vectors, or patch it manually.`);
}

/**
 * Reconcile Pinecone metadata to whatever Firestore currently says.
 *
 * The forward pass patches vectors for the records it relabels, which is no help
 * if it dies partway — Firestore is already correct, so a re-run finds nothing to
 * do and never reaches the vectors. This closes that gap, and is the repair tool
 * for provenance drift between the two stores generally.
 *
 * Some of these vectors turn out to carry no sourceType or verificationStatus at
 * all, having been embedded by a path that omitted them. Pinecone's update merges
 * metadata, so this adds the fields rather than only correcting them.
 */
async function syncVectors(execute: boolean) {
  const snap = await db
    .collection('pyq_questions')
    .where('examId', '==', 'SSC_CGL')
    .where('vectorIndexed', '==', true)
    .select('sourceType', 'verificationStatus')
    .get();

  const idx = (pineconeService as any).getIndex.call(pineconeService);
  const ns = idx.namespace(env.PINECONE_NAMESPACE);

  const want = new Map<string, { sourceType: string; verificationStatus: string }>();
  snap.forEach((d: FirebaseFirestore.QueryDocumentSnapshot) => {
    const q = d.data();
    want.set(vectorIdFor(d.id), {
      sourceType: String(q.sourceType ?? ''),
      verificationStatus: String(q.verificationStatus ?? ''),
    });
  });

  const ids = [...want.keys()];
  console.log(`\nVector metadata sync — ${ids.length} embedded SSC records`);

  const stale: string[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const res: any = await ns.fetch({ ids: ids.slice(i, i + 100) });
    const recs = res.records ?? res.vectors ?? {};
    for (const id of ids.slice(i, i + 100)) {
      const m = recs[id]?.metadata;
      if (!m) continue;
      const w = want.get(id)!;
      if (m.sourceType !== w.sourceType || m.verificationStatus !== w.verificationStatus) stale.push(id);
    }
  }

  console.log(`  in sync : ${ids.length - stale.length}`);
  console.log(`  stale   : ${stale.length}`);
  if (!execute) {
    console.log(`\nDRY RUN — nothing written. Add --execute.\n`);
    return;
  }
  let ok = 0;
  for (const id of stale) {
    await ns.update({ id, metadata: want.get(id)! });
    ok++;
    if (ok % 100 === 0) process.stdout.write(`  patched ${ok}/${stale.length}\r`);
  }
  console.log(`  patched ${ok}/${stale.length}        \n`);
}

async function main() {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--revert');
  if (ri >= 0) {
    if (!args[ri + 1]) throw new Error('--revert needs a manifest path');
    await revert(args[ri + 1]);
    return;
  }
  if (args.includes('--vectors-only')) {
    await syncVectors(args.includes('--execute'));
    return;
  }
  const execute = args.includes('--execute');
  console.log(
    `\nSSC legacy corpus relabel — ${execute ? 'EXECUTE' : 'DRY RUN'}\n` +
      `Keeps every record in service. Changes only what is claimed about its origin.`
  );
  await run(execute, args.includes('--skip-vectors'));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
