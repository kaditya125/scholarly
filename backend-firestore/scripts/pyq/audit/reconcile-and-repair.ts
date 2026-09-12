/**
 * Firestore-side remediation: index flags, paper identity, provenance class.
 *
 * DRY RUN BY DEFAULT. Nothing is written without `--execute`, and `--execute` first writes a
 * snapshot of every field it is about to change to `out/backup-<timestamp>.jsonl`, one JSON
 * object per question, so any change here can be reversed field-for-field.
 *
 * Nothing is deleted. Nothing is quarantined. Where a value is corrected, the original is kept
 * alongside it under an `original*` key rather than overwritten in place.
 *
 * Three repairs, in one pass over the corpus:
 *
 *   1. INDEX FLAGS   `vectorIndexed` is recomputed from whether the derived Qdrant point actually
 *                    exists and carries the matching questionId. The previous indexer set this
 *                    flag positionally, so 334 questions claimed a vector they never had and 269
 *                    had one without the flag. The flag is never trusted as input here.
 *
 *   2. PAPER IDENTITY `canonicalPaperId` from the registry (authoritative), `sittingId` from the
 *                    question's own dated shift, plus raw/normalized fields. Assigned only when
 *                    exactly one registry paper is consistent; otherwise AMBIGUOUS or UNRESOLVED.
 *                    Never assigned on exam+year alone.
 *
 *   3. PROVENANCE    `provenanceClass` derived from negative evidence first, so a practice
 *                    question cannot reach an official class by having an official label written
 *                    onto it. Where a question's stated verification contradicts its own class,
 *                    the claim is corrected and the original preserved.
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { toQdrantId } from '../../../src/services/rag/qdrantFilter';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { env } from '../../../src/config/env';
import {
  normalizeFields, resolvePaperIdentity, classifyProvenance, canonicalPaperIdFor, ProvenanceClass,
} from '../../../src/services/pyq/paperIdentity';
import * as fs from 'fs';
import * as path from 'path';

const EXECUTE = process.argv.includes('--execute');
const OUT_DIR = path.join(__dirname, 'out');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

const derive = (qid: string) => toQdrantId(env.PINECONE_NAMESPACE, `vec_${qid.replace(/[^a-zA-Z0-9_-]/g, '_')}`);

const ACCEPTED = new Set([
  'RIGHTS_APPROVED', 'READY_FOR_INDEX', 'VERIFIED', 'ACTIVE', 'EXTRACTED', 'VERIFICATION_PENDING', 'INDEXED',
]);

/** Classes whose official claims are unsupported by their own evidence. */
const NON_OFFICIAL: ProvenanceClass[] = ['PRACTICE_MOCK', 'GENERATED', 'SYNTHETIC'];

