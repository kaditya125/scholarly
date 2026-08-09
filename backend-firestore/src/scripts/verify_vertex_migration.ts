/**
 * Verifies the live app provider layer now routes through Vertex AI (flag-driven).
 * Exercises the REAL GeminiProvider + GoogleEmbeddingProvider (same objects the
 * DI container registers), covering generation, streaming, and embeddings.
 *
 * Usage: npx tsx src/scripts/verify_vertex_migration.ts
 */
import { env } from '../config/env';
import { useVertexAI } from '../services/ai/googleGenAIClient';
import { GeminiProvider } from '../services/ai/gemini.provider';
import { GoogleEmbeddingProvider } from '../services/ai/providers/google-embedding.provider';

async function run() {
  console.log('='.repeat(64));
  console.log('Vertex AI migration verification (live provider layer)');
  console.log('GOOGLE_GENAI_USE_VERTEXAI =', env.GOOGLE_GENAI_USE_VERTEXAI, '| useVertexAI() =', useVertexAI());
  console.log('='.repeat(64));

  const gemini = new GeminiProvider();
  const embedder = new GoogleEmbeddingProvider();

  // 1) Non-streaming generation
  let t = Date.now();
  const gen = await gemini.generateResponse(
    [{ role: 'user', content: 'Reply with exactly one short sentence confirming you are online.', timestamp: Date.now() }],
    'You are a concise assistant.'
  );
  console.log(`\n[1] generateResponse  | ${Date.now() - t}ms | tokens(in/out)=${gen.usage?.promptTokens}/${gen.usage?.completionTokens}`);
  console.log('    reply:', JSON.stringify((gen.reply || '').slice(0, 100)));

  // 2) Streaming generation
  t = Date.now();
  let streamed = '';
  let chunks = 0;
  for await (const c of gemini.generateStreamResponse(
    [{ role: 'user', content: 'Count: one two three.', timestamp: Date.now() }]
  )) {
    streamed += c;
    chunks++;
  }
  console.log(`\n[2] generateStreamResponse | ${Date.now() - t}ms | chunks=${chunks}`);
  console.log('    streamed:', JSON.stringify(streamed.slice(0, 100)));

  // 3) Embedding
  t = Date.now();
  const vec = await embedder.generateEmbedding('force equals mass times acceleration');
  console.log(`\n[3] generateEmbedding | ${Date.now() - t}ms | dims=${vec.length}`);

  const ok = (gen.reply && gen.reply.length > 0) && (streamed.length > 0) && (vec.length === 768);
  console.log('\n' + '='.repeat(64));
  console.log(ok ? 'RESULT: ✅ ALL PATHS WORKING via ' + (useVertexAI() ? 'Vertex AI' : 'Developer API')
                 : 'RESULT: ❌ one or more paths failed');
  console.log('='.repeat(64));
  process.exit(ok ? 0 : 1);
}

run().catch((e) => {
  console.error('Verification failed:', e?.message || e);
  process.exit(1);
});
