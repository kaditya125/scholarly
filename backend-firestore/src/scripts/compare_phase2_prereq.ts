/**
 * Phase 2 GraphRAG — before/after GENERATION comparison on a PREREQUISITE query
 * (uses Gemini; ~₹0.3). This is the strongest graph-win case: answering
 * "what should I study before X" requires prerequisite structure that pure
 * vector search cannot reason about.
 *
 *   (A) vector-only : Pinecone context (no graph, no expansion) -> Gemini  [OLD]
 *   (B) hybrid      : graph context + prereq chains + graph-expanded vector
 *                     recall -> Gemini                                     [Phase 1+2]
 *
 * Usage: npx tsx src/scripts/compare_phase2_prereq.ts [notebookId]
 */
import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';
import { IAIProvider } from '../core/interfaces/IAIProvider';
import { RetrievalService } from '../services/rag/retrieval.service';
import { graphRetrievalService } from '../services/rag/graphRetrieval.service';
import { buildScholarlySystemPrompt } from '../config/prompts';

const DEFAULT_NOTEBOOK = 'ncert-c11-physics';
const QUERY = 'What should I study before understanding momentum?';

// A good prerequisite answer should name upstream concepts AND give an order.
const GROUNDING_KEYWORDS = [
  'velocity', 'mass', 'force', 'newton', 'second law', 'motion',
  'inertia', 'acceleration', 'impulse', 'conservation',
];
const ORDER_MARKERS = ['first', 'then', 'before', 'next', 'start', 'prerequisite', 'step', 'order', 'begin'];

function count(answer: string, terms: string[]): string[] {
  const lower = answer.toLowerCase();
  return terms.filter((k) => lower.includes(k));
}

async function buildVectorContext(retrieval: RetrievalService, notebookId: string, expansionTerms?: string[]): Promise<string> {
  const results = await retrieval.retrieveContext(QUERY, notebookId, undefined, 5, expansionTerms);
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
    { operation: 'phase2_prereq_compare' }
  );
  return res.reply;
}

async function run() {
  const notebookId = process.argv[2] || DEFAULT_NOTEBOOK;
  bootstrapDI();
  const ai = container.resolve<IAIProvider>(TOKENS.AIProvider);
  const retrieval = new RetrievalService();

  console.log('='.repeat(72));
  console.log(`Phase 2 prerequisite before/after — notebook: ${notebookId}`);
  console.log(`Query: "${QUERY}"`);
  console.log('='.repeat(72));

  // (A) OLD: vector-only, no graph, no expansion.
  const vectorCtx = await buildVectorContext(retrieval, notebookId);

  // (B) NEW: graph context + prereq chains + graph-expanded vector recall.
  const graphRes = await graphRetrievalService.getGraphContext(notebookId, QUERY);
  const expandedVectorCtx = await buildVectorContext(retrieval, notebookId, graphRes.expansionTerms);
  const hybridCtx = graphRes.contextString
    ? `=== KNOWLEDGE GRAPH CONTEXT ===\n${graphRes.contextString}\n\n${expandedVectorCtx}`
    : expandedVectorCtx;

  console.log(`\nGraph anchors     : ${graphRes.matched.map((m) => m.label.slice(0, 40)).join(' | ')}`);
  console.log(`Prereq chains     : ${graphRes.chains.map((c) => c.slice(0, 60)).join(' || ') || '(none)'}`);
  console.log(`Expansion terms   : ${graphRes.expansionTerms.join(', ')}`);
  console.log(`Vector ctx chars  : A=${vectorCtx.length}  B=${expandedVectorCtx.length}`);
  console.log(`Graph ctx chars   : ${graphRes.contextString.length}`);

  console.log('\n\n########## (A) VECTOR-ONLY (old pipeline) ##########\n');
  const answerA = await generate(ai, vectorCtx);
  console.log(answerA);

  console.log('\n\n########## (B) HYBRID GraphRAG (Phase 1+2) ##########\n');
  const answerB = await generate(ai, hybridCtx);
  console.log(answerB);

  const kwA = count(answerA, GROUNDING_KEYWORDS);
  const kwB = count(answerB, GROUNDING_KEYWORDS);
  const ordA = count(answerA, ORDER_MARKERS);
  const ordB = count(answerB, ORDER_MARKERS);

  console.log('\n\n' + '='.repeat(72));
  console.log('SCORING');
  console.log('='.repeat(72));
  console.log(`prerequisite concepts named : A=${kwA.length}/${GROUNDING_KEYWORDS.length} (${kwA.join(', ')})`);
  console.log(`                            : B=${kwB.length}/${GROUNDING_KEYWORDS.length} (${kwB.join(', ')})`);
  console.log(`study-order markers         : A=${ordA.length} (${ordA.join(', ')})`);
  console.log(`                            : B=${ordB.length} (${ordB.join(', ')})`);
  console.log(`answer length               : A=${answerA.length}  B=${answerB.length}`);
  console.log(`\nGemini calls: 2. Graph retrieval + query expansion added: 0 Gemini calls.`);
  process.exit(0);
}

run().catch((e) => {
  console.error('Comparison failed:', e);
  process.exit(1);
});
