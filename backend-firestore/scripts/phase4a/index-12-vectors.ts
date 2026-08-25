/**
 * Part 2 Step 6/7 — index the VERIFIED syllabus into the namespace retrieval actually reads.
 * Runs before publication on purpose: the lifecycle should only reach CURRENT once retrieval has
 * been shown to work against real vectors.
 */
import 'dotenv/config';
import { env } from '../../src/config/env';
import { examRepository } from '../../src/repositories/exam.repository';
import { syllabusIngestionService } from '../../src/services/exam/syllabusIngestion.service';

(async () => {
  const syllabus = await examRepository.getSyllabusById('syl_ssc_cgl_2026_2026_v1');
  if (!syllabus) throw new Error('syllabus record not found');
  console.log(`syllabus ${syllabus.syllabusId}  status=${syllabus.status}`);
  console.log(`target namespace = ${JSON.stringify(env.PINECONE_NAMESPACE)}\n`);

  const started = Date.now();
  const count = await syllabusIngestionService.indexSyllabusToVectorDb(syllabus, 'phase4a-ingestion');
  console.log(`\nvectors upserted: ${count}  in ${Math.round((Date.now() - started) / 1000)}s`);
  process.exit(count > 0 ? 0 : 4);
})().catch((e) => { console.error('INDEX FAILED:', e?.stack || e?.message || e); process.exit(1); });
