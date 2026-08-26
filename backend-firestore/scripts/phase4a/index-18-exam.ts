/**
 * Index any VERIFIED syllabus into the namespace retrieval reads.
 * Paced and incrementally flushed — see indexSyllabusToVectorDb.
 *
 *   npx tsx scripts/phase4a/index-18-exam.ts <syllabusId>
 */
import 'dotenv/config';
import { env } from '../../src/config/env';
import { examRepository } from '../../src/repositories/exam.repository';
import { syllabusIngestionService } from '../../src/services/exam/syllabusIngestion.service';

(async () => {
  const syllabusId = process.argv[2];
  if (!syllabusId) { console.error('usage: index-18-exam.ts <syllabusId>'); process.exit(64); }

  const syllabus = await examRepository.getSyllabusById(syllabusId);
  if (!syllabus) throw new Error(`syllabus not found: ${syllabusId}`);
  console.log(`${syllabus.syllabusId}  exam=${syllabus.examId}  status=${syllabus.status}`);
  console.log(`namespace=${JSON.stringify(env.PINECONE_NAMESPACE)}\n`);

  const t = Date.now();
  const count = await syllabusIngestionService.indexSyllabusToVectorDb(syllabus, 'phase4a-ingestion');
  console.log(`\nvectors upserted: ${count} in ${Math.round((Date.now() - t) / 1000)}s`);
  process.exit(count > 0 ? 0 : 4);
})().catch((e) => { console.error('INDEX FAILED:', e?.message || e); process.exit(1); });
