/** One embedding call. Is the quota back? Deliberately a single request, not a loop. */
import 'dotenv/config';
import { GoogleEmbeddingProvider } from '../../src/services/ai/providers/google-embedding.provider';
(async () => {
  const t0 = Date.now();
  try {
    const v = await new GoogleEmbeddingProvider().generateEmbedding('quota probe');
    console.log(`OK — ${v.length} dims in ${Date.now() - t0}ms. Embedding quota is available.`);
  } catch (e: any) {
    const m = String(e?.message || e);
    console.log(`FAILED after ${Date.now() - t0}ms (includes 6 internal retries)`);
    console.log('  ' + m.slice(0, 260));
  }
  process.exit(0);
})();
