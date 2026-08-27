/**
 * Index every VERIFIED syllabus, then publish the ones that indexed cleanly.
 *
 * Publication is gated per exam on its own indexing, not on the batch: a syllabus promoted to
 * CURRENT without vectors is worse than one left unpublished, because the API then serves it as
 * authoritative while retrieval finds nothing for it.
 *
 * Sequential and paced — gemini-embedding is quota-limited per minute, and a parallel burst is the
 * reliable way to get throttled halfway through and leave the set half-indexed.
 *
 *   npx tsx scripts/phase4a/index-27-publish-verified.ts [--dry]
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { examRepository } from '../../src/repositories/exam.repository';
import { examMasterService } from '../../src/services/exam/examMaster.service';
import { syllabusIngestionService } from '../../src/services/exam/syllabusIngestion.service';
import { acquireIndexerLock, releaseIndexerLock } from './_embedding-guard';

const DRY = process.argv.includes('--dry');

(async () => {
  /*
   * Announce this run so audit and verification scripts refuse to spend embedding quota while
   * it is in flight. Also stops a second indexer being started by accident, which would double
   * the request rate against a per-minute limit and strand both runs half-finished.
   */
  if (!DRY) acquireIndexerLock('index-27-publish-verified');

  const snap = await db.collection('exam_syllabi').where('status', '==', 'VERIFIED').get();
  /*
   * A VERIFIED record is a standing instruction to index. Honour an explicit opt-out, or a
   * version someone deliberately stopped gets picked straight back up by the next run.
   */
  const all = snap.docs.map((d) => d.data() as any);
  const excluded = all.filter((s) => s.indexingExcluded);
  const targets = all.filter((s) => !s.indexingExcluded);
  for (const s of excluded) {
    console.log(`skip ${s.examId} — indexing excluded: ${s.indexingExcludedReason ?? 'no reason recorded'}`);
  }
  console.log(`${targets.length} VERIFIED syllabi${DRY ? '  (DRY RUN)' : ''}\n`);

  const results: Array<{ examId: string; vectors: number; published: boolean; note?: string }> = [];

  for (const s of targets) {
    console.log(`── ${s.examId}  ${s.syllabusId}`);
    if (DRY) { results.push({ examId: s.examId, vectors: 0, published: false, note: 'dry' }); continue; }

    let vectors = 0;
    try {
      const started = Date.now();
      vectors = await syllabusIngestionService.indexSyllabusToVectorDb(s, 'phase4a-publish');
      console.log(`   indexed ${vectors} vectors in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      console.log(`   INDEX FAILED: ${msg.slice(0, 120)}`);
      results.push({ examId: s.examId, vectors: 0, published: false, note: 'index failed' });

      /*
       * A spent embedding quota is shared by every exam in this batch, so carrying on just fails
       * the rest the same way — six exams once died inside eight minutes and wrote nothing. The
       * per-chunk backoff now absorbs ordinary windows; reaching here means it stayed exhausted
       * for several minutes, and the remaining exams are better left VERIFIED for a later run
       * than marked failed by a queue that never had a chance.
       */
      if (/429|RESOURCE_EXHAUSTED|Quota exceeded/i.test(msg)) {
        console.log('   quota still exhausted after backoff — stopping the batch.');
        console.log('   Remaining exams stay VERIFIED and will be picked up by the next run.');
        break;
      }
      continue;
    }

    if (vectors === 0) {
      console.log('   no vectors produced — not publishing');
      results.push({ examId: s.examId, vectors: 0, published: false, note: 'no vectors' });
      continue;
    }

    try {
      await examMasterService.publishSyllabusVersion(s.examId, s.cycleId, s.syllabusId, 'phase4a-publish');
      const after = await examRepository.getSyllabusById(s.syllabusId);
      const ok = after?.status === 'CURRENT';
      console.log(`   published: ${after?.status}`);
      results.push({ examId: s.examId, vectors, published: ok });
    } catch (e: any) {
      console.log(`   PUBLISH FAILED: ${String(e?.message).slice(0, 120)}`);
      results.push({ examId: s.examId, vectors, published: false, note: 'publish failed' });
    }
  }

  console.log('\n=== SUMMARY ===');
  let totalVectors = 0;
  for (const r of results) {
    totalVectors += r.vectors;
    console.log(`  ${r.examId.padEnd(14)} vectors=${String(r.vectors).padStart(4)}  published=${r.published}  ${r.note ?? ''}`);
  }
  console.log(`\n  published ${results.filter((r) => r.published).length}/${results.length}, ${totalVectors} vectors embedded`);
  releaseIndexerLock();
  process.exit(0);
})().catch((e) => { releaseIndexerLock(); console.error('FAILED:', e?.message || e); process.exit(1); });
