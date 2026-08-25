/**
 * Part 3 — publication, and only after the chain ahead of it has been shown to hold:
 * real source -> non-empty document -> real hash -> parsed -> canonical nodes -> vectors indexed
 * -> retrieval verified. Publication is the last link, not a side effect of a successful download.
 */
import 'dotenv/config';
import { examMasterService } from '../../src/services/exam/examMaster.service';
import { examRepository } from '../../src/repositories/exam.repository';

const SYLLABUS_ID = 'syl_ssc_cgl_2026_2026_v1';

(async () => {
  const before = await examRepository.getSyllabusById(SYLLABUS_ID);
  if (!before) throw new Error('syllabus not found');
  console.log(`before: status=${before.status}`);
  if (before.status !== 'VERIFIED') {
    console.error(`refusing to publish from status ${before.status} — only VERIFIED may be promoted`);
    process.exit(3);
  }

  await examMasterService.publishSyllabusVersion('SSC_CGL', '2026', SYLLABUS_ID, 'phase4a-ingestion');

  const after = await examRepository.getSyllabusById(SYLLABUS_ID);
  console.log(`after : status=${after?.status}  publishedAt=${after?.publishedAt ? new Date(after.publishedAt).toISOString() : '-'}`);

  // The legacy invalid record must be untouched by any of this.
  const legacy = await examRepository.getSyllabusById('syl_ssc_cgl_2026_v1');
  console.log(`legacy syl_ssc_cgl_2026_v1: status=${legacy?.status}  (must still be INVALID)`);
  process.exit(0);
})().catch((e) => { console.error('PUBLISH FAILED:', e?.message || e); process.exit(1); });
