/**
 * Promote a VERIFIED syllabus to CURRENT — the last link, after retrieval has been shown to work.
 *   npx tsx scripts/phase4a/publish-19-exam.ts <examId> <cycleId> <syllabusId>
 */
import 'dotenv/config';
import { examMasterService } from '../../src/services/exam/examMaster.service';
import { examRepository } from '../../src/repositories/exam.repository';

(async () => {
  const [examId, cycleId, syllabusId] = process.argv.slice(2);
  if (!examId || !cycleId || !syllabusId) { console.error('usage: publish-19-exam.ts <examId> <cycleId> <syllabusId>'); process.exit(64); }

  const before = await examRepository.getSyllabusById(syllabusId);
  if (!before) throw new Error('syllabus not found');
  console.log(`before: ${syllabusId} status=${before.status}`);
  if (before.status !== 'VERIFIED') { console.error(`refusing: only VERIFIED may be promoted, found ${before.status}`); process.exit(3); }

  await examMasterService.publishSyllabusVersion(examId, cycleId, syllabusId, 'phase4a-ingestion');
  const after = await examRepository.getSyllabusById(syllabusId);
  console.log(`after : status=${after?.status} publishedAt=${after?.publishedAt ? new Date(after.publishedAt).toISOString() : '-'}`);
  process.exit(0);
})().catch((e) => { console.error('PUBLISH FAILED:', e?.message || e); process.exit(1); });
