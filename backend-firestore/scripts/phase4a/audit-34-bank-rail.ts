import 'dotenv/config';
import { env } from '../../src/config/env';
import { GoogleEmbeddingProvider } from '../../src/services/ai/providers/google-embedding.provider';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { executeVoiceTool } from '../../src/services/voice/voiceTools';
import { countVectorsByExam, requireNoIndexer } from './_embedding-guard';

(async () => {
  const embed = new GoogleEmbeddingProvider();

  console.log('=== syllabus vectors by examId ===');
  for (const id of ['IBPS_PO', 'IBPS_CLERK', 'SBI_PO', 'SBI_CLERK', 'RBI_GRADE_B', 'RRB_NTPC', 'RRB_GROUP_D', 'RRB_ALP']) {
    const v = await embed.generateEmbedding('syllabus');
    const m = await pineconeService.queryVectors(v as any, 20, { examId: id } as any, env.PINECONE_NAMESPACE);
    console.log(`  ${id.padEnd(13)} ${m?.length ?? 0}`);
  }

  console.log('\n=== any indexed content on these topics (unfiltered) ===');
  for (const q of ['IBPS PO banking exam reasoning syllabus', 'RRB NTPC railway recruitment syllabus', 'banking awareness quantitative aptitude']) {
    const v = await embed.generateEmbedding(q);
    const m = await pineconeService.queryVectors(v as any, 3, {} as any, env.PINECONE_NAMESPACE);
    console.log(`\n  "${q}"`);
    (m || []).forEach((x: any) => console.log(`     ${(x.score ?? 0).toFixed(3)}  examId=${x.metadata?.examId ?? '-'}  ${String(x.metadata?.heading || x.metadata?.title || '').slice(0, 62)}`));
  }

  console.log('\n=== what a student actually gets ===');
  for (const [examId, q] of [['IBPS_PO', 'what is in the prelims syllabus'], ['RRB_NTPC', 'what is in the syllabus']]) {
    const r: any = await executeVoiceTool('searchSyllabus', { examId, query: q } as any, { userId: 'audit' });
    console.log(`  [${examId}] found=${r?.found} syllabusAvailable=${r?.syllabusAvailable ?? '-'} ${String(r?.message || '').slice(0, 90)}`);
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
