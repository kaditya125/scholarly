import 'dotenv/config';
import { env } from '../../src/config/env';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { PROBE_VECTOR } from '../phase4a/_embedding-guard';
import { db } from '../../src/config/firebase';

(async () => {
  const m = await pineconeService.queryVectors(
    PROBE_VECTOR as any, 2000, { vectorKind: 'CANONICAL_PYQ_QUESTION' } as any, env.PINECONE_NAMESPACE);
  const rows = (m || []) as any[];
  console.log(`PYQ vectors live in Pinecone: ${rows.length}`);
  const byExam: Record<string, number> = {};
  const byPublic: Record<string, number> = {};
  rows.forEach((r) => {
    const e = r.metadata?.examId || '?';
    byExam[e] = (byExam[e] || 0) + 1;
    byPublic[String(r.metadata?.public)] = (byPublic[String(r.metadata?.public)] || 0) + 1;
  });
  console.log(`  by exam:   ${JSON.stringify(byExam)}`);
  console.log(`  public flag: ${JSON.stringify(byPublic)}  <-- public:true means retrievable by any student`);

  const snap = await db.collection('pyq_questions').get();
  const all = snap.docs.map((d) => d.data() as any);
  const exams: Record<string, number> = {};
  all.forEach((q) => { exams[q.examId || '?'] = (exams[q.examId || '?'] || 0) + 1; });
  console.log(`\nFirestore pyq_questions: ${all.length}`);
  console.log(`  by exam: ${JSON.stringify(exams)}`);
  const placeholderHash = all.filter((q) => /^hash_/.test(String(q.contentHash || ''))).length;
  console.log(`  records whose contentHash is a placeholder string: ${placeholderHash}/${all.length}`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
