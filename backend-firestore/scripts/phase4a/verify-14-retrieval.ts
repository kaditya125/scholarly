/**
 * Parts 4-7 — end-to-end verification against the real indexed corpus.
 */
import 'dotenv/config';
import { env } from '../../src/config/env';
import { GoogleEmbeddingProvider } from '../../src/services/ai/providers/google-embedding.provider';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { retrievalService } from '../../src/services/rag/retrieval.service';
import { executeVoiceTool } from '../../src/services/voice/voiceTools';
import { requireNoIndexer } from './_embedding-guard';

const now = () => Date.now();
const CTX = { userId: 'synthetic-verification-uid' };

(async () => {
  // This suite performs real semantic retrieval throughout, so it yields to a live indexer.
  requireNoIndexer('phase4a retrieval verification');

  // ── PART 4: Pinecone markers ────────────────────────────────────────────────────────
  console.log('=== PART 4a: Pinecone ===');
  console.log(`namespace: ${JSON.stringify(env.PINECONE_NAMESPACE)}`);
  const v = await new GoogleEmbeddingProvider().generateEmbedding('quantitative aptitude syllabus');
  for (const f of [{ documentType: 'OFFICIAL_SYLLABUS' }, { vectorKind: 'CANONICAL_SYLLABUS_NODE' }, { examId: 'SSC_CGL' }]) {
    const m = await pineconeService.queryVectors(v as any, 10, f as any, env.PINECONE_NAMESPACE);
    console.log(`  ${JSON.stringify(f).padEnd(46)} -> ${m?.length ?? 0}`);
  }
  const sample = await pineconeService.queryVectors(v as any, 1, { examId: 'SSC_CGL' } as any, env.PINECONE_NAMESPACE);
  if (sample?.length) {
    const md: any = (sample[0] as any).metadata;
    console.log(`  sample: examId=${md.examId} documentType=${md.documentType} vectorKind=${md.vectorKind}`);
    console.log(`          authority=${md.authority} status=${md.status} score=${(sample[0] as any).score?.toFixed(3)}`);
  }

  // ── PART 4b: the real retrieval service, all three casings ──────────────────────────
  console.log('\n=== PART 4b: retrieveOfficialSyllabusContext ===');
  for (const examId of ['ssc-cgl', 'SSC_CGL', 'Ssc Cgl']) {
    const t = now();
    const r: any[] = await retrievalService.retrieveOfficialSyllabusContext(examId, 'quantitative aptitude', 4);
    const md: any = r[0]?.metadata || {};
    console.log(`  ${JSON.stringify(examId).padEnd(11)} found=${r.length > 0} results=${r.length} ${now() - t}ms  examId=${md.examId ?? '-'} documentType=${md.documentType ?? '-'} vectorKind=${md.vectorKind ?? '-'} top=${(r[0] as any)?.score?.toFixed?.(3) ?? '-'}`);
  }

  console.log('\n  three realistic syllabus queries:');
  for (const q of ['what is in the reasoning syllabus', 'does the exam cover statistics', 'English comprehension topics']) {
    const t = now();
    const r: any[] = await retrievalService.retrieveOfficialSyllabusContext('SSC_CGL', q, 4);
    console.log(`   "${q}"`);
    console.log(`      found=${r.length > 0} chunks=${r.length} ${now() - t}ms  heading=${String((r[0]?.metadata as any)?.heading ?? '-').slice(0, 62)}`);
  }

  // ── PART 5: exam isolation ──────────────────────────────────────────────────────────
  console.log('\n=== PART 5: exam isolation ===');
  const other: any[] = await retrievalService.retrieveOfficialSyllabusContext('UPSC_CSE', 'quantitative aptitude', 4);
  console.log(`  UPSC_CSE (no corpus) -> ${other.length} results  ${other.length === 0 ? '(cannot see SSC_CGL data)' : '*** LEAK ***'}`);

  // ── PART 6: cache ───────────────────────────────────────────────────────────────────
  console.log('\n=== PART 6: cache ===');
  const Q = 'reasoning syllabus topics';
  const t1 = now(); await retrievalService.retrieveOfficialSyllabusContext('SSC_CGL', Q, 4); const m1 = now() - t1;
  const t2 = now(); await retrievalService.retrieveOfficialSyllabusContext('SSC_CGL', Q, 4); const m2 = now() - t2;
  const t3 = now(); await retrievalService.retrieveOfficialSyllabusContext('UPSC_CSE', Q, 4); const m3 = now() - t3;
  console.log(`  SSC_CGL + Q (1st) ${String(m1).padStart(5)}ms   miss`);
  console.log(`  SSC_CGL + Q (2nd) ${String(m2).padStart(5)}ms   hit=${m2 < Math.max(50, m1 / 3)}`);
  console.log(`  OTHER   + Q       ${String(m3).padStart(5)}ms   distinct entry=${m3 > Math.max(50, m2 * 2)}`);

  // ── PART 7: voice tool states ───────────────────────────────────────────────────────
  console.log('\n=== PART 7: voice tool ===');
  const s1: any = await executeVoiceTool('searchSyllabus', { examId: 'SSC_CGL', query: 'quantitative aptitude' }, CTX);
  console.log(`  State 1 (syllabus + match)   found=${s1.found} authoritative=${s1.authoritative} snippets=${s1.snippets?.length ?? 0}`);
  const s2: any = await executeVoiceTool('searchSyllabus', { examId: 'SSC_CGL', query: 'medieval French poetry' }, CTX);
  console.log(`  State 2 (syllabus, no match) found=${s2.found} syllabusAvailable=${s2.syllabusAvailable} reason=${String(s2.reason).slice(0, 62)}`);
  const s3: any = await executeVoiceTool('searchSyllabus', { examId: 'UPSC_CSE', query: 'polity' }, CTX);
  console.log(`  State 3 (no syllabus)        found=${s3.found} syllabusAvailable=${s3.syllabusAvailable}`);
  console.log(`     reason: ${s3.reason}`);
  const k: any = await executeVoiceTool('searchKnowledge', { query: 'newton laws of motion' }, CTX);
  console.log(`  searchKnowledge              found=${k.found} snippets=${k.snippets?.length ?? 0}`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
