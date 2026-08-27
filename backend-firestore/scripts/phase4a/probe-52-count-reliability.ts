/** Is a constant probe vector a reliable way to COUNT filtered vectors in Pinecone? */
import 'dotenv/config';
import { env } from '../../src/config/env';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { PROBE_VECTOR } from './_embedding-guard';

(async () => {
  for (const topK of [10, 100, 500, 2000]) {
    const m = await pineconeService.queryVectors(PROBE_VECTOR as any, topK, { examId: 'IBPS_PO' } as any, env.PINECONE_NAMESPACE);
    const ids = (m || []).map((x: any) => x.id);
    const pyq = ids.filter((i: string) => i.startsWith('vec_pyq')).length;
    console.log(`  topK=${String(topK).padStart(4)} -> ${String(ids.length).padStart(3)} matches  (syllabus ${ids.length - pyq}, pyq ${pyq})`);
  }
  // A different constant, to see whether the result depends on WHICH vector we probe with.
  const alt = new Array(768).fill(0).map((_, i) => (i % 7) / 10);
  const m2 = await pineconeService.queryVectors(alt as any, 2000, { examId: 'IBPS_PO' } as any, env.PINECONE_NAMESPACE);
  console.log(`  different probe vector, topK=2000 -> ${m2?.length ?? 0} matches`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
