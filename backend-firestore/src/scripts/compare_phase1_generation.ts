/**
 * Phase 1 GraphRAG — before/after GENERATION comparison (uses Gemini; ~₹1).
 *
 * For one comparative query it generates two answers on the same notebook:
 *   (A) vector-only  : Pinecone context -> Gemini   (the OLD pipeline)
 *   (B) hybrid       : KG context + Pinecone context -> Gemini  (Phase 1)
 * and prints both plus a keyword-grounding delta so the improvement is visible.
 *
 * Usage: npx tsx src/scripts/compare_phase1_generation.ts [notebookId]
 */
import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';
import { IAIProvider } from '../core/interfaces/IAIProvider';
import { RetrievalService } from '../services/rag/retrieval.service';
import { graphRetrievalService } from '../services/rag/graphRetrieval.service';
import { buildScholarlySystemPrompt } from '../config/prompts';

const DEFAULT_NOTEBOOK = 'ncert-c11-physics';
const QUERY = 'What is the difference between distance and displacement?';

// Concepts a well-grounded answer to this comparative question should touch.
const GROUNDING_KEYWORDS = [
  'scalar', 'vector', 'path length', 'shortest', 'magnitude', 'direction',
  'straight line', 'initial', 'final', 'position',
];

function grounding(answer: string): { hits: string[]; score: number } {
  const lower = answer.toLowerCase();
  const hits = GROUNDING_KEYWORDS.filter((k) => lower.includes(k));
  return { hits, score: hits.length };
}

async function buildVectorContext(retrieval: RetrievalService, notebookId: string): Promise<string> {
  const results = await retrieval.retrieveContext(QUERY, notebookId, undefined, 5);
  let ctx = '';
  if (results.length > 0) {
    ctx += '=== NOTEBOOK CONTEXT ===\n';
    for (const r of results) {
      ctx += `[Citation: ${r.source} (Page ${r.metadata?.pageNumber || 1})]\n${r.text}\n\n`;
    }
  }
  return ctx;
}

async function generate(ai: IAIProvider, retrievedContext: string): Promise<string> {
  const hasNotebookContext = retrievedContext.length > 50;
  const systemPrompt = buildScholarlySystemPrompt({
    mode: 'TEACHER',
    retrievedContext: retrievedContext || 'No specific context found.',
    hasNotebookContext,
  });
  const res = await ai.generateResponse(
    [{ role: 'user', content: QUERY }],
    systemPrompt,
    { operation: 'phase1_compare' }
  );
  return res.reply;
}

async function run() {
  const notebookId = process.argv[2] || DEFAULT_NOTEBOOK;
  bootstrapDI();
  const ai = container.resolve<IAIProvider>(TOKENS.AIProvider);
  const retrieval = new RetrievalService();

  console.log('='.repeat(72));
  console.log(`Phase 1 before/after generation comparison — notebook: ${notebookId}`);
  console.log(`Query: "${QUERY}"`);
  console.log('='.repeat(72));

  // Shared vector context (retrieved once, reused for a fair comparison).
  const vectorCtx = await buildVectorContext(retrieval, notebookId);
  const graphRes = await graphRetrievalService.getGraphContext(notebookId, QUERY);
  const hybridCtx = graphRes.contextString
    ? `=== KNOWLEDGE GRAPH CONTEXT ===\n${graphRes.contextString}\n\n${vectorCtx}`
    : vectorCtx;

  console.log(`\nVector context chars : ${vectorCtx.length}`);
  console.log(`Graph context chars  : ${graphRes.contextString.length} (matched: ${graphRes.matched.map((m) => m.label.slice(0, 40)).join(', ')})`);

  // (A) Vector-only
  console.log('\n\n########## (A) VECTOR-ONLY (old pipeline) ##########\n');
  const answerA = await generate(ai, vectorCtx);
  console.log(answerA);

  // (B) Hybrid GraphRAG
  console.log('\n\n########## (B) HYBRID GraphRAG (Phase 1) ##########\n');
  const answerB = await generate(ai, hybridCtx);
  console.log(answerB);

  // Grounding delta
  const gA = grounding(answerA);
  const gB = grounding(answerB);
  console.log('\n\n' + '='.repeat(72));
  console.log('GROUNDING KEYWORD COMPARISON');
  console.log('='.repeat(72));
  console.log(`(A) vector-only : ${gA.score}/${GROUNDING_KEYWORDS.length}  -> ${gA.hits.join(', ')}`);
  console.log(`(B) hybrid      : ${gB.score}/${GROUNDING_KEYWORDS.length}  -> ${gB.hits.join(', ')}`);
  console.log(`answer length   : A=${answerA.length} chars, B=${answerB.length} chars`);
  console.log(`\nGemini calls    : 2 (one per variant). Graph retrieval added: 0 Gemini calls.`);
  process.exit(0);
}

run().catch((e) => {
  console.error('Comparison failed:', e);
  process.exit(1);
});
