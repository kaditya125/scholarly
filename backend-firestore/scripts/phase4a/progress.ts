/**
 * Progress check that costs NO embedding quota.
 *
 * The earlier version embedded a query string on every call. Run alongside a live indexing job
 * that is already pacing itself against a per-minute limit, those extra calls are what pushed
 * gemini-embedding into 429 — a monitoring tool must not compete with the work it is monitoring.
 *
 * Pinecone only needs a vector of the right dimension to filter; scores are meaningless here and
 * the match COUNT is all we want, so a constant stands in for a real embedding.
 */
import 'dotenv/config';
import { env } from '../../src/config/env';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { db } from '../../src/config/firebase';

const DUMMY = new Array(768).fill(0.02);
const WATCH = process.argv.slice(2).length ? process.argv.slice(2)
  : ['UPSC_CSE', 'BPSC_CCE', 'BPSC_ASST_PROF', 'UPSC_NDA', 'BPSC_OSH', 'SSC_CHSL', 'UPSC_CDS'];

(async () => {
  for (const examId of WATCH) {
    const m = await pineconeService.queryVectors(DUMMY as any, 2000, { examId } as any, env.PINECONE_NAMESPACE);
    console.log(`  ${examId.padEnd(16)} vectors=${m?.length ?? 0}`);
  }
  const sy = await db.collection('exam_syllabi').get();
  console.log('\n  statuses:');
  sy.forEach((d) => { const x: any = d.data();
    if (WATCH.includes(x.examId) && x.status !== 'INVALID') console.log(`    ${x.examId.padEnd(16)} ${x.status}`); });
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
