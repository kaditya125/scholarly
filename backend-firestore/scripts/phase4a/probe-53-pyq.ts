import 'dotenv/config';
import { env } from '../../src/config/env';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { PROBE_VECTOR } from './_embedding-guard';
(async () => {
  const m = await pineconeService.queryVectors(PROBE_VECTOR as any, 100, { examId: 'IBPS_PO' } as any, env.PINECONE_NAMESPACE);
  const pyq = (m || []).filter((x: any) => String(x.id).startsWith('vec_pyq'));
  console.log(`pyq vectors: ${pyq.length}`);
  for (const p of pyq.slice(0, 3)) {
    const md: any = (p as any).metadata || {};
    const ts = md.createdAt || md.uploadedAt;
    console.log(`\n  ${(p as any).id}`);
    console.log(`    createdAt=${ts ? new Date(Number(ts)).toISOString() : md.createdAt ?? '?'}  documentType=${md.documentType}  vectorKind=${md.vectorKind}`);
    console.log(`    userId=${md.userId}  public=${md.public}  examId=${md.examId}`);
    console.log(`    text: ${String(md.text || '').slice(0, 120)}`);
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
