/**
 * P3: backfill sitting identity from identifiers the ingestion already assigned.
 *
 * DRY RUN BY DEFAULT; `--execute` writes after taking a backup. Purely additive — it only fills
 * `sittingId` / `normalizedSittingDate` / `sittingSource` where they are absent, and never
 * overwrites a sitting that the question's own metadata already established.
 *
 * Recovery, not inference. The reconnaissance found the date sitting inside the id for 2,604 of
 * the 2,662 JEE Main records that lacked one, and 9,233 of SSC CGL's 14,009 — written there by
 * whoever ingested the paper. This relocates it into a field retrieval can filter on.
 *
 * Records with no recoverable date are marked `sittingSource: 'UNRESOLVED'` and left alone. That
 * is the honest outcome for SSC CGL's practice material ("Concept Drill", "Practice Set"), which
 * has no sitting because it never sat.
 */
import { firebaseApp } from '../../../src/config/firebase';
import { recoverSittingFromIdentifiers } from '../../../src/services/pyq/paperIdentity';
import * as fs from 'fs';
import * as path from 'path';

const EXECUTE = process.argv.includes('--execute');
const OUT_DIR = path.join(__dirname, 'out');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';

async function main() {
  console.log(`=== SITTING IDENTITY BACKFILL === ${EXECUTE ? 'EXECUTE' : 'DRY RUN (pass --execute to write)'}\n`);
  const db = firebaseApp.firestore();

  const rows: { docId: string; d: any }[] = [];
  let last: any = null;
  while (true) {
    let q: FirebaseFirestore.Query = db.collection('pyq_questions').orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const s = await q.get();
    if (s.empty) break;
    for (const doc of s.docs) rows.push({ docId: doc.id, d: doc.data() as any });
    last = s.docs[s.docs.length - 1];
    if (s.size < 2000) break;
  }
  console.log(`records: ${rows.length}`);

  const updates: { docId: string; patch: Record<string, any> }[] = [];
  const stats = {
    alreadyHadSitting: 0, recovered: 0, unresolved: 0,
    byExam: {} as Record<string, { recovered: number; unresolved: number; already: number }>,
    sampleRecovered: [] as any[],
  };
  const bump = (exam: string, k: 'recovered' | 'unresolved' | 'already') => {
    stats.byExam[exam] = stats.byExam[exam] ?? { recovered: 0, unresolved: 0, already: 0 };
    stats.byExam[exam][k]++;
  };

  for (const { docId, d } of rows) {
    const exam = String(d.examId ?? 'undefined');

    if (has(d.sittingId)) {
      stats.alreadyHadSitting++; bump(exam, 'already');
      // Record how it was established, for records that predate this field.
      if (!has(d.sittingSource)) updates.push({ docId, patch: { sittingSource: 'QUESTION_METADATA' } });
      continue;
    }

    const rec = recoverSittingFromIdentifiers(d);
    if (rec) {
      stats.recovered++; bump(exam, 'recovered');
      if (stats.sampleRecovered.length < 8) {
        stats.sampleRecovered.push({ questionId: d.questionId, sittingId: rec.sittingId, evidence: rec.evidence });
      }
      updates.push({
        docId,
        patch: {
          sittingId: rec.sittingId,
          normalizedSittingDate: rec.date,
          sittingSource: rec.source,
          sittingEvidence: rec.evidence,
          sittingResolvedAt: Date.now(),
        },
      });
    } else {
      stats.unresolved++; bump(exam, 'unresolved');
      if (!has(d.sittingSource)) updates.push({ docId, patch: { sittingSource: 'UNRESOLVED' } });
    }
  }

  console.log('\n--- outcome ---');
  console.log(`  already had a sitting   ${stats.alreadyHadSitting}`);
  console.log(`  recovered from ids      ${stats.recovered}`);
  console.log(`  unresolved (left alone) ${stats.unresolved}`);
  console.log('\n  per exam:');
  console.log(`    ${'exam'.padEnd(14)} ${'already'.padStart(8)} ${'recovered'.padStart(10)} ${'unresolved'.padStart(11)}`);
  for (const [exam, s] of Object.entries(stats.byExam).sort((a, b) => (b[1].recovered + b[1].already) - (a[1].recovered + a[1].already))) {
    console.log(`    ${exam.padEnd(14)} ${String(s.already).padStart(8)} ${String(s.recovered).padStart(10)} ${String(s.unresolved).padStart(11)}`);
  }
  console.log('\n  sample recoveries:');
  for (const s of stats.sampleRecovered) console.log(`    ${String(s.questionId).slice(0, 48).padEnd(50)} -> ${s.sittingId}  (from "${s.evidence}")`);
  console.log(`\n  documents to write: ${updates.length}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'sitting-backfill-plan.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), executed: EXECUTE, stats }, null, 2));

  if (!EXECUTE) { console.log('\nDRY RUN — nothing written.'); return; }

  const bk = fs.createWriteStream(path.join(OUT_DIR, `sitting-backup-${STAMP}.jsonl`));
  for (const { docId, d } of rows) {
    bk.write(JSON.stringify({ docId, sittingId: d.sittingId ?? null, normalizedSittingDate: d.normalizedSittingDate ?? null, sittingSource: d.sittingSource ?? null }) + '\n');
  }
  await new Promise<void>((r) => bk.end(r));

  const col = db.collection('pyq_questions');
  let written = 0;
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 400)) batch.set(col.doc(u.docId), u.patch, { merge: true });
    await batch.commit();
    written += Math.min(400, updates.length - i);
    process.stderr.write(`\r  written ${written}/${updates.length}`);
  }
  process.stderr.write('\n');
  console.log(`WROTE ${written} documents.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
