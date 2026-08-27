/**
 * Mark a syllabus version as deliberately excluded from indexing.
 *
 * A VERIFIED record is a standing instruction to `index-27` to index it, so simply stopping a run
 * does not stop the next one — the batch would pick BPSC_ASST_PROF straight back up and spend
 * another two hours on the thing we just chose not to spend two hours on.
 *
 * The exclusion is recorded as its own field rather than by demoting the status to INVALID. The
 * tree IS valid — it re-validated cleanly with 2,560 nodes and zero errors. Writing INVALID would
 * be a lie in the one place a future reader would trust, and would hide a real decision behind a
 * fake validation failure.
 *
 *   npx tsx scripts/phase4a/exclude-57-indexing.ts <syllabusId> "<reason>" [--apply]
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';

const APPLY = process.argv.includes('--apply');
const [syllabusId, reason] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

(async () => {
  if (!syllabusId || !reason) {
    console.error('usage: exclude-57-indexing.ts <syllabusId> "<reason>" [--apply]');
    process.exit(64);
  }
  const ref = db.collection('exam_syllabi').doc(syllabusId);
  const snap = await ref.get();
  if (!snap.exists) { console.error('no such syllabus:', syllabusId); process.exit(1); }
  const s: any = snap.data();
  console.log(`${s.examId}  ${syllabusId}  status=${s.status}`);
  console.log(`  reason: ${reason}`);
  if (!APPLY) { console.log('DRY RUN — pass --apply'); process.exit(0); }

  await ref.update({
    indexingExcluded: true,
    indexingExcludedReason: reason,
    indexingExcludedAt: Date.now(),
  });
  console.log('  marked indexingExcluded=true');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
