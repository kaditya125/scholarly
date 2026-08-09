/**
 * Proves the 429 retry + Vertex->Developer fallback works through the REAL provider.
 * Fires a concurrent burst of generations (enough to trip Vertex Express rate limits);
 * with fallback in place, every request should still succeed. Watch for the
 * "[genai] ... failing over to Developer API" log lines — those are fallbacks firing.
 *
 * Usage: npx tsx src/scripts/verify_vertex_fallback.ts
 */
import { env } from '../config/env';
import { useVertexAI } from '../services/ai/googleGenAIClient';
import { GeminiProvider } from '../services/ai/gemini.provider';

const BURST = 16;

async function run() {
  console.log('='.repeat(60));
  console.log('Vertex 429 -> Developer fallback test');
  console.log('useVertexAI =', useVertexAI(), '| hasFallbackKey =', !!env.GEMINI_API_KEY);
  console.log(`Firing ${BURST} concurrent generateResponse calls...`);
  console.log('='.repeat(60));

  const gemini = new GeminiProvider();
  const t = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: BURST }, (_, i) =>
      gemini.generateResponse(
        [{ role: 'user', content: `Reply with the number ${i}.`, timestamp: Date.now() }],
        'Answer with just the number.'
      )
    )
  );

  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected');
  console.log(`\nCompleted in ${Date.now() - t}ms`);
  console.log(`  succeeded : ${ok}/${BURST}`);
  console.log(`  failed    : ${failed.length}/${BURST}`);
  failed.slice(0, 3).forEach((f: any, i) => console.log(`    err[${i}]: ${String(f.reason?.message || f.reason).slice(0, 120)}`));

  console.log('\n' + (ok === BURST
    ? 'RESULT: ✅ all requests succeeded (retries/fallback absorbed any 429s)'
    : `RESULT: ⚠️ ${failed.length} request(s) still failed — see errors above`));
  process.exit(ok === BURST ? 0 : 1);
}

run().catch((e) => { console.error(e?.message || e); process.exit(1); });
