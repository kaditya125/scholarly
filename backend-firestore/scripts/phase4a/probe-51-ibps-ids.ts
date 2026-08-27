import 'dotenv/config';
import { env } from '../../src/config/env';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { PROBE_VECTOR } from './_embedding-guard';
(async () => {
  const m = await pineconeService.queryVectors(PROBE_VECTOR as any, 100, { examId: 'IBPS_PO' } as any, env.PINECONE_NAMESPACE);
  const ids = (m || []).map((x: any) => x.id);
  console.log(`matches: ${ids.length}, unique ids: ${new Set(ids).size}`);
  ids.slice(0, 20).forEach((i: string) => console.log('  ' + i));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
