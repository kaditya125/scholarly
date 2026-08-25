/**
 * Phase 4A latency probe — splits the voice retrieval path into its legs.
 *
 * The tool call measured 6258ms with `pinecone_search` alone at 4228ms, which is far outside
 * normal for a vector query. This times each leg separately, cold then warm, so the cost lands
 * on whichever stage actually owns it instead of being attributed to Pinecone by default.
 *
 *   npx tsx scripts/bench-voice-rag.ts
 */
import 'dotenv/config';
import { GoogleEmbeddingProvider } from '../src/services/ai/providers/google-embedding.provider';
import { CohereRerankerProvider } from '../src/services/ai/providers/cohere-reranker.provider';
import { pineconeService } from '../src/services/rag/pinecone.service';

const embeddingProvider = new GoogleEmbeddingProvider();
const reranker = new CohereRerankerProvider();

const now = () => Number(process.hrtime.bigint() / 1000000n);

const QUERIES = [
  'quantitative aptitude syllabus',
  'explain probability in simple terms',
  'permutations and combinations',
];

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const a = now();
  const r = await fn();
  return [r, now() - a];
}

(async () => {
  console.log('=== voice RAG latency breakdown ===\n');

  // ── cold: first call pays for SDK init, auth, index discovery, model warmup ──────────
  const q0 = QUERIES[0];
  const [emb0, embMs0] = await timed(() => embeddingProvider.generateEmbedding(q0));
  console.log(`COLD  embedding        ${String(embMs0).padStart(6)}ms   dims=${(emb0 as any)?.length ?? '?'}`);

  const [, pineMs0] = await timed(() => pineconeService.queryVectors(emb0 as any, 16, undefined, undefined));
  console.log(`COLD  pinecone(topK16) ${String(pineMs0).padStart(6)}ms`);
  console.log(`COLD  total            ${String(embMs0 + pineMs0).padStart(6)}ms\n`);

  // ── warm: repeat to separate one-off initialisation from steady-state cost ───────────
  const embWarm: number[] = [];
  const pineWarm: number[] = [];
  for (let i = 0; i < 5; i++) {
    const q = QUERIES[i % QUERIES.length];
    const [e, em] = await timed(() => embeddingProvider.generateEmbedding(q));
    const [, pm] = await timed(() => pineconeService.queryVectors(e as any, 16, undefined, undefined));
    embWarm.push(em); pineWarm.push(pm);
    console.log(`WARM ${i + 1}  embedding ${String(em).padStart(5)}ms   pinecone ${String(pm).padStart(5)}ms   total ${String(em + pm).padStart(5)}ms`);
  }

  const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  console.log(`\nWARM avg embedding     ${String(avg(embWarm)).padStart(6)}ms`);
  console.log(`WARM avg pinecone      ${String(avg(pineWarm)).padStart(6)}ms`);
  console.log(`WARM avg total         ${String(avg(embWarm) + avg(pineWarm)).padStart(6)}ms`);

  // ── the third external hop: Cohere reranking (§13 - unnecessary work?) ───────────────
  console.log('=== reranker leg ===');
  const fakeDocs = Array.from({ length: 16 }, (_, i) => `Sample retrieved passage number ${i} about quantitative aptitude and probability.`);
  for (let i = 0; i < 3; i++) {
    const [, rm] = await timed(() => reranker.rerank(QUERIES[0], fakeDocs as any, 8) as any);
    console.log(`  rerank ${i + 1}  ${String(rm).padStart(5)}ms  (16 docs -> 8)`);
  }

  // ── does topK actually drive the cost? (§8) ──────────────────────────────────────────
  console.log('\n=== topK sensitivity (warm) ===');
  const [embK] = await timed(() => embeddingProvider.generateEmbedding(QUERIES[0]));
  for (const k of [4, 8, 16, 32]) {
    const [, ms] = await timed(() => pineconeService.queryVectors(embK as any, k, undefined, undefined));
    console.log(`  topK=${String(k).padStart(2)}  ${String(ms).padStart(5)}ms`);
  }

  process.exit(0);
})().catch((e) => { console.error('BENCH FAILED:', e?.message || e); process.exit(1); });
