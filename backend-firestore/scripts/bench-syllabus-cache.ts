/**
 * §6 mandatory test: does the syllabus cache leak between exams?
 *
 * retrieveOfficialSyllabusContext puts examId in the Pinecone FILTER but calls retrieveContext
 * with notebookId=''. The cache key is built from notebookId/query/topK/scopeKey — none of
 * which carry the exam. So two different exams asking the same question should collide.
 *
 * Proof: query exam A, then exam B with identical text. If the second is a cache hit, exam B
 * just received exam A's syllabus.
 *
 *   npx tsx scripts/bench-syllabus-cache.ts
 */
import 'dotenv/config';
import { retrievalService } from '../src/services/rag/retrieval.service';
import { cacheService } from '../src/services/cache.service';

const now = () => Number(process.hrtime.bigint() / 1000000n);
const QUERY = 'quantitative aptitude syllabus';
const EXAM_A = 'ssc-cgl';
const EXAM_B = 'upsc-cse';

(async () => {
  console.log('=== syllabus cache isolation (§6) ===\n');

  // Clear anything left from earlier runs so the first call is genuinely a miss.
  try { await (cacheService as any).clear?.(); } catch { /* optional API */ }

  const t1 = now();
  const a = await retrievalService.retrieveOfficialSyllabusContext(EXAM_A, QUERY, 4);
  const ms1 = now() - t1;
  console.log(`exam A (${EXAM_A})   ${String(ms1).padStart(5)}ms   results=${a.length}`);

  const t2 = now();
  const b = await retrievalService.retrieveOfficialSyllabusContext(EXAM_B, QUERY, 4);
  const ms2 = now() - t2;
  console.log(`exam B (${EXAM_B})  ${String(ms2).padStart(5)}ms   results=${b.length}`);

  // A cache hit returns in single-digit ms because it skips embedding + Pinecone entirely.
  const looksCached = ms2 < 100 && ms1 > 200;
  const identical = JSON.stringify(a) === JSON.stringify(b);

  console.log('');
  console.log(`second call fast enough to be a cache hit : ${looksCached}`);
  console.log(`both exams returned byte-identical results: ${identical}`);
  console.log('');
  if (looksCached || (identical && a.length > 0)) {
    console.log('*** CACHE COLLISION: exam B was served exam A\'s syllabus ***');
  } else if (a.length === 0 && b.length === 0) {
    console.log('INCONCLUSIVE: both empty — no syllabus documents indexed for these exams.');
    console.log('The key is still exam-agnostic by construction; this test cannot show it with no data.');
  } else {
    console.log('No collision observed.');
  }

  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
