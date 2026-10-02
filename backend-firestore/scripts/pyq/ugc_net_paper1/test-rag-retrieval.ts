import * as fs from 'fs';
import * as path from 'path';
import { vectorStore } from '../../../src/services/rag/vectorStore';

async function main() {
  const CACHE_PATH = path.resolve('dataset_staging/ugc_net_paper1/ugc_net_paper1_embedding_cache.json');
  const cache: Record<string, number[]> = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  const testKeys = Object.keys(cache);
  console.log(`Loaded cache with ${testKeys.length} embeddings.`);

  const probeKey = testKeys[0];
  const probeVector = cache[probeKey];
  console.log(`Probing vector store with probeKey: ${probeKey}...`);

  const results = await vectorStore.queryVectors(probeVector, 3, { examId: 'UGC_NET' }, 'production');
  console.log(`Retrieved ${results.length} results:`);
  for (const r of results) {
    console.log(`  [Score: ${r.score?.toFixed(4)}] ID: ${r.id} | Subject: ${r.metadata?.subject} | Unit: ${r.metadata?.unitName || r.metadata?.unitTitle}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