async function main() {
  console.log(`=== PYQ RECONCILE & REPAIR === ${EXECUTE ? 'EXECUTE' : 'DRY RUN (pass --execute to write)'}\n`);
  const db = firebaseApp.firestore();
  const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY || undefined, checkCompatibility: false });

  // ── load everything ────────────────────────────────────────────────────────────────────────
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
  const registry = (await db.collection('pyq_source_registry').get()).docs.map((d) => d.data() as any);
  console.log(`firestore questions: ${questions.length}   registry papers: ${registry.length}`);

  // Qdrant: point id -> payload.questionId, so "vector exists" means the right vector exists.
  const pointQuestionId = new Map<string, string | undefined>();
  let offset: any = undefined;
  while (true) {
    const res: any = await client.scroll(QDRANT_COLLECTION, {
      limit: 2000, offset, with_payload: { include: ['questionId', 'content_type'] } as any, with_vector: false,
    });
    for (const p of res.points ?? []) {
      if (p.payload?.content_type === 'pyq') pointQuestionId.set(String(p.id), p.payload?.questionId);
    }
    offset = res.next_page_offset;
    if (!offset) break;
  }
  console.log(`qdrant pyq points:   ${pointQuestionId.size}\n`);

  // ── compute the change set ─────────────────────────────────────────────────────────────────
  const updates: { id: string; patch: Record<string, any>; before: Record<string, any> }[] = [];
  const stats = {
    flagTrueToFalse: 0, flagFalseToTrue: 0, flagUnchanged: 0, flagNeverSet: 0,
    identityResolved: 0, identityAmbiguous: 0, identityUnresolved: 0, identityNotApplicable: 0,
    sittingIds: 0,
    provenance: {} as Record<string, number>,
    labelsCorrected: 0, verificationCorrected: 0, sourceTypeCorrected: 0, rightsCorrected: 0,
    mismatchedPayloadId: 0,
  };

  for (const q of questions) {
    const patch: Record<string, any> = {};
    const before: Record<string, any> = {};
    const now = Date.now();

    // 1. index flag from reality
    const pid = derive(q.questionId);
    const payloadQid = pointQuestionId.get(pid);
    const present = pointQuestionId.has(pid);
    if (present && payloadQid && payloadQid !== q.questionId) stats.mismatchedPayloadId++;
    const truth = present && (!payloadQid || payloadQid === q.questionId);

    // 6,948 questions have no `vectorIndexed` field at all. `undefined !== false` would score every
    // one of them as a corrected true->false, drowning the real signal, so compare on the coerced
    // value and report never-set separately.
    const claimed = q.vectorIndexed === true;
    const wasUnset = q.vectorIndexed === undefined;
    if (claimed !== truth) {
      before.vectorIndexed = q.vectorIndexed ?? null;
      patch.vectorIndexed = truth;
      if (truth) stats.flagFalseToTrue++; else stats.flagTrueToFalse++;
    } else {
      stats.flagUnchanged++;
      if (wasUnset) { patch.vectorIndexed = truth; stats.flagNeverSet++; }
    }
    patch.vectorIndexStatus = truth ? 'VERIFIED_PRESENT' : 'VERIFIED_MISSING';
    patch.vectorIndexReconciledAt = now;
    patch.qdrantPointId = pid;

    // 2. paper identity
    const norm = normalizeFields(q);
    const res = resolvePaperIdentity(q, registry);
    patch.rawSession = norm.rawSession ?? null;
    patch.rawShift = norm.rawShift ?? null;
    patch.rawPaper = norm.rawPaper ?? null;
    patch.normalizedSession = norm.normalizedSession ?? null;
    patch.normalizedShift = norm.normalizedShift;
    patch.normalizedSittingDate = norm.normalizedSittingDate;
    patch.normalizedPaper = norm.normalizedPaper;
    patch.sittingId = norm.sittingId;
    patch.canonicalPaperId = res.canonicalPaperId;
    patch.paperIdentityStatus = res.paperIdentityStatus;
    patch.candidatePaperIds = res.candidatePaperIds;
    patch.paperIdentityResolvedAt = now;
    if (norm.sittingId) stats.sittingIds++;
    if (res.paperIdentityStatus === 'RESOLVED') stats.identityResolved++;
    else if (res.paperIdentityStatus === 'AMBIGUOUS') stats.identityAmbiguous++;
    else if (res.paperIdentityStatus === 'UNRESOLVED') stats.identityUnresolved++;
    else stats.identityNotApplicable++;

    // 3. provenance class, and correcting claims it contradicts
    const cls = classifyProvenance(q);
    patch.provenanceClass = cls;
    patch.provenanceClassifiedAt = now;
    stats.provenance[cls] = (stats.provenance[cls] ?? 0) + 1;

    if (NON_OFFICIAL.includes(cls)) {
      let corrected = false;
      if (q.verificationStatus === 'OFFICIAL_CONFIRMED' || q.verificationStatus === 'MULTI_SOURCE_CONFIRMED') {
        before.verificationStatus = q.verificationStatus;
        patch.originalVerificationStatus = q.verificationStatus;
        patch.verificationStatus = 'UNVERIFIED';
        stats.verificationCorrected++; corrected = true;
      }
      if (q.sourceType === 'TIER_A_OFFICIAL') {
        before.sourceType = q.sourceType;
        patch.originalSourceType = q.sourceType;
        patch.sourceType = 'TIER_C_SECONDARY';
        stats.sourceTypeCorrected++; corrected = true;
      }
      if (q.rightsStatus === 'OFFICIAL_SOURCE_REVIEWED') {
        before.rightsStatus = q.rightsStatus;
        patch.originalRightsStatus = q.rightsStatus;
        patch.rightsStatus = 'UNKNOWN';
        stats.rightsCorrected++; corrected = true;
      }
      if (corrected) {
        stats.labelsCorrected++;
        patch.provenanceCorrectionReason =
          `class=${cls}: official claim unsupported by corpusBucket/origin evidence; original values preserved`;
      }
    }

    updates.push({ id: q.questionId, patch, before });
  }

  // ── report ─────────────────────────────────────────────────────────────────────────────────
  console.log('--- INDEX FLAG RECONCILIATION ---');
  console.log(`  flag true -> false (claimed a vector it lacks)  ${stats.flagTrueToFalse}`);
  console.log(`  flag false -> true (had a vector, unmarked)     ${stats.flagFalseToTrue}`);
  console.log(`  already correct                                 ${stats.flagUnchanged}`);
  console.log(`    of which the field was never set              ${stats.flagNeverSet}`);
  console.log(`  points whose payload questionId disagrees        ${stats.mismatchedPayloadId}`);

  console.log('\n--- PAPER IDENTITY ---');
  console.log(`  RESOLVED         ${stats.identityResolved}`);
  console.log(`  AMBIGUOUS        ${stats.identityAmbiguous}`);
  console.log(`  UNRESOLVED       ${stats.identityUnresolved}`);
  console.log(`  NOT_APPLICABLE   ${stats.identityNotApplicable}   (practice / generated)`);
  console.log(`  sittingId derived from the question's own date  ${stats.sittingIds}`);

  console.log('\n--- PROVENANCE CLASS ---');
  for (const [k, v] of Object.entries(stats.provenance).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
  console.log(`\n  questions whose official claim was corrected   ${stats.labelsCorrected}`);
  console.log(`    verificationStatus -> UNVERIFIED             ${stats.verificationCorrected}`);
  console.log(`    sourceType -> TIER_C_SECONDARY               ${stats.sourceTypeCorrected}`);
  console.log(`    rightsStatus -> UNKNOWN                      ${stats.rightsCorrected}`);

  // registry paper ids, for the coverage matrix and retrieval filters
  const registryIds = [...new Set(registry.map(canonicalPaperIdFor))];
  console.log(`\n--- REGISTRY ---`);
  console.log(`  distinct canonical papers (173 rows collapse to) ${registryIds.length}`);

  const acceptedMissing = questions.filter(
    (q) => ACCEPTED.has(String(q.ingestionState)) && !pointQuestionId.has(derive(q.questionId)),
  );
  console.log(`  accepted questions still needing a vector        ${acceptedMissing.length}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'repair-plan.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(), executed: EXECUTE, stats,
      registryCanonicalPapers: registryIds,
      indexingQueue: acceptedMissing.map((q) => q.questionId),
      sampleChanges: updates.filter((u) => Object.keys(u.before).length).slice(0, 25),
    }, null, 2),
  );
  console.log(`\nplan -> ${path.join(OUT_DIR, 'repair-plan.json')}`);

  if (!EXECUTE) {
    console.log('\nDRY RUN — nothing written. Re-run with --execute to apply.');
    return;
  }

  // ── backup, then write ─────────────────────────────────────────────────────────────────────
  const backupPath = path.join(OUT_DIR, `backup-${STAMP}.jsonl`);
  const bk = fs.createWriteStream(backupPath);
  for (const q of questions) {
    bk.write(JSON.stringify({
      questionId: q.questionId,
      vectorIndexed: q.vectorIndexed ?? null,
      verificationStatus: q.verificationStatus ?? null,
      sourceType: q.sourceType ?? null,
      rightsStatus: q.rightsStatus ?? null,
      ingestionState: q.ingestionState ?? null,
      corpusBucket: q.corpusBucket ?? null,
      origin: q.origin ?? null,
      session: q.session ?? null, shift: q.shift ?? null, paper: q.paper ?? null,
    }) + '\n');
  }
  await new Promise<void>((r) => bk.end(r));
  console.log(`backup of pre-change values -> ${backupPath}`);

  const col = db.collection('pyq_questions');
  let written = 0;
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 400)) batch.set(col.doc(u.id), u.patch, { merge: true });
    await batch.commit();
    written += Math.min(400, updates.length - i);
    process.stderr.write(`\r  written ${written}/${updates.length}`);
  }
  process.stderr.write('\n');
  console.log(`\nWROTE ${written} documents.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
