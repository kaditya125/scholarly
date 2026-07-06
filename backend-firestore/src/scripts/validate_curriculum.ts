/**
 * Seed curriculum validation — runs REAL checks against the live pipeline for each
 * of the 10 seed notebooks and writes structured results to reports/curriculum_validation.json.
 *
 * Checks per notebook: READY sources, chunk count, KG nodes, Pinecone vectors (real query),
 * retrieval (real RAG), chat answer + citation verification, and flashcard/quiz/mind-map
 * generation (real aiOrchestrator calls). Failures are recorded honestly, never faked.
 *
 * Run:  npx tsx src/scripts/validate_curriculum.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../config/firebase';
import { env } from '../config/env';
import { ChatMessage } from '../types';
import { retrievalService } from '../services/rag/retrieval.service';
import { pineconeService } from '../services/rag/pinecone.service';
import { GoogleEmbeddingProvider } from '../services/ai/providers/google-embedding.provider';
import { aiOrchestrator, AILearningMode } from '../services/ai/ai.orchestrator';

interface Seed { id: string; query: string; }

const SEED: Seed[] = [
  { id: 'ncert-c9-physics', query: "State and explain Newton's three laws of motion." },
  { id: 'ncert-c10-science', query: 'Describe the physical and chemical properties of metals and non-metals.' },
  { id: 'ncert-c11-physics', query: 'Explain units, dimensions, and the process of measurement in physics.' },
  { id: 'ncert-c11-chemistry', query: 'Explain the mole concept and the basic concepts of chemistry.' },
  { id: 'ncert-c11-biology', query: 'Describe the classification and diversity of living organisms.' },
  { id: 'ncert-c11-mathematics', query: 'Explain sets, relations, and functions with examples.' },
  { id: 'ncert-c12-physics', query: "State Coulomb's law and explain electric charges and fields." },
  { id: 'ncert-c12-chemistry', query: 'Explain the types of solutions and terms used to express concentration.' },
  { id: 'ncert-c12-biology', query: 'Explain human reproduction and reproductive health.' },
  { id: 'ncert-c12-mathematics', query: 'Explain relations and functions and their different types.' },
];

const embedder = new GoogleEmbeddingProvider();

async function validateNotebook(nb: Seed): Promise<any> {
  const r: any = { id: nb.id, query: nb.query };
  console.log(`\n=== ${nb.id} ===`);

  // Notebook doc + title
  const doc = await db.collection('notebooks').doc(nb.id).get();
  r.exists = doc.exists;
  r.title = (doc.data() as any)?.title || nb.id;

  // READY sources + chunk count (authoritative from Firestore)
  const srcSnap = await db.collection('notebooks').doc(nb.id).collection('sources').where('status', '==', 'READY').get();
  r.readySources = srcSnap.size;
  r.chunkCount = srcSnap.docs.reduce((a, d) => a + ((d.data() as any).chunksExtracted || 0), 0);
  r.conceptsExtracted = srcSnap.docs.reduce((a, d) => a + ((d.data() as any).conceptsExtracted || 0), 0);

  // KG nodes
  r.kgNodes = (await db.collection('notebooks').doc(nb.id).collection('kg_nodes').get()).size;
  console.log(`  READY=${r.readySources} chunks=${r.chunkCount} concepts=${r.conceptsExtracted} kgNodes=${r.kgNodes}`);

  // Pinecone vectors present (real query filtered by notebookId)
  let queryEmbedding: number[] = [];
  try {
    queryEmbedding = await embedder.generateEmbedding(nb.query);
    const matches = await pineconeService.queryVectors(queryEmbedding, 100, { notebookId: nb.id }, env.PINECONE_NAMESPACE);
    r.pinecone = { present: (matches?.length || 0) > 0, sampledCount: matches?.length || 0, topScore: matches?.[0]?.score ?? null };
    console.log(`  pinecone: present=${r.pinecone.present} sampled=${r.pinecone.sampledCount} topScore=${(r.pinecone.topScore ?? 0).toFixed?.(3)}`);
  } catch (e: any) {
    r.pinecone = { error: e?.message || String(e) };
    console.log(`  pinecone ERROR: ${r.pinecone.error}`);
  }

  // Retrieval (real RAG)
  let ctx: any[] = [];
  try {
    ctx = await retrievalService.retrieveContext(nb.query, nb.id, undefined, 5);
    r.retrieval = {
      resultCount: ctx.length,
      topSource: ctx[0]?.source || null,
      topScore: ctx[0]?.score ?? null,
      sources: ctx.slice(0, 3).map((x) => x.source),
    };
    console.log(`  retrieval: results=${ctx.length} topScore=${(ctx[0]?.score ?? 0).toFixed?.(3)} topSource="${ctx[0]?.source || ''}"`);
  } catch (e: any) {
    r.retrieval = { error: e?.message || String(e) };
    console.log(`  retrieval ERROR: ${r.retrieval.error}`);
  }

  const contextData = ctx.length > 0 ? retrievalService.formatContextForPrompt(ctx) : '';

  // Chat answer + citation verification
  try {
    if (ctx.length > 0) {
      const history: ChatMessage[] = [{ role: 'user', content: nb.query, timestamp: Date.now() }];
      const ans = await aiOrchestrator.generateGroundedResponse(AILearningMode.TEACHER, history, contextData);
      const verify = await retrievalService.verifyClaimsAndCalculateConfidence(ans.reply, ctx);
      r.chat = {
        answerChars: ans.reply.length,
        confidenceScore: Number((verify.confidenceScore || 0).toFixed(3)),
        supportedClaims: verify.supportedClaims.length,
        unsupportedClaims: verify.unsupportedClaims.length,
        preview: ans.reply.slice(0, 180),
      };
      console.log(`  chat: chars=${r.chat.answerChars} confidence=${r.chat.confidenceScore} supported=${r.chat.supportedClaims} unsupported=${r.chat.unsupportedClaims}`);
    } else {
      r.chat = { skipped: 'no retrieval results above threshold' };
      console.log('  chat: SKIPPED (no retrieval results)');
    }
  } catch (e: any) {
    r.chat = { error: e?.message || String(e) };
    console.log(`  chat ERROR: ${r.chat.error}`);
  }

  // Asset generation: flashcards, quiz, mind map (real aiOrchestrator calls)
  const assets: [string, AILearningMode, string][] = [
    ['flashcards', AILearningMode.FLASHCARDS, 'Generate 5 flashcards (question and answer) from this material.'],
    ['quiz', AILearningMode.QUIZ, 'Generate a multiple-choice quiz question with options from this material.'],
    ['mindmap', AILearningMode.MIND_MAP, 'Create a mind map of the key concepts in this material.'],
  ];
  for (const [key, mode, prompt] of assets) {
    try {
      const history: ChatMessage[] = [{ role: 'user', content: prompt, timestamp: Date.now() }];
      const gen = await aiOrchestrator.generateGroundedResponse(mode, history, contextData);
      const chars = gen.reply?.length || 0;
      r[key] = { ok: (gen.reply?.trim().length || 0) > 80, chars, preview: (gen.reply || '').slice(0, 140) };
      console.log(`  ${key}: ok=${r[key].ok} chars=${chars}`);
    } catch (e: any) {
      r[key] = { error: e?.message || String(e) };
      console.log(`  ${key} ERROR: ${r[key].error}`);
    }
  }

  return r;
}

async function main() {
  console.log(`=== CURRICULUM VALIDATION: ${SEED.length} seed notebooks ===`);
  const results: any[] = [];
  for (const nb of SEED) {
    try {
      results.push(await validateNotebook(nb));
    } catch (e: any) {
      results.push({ id: nb.id, fatalError: e?.message || String(e) });
      console.log(`  FATAL ${nb.id}: ${e?.message || e}`);
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    note: 'Point-in-time snapshot. A broader ingestion was running in parallel, so chunk/KG/vector counts may have grown after capture.',
    pineconeNote: 'pinecone.sampledCount is capped at topK=100, so it is a lower bound for notebooks with >100 chunks.',
    notebooks: results,
  };
  const dir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'curriculum_validation.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\n=== VALIDATION COMPLETE -> ${file} ===`);
  process.exit(0);
}

main().catch((e) => { console.error('validation error:', e); process.exit(1); });
