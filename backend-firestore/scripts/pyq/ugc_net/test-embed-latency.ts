import 'dotenv/config';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';

async function test() {
  const provider = new GoogleEmbeddingProvider();
  console.log('Testing 3 requests with 4.5s spacing...');
  for (let i = 1; i <= 3; i++) {
    const start = Date.now();
    const vec = await provider.generateEmbedding(`Database concurrency transaction serializability test #${i}`);
    console.log(`[Request ${i}] Success! Vector dim: ${vec.length}, latency: ${Date.now() - start}ms`);
    if (i < 3) {
      console.log('Waiting 4.5s...');
      await new Promise(r => setTimeout(r, 4500));
    }
  }
  console.log('All 3 succeeded cleanly!');
}

test().catch(console.error);
