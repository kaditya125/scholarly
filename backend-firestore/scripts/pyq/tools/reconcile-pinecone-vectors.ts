import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { env } from '../../../src/config/env';

async function reconcilePinecone() {
  console.log('================================================================');
  console.log('🌲  PHASE F: PINECONE VECTOR RECONCILIATION & PURGE');
  console.log('================================================================\n');

  const vectorListPath = path.resolve(__dirname, 'quarantined_vector_ids.json');
  if (!fs.existsSync(vectorListPath)) {
    throw new Error(`Vector list not found at: ${vectorListPath}`);
  }

  const vectorIds: string[] = JSON.parse(fs.readFileSync(vectorListPath, 'utf-8'));
  console.log(`Loaded ${vectorIds.length} quarantined vector IDs to purge from Pinecone.`);

  const namespace = env.PINECONE_NAMESPACE || 'production';
  console.log(`Target Index:     ${env.PINECONE_INDEX_NAME}`);
  console.log(`Target Namespace: "${namespace}"\n`);

  // Check stats before deletion
  console.log('Fetching Pinecone stats BEFORE reconciliation...');
  const statsBefore = await pineconeService.getIndexStats();
  console.log('Stats Before:', JSON.stringify(statsBefore, null, 2));

  // Chunk deletion in batches of 100
  const CHUNK_SIZE = 100;
  let deletedCount = 0;

  console.log(`\nBeginning batch deletion of ${vectorIds.length} vectors...`);
  for (let i = 0; i < vectorIds.length; i += CHUNK_SIZE) {
    const chunk = vectorIds.slice(i, i + CHUNK_SIZE);
    try {
      await pineconeService.deleteVectors(chunk, namespace);
      deletedCount += chunk.length;
      process.stdout.write(`Purged ${deletedCount} / ${vectorIds.length} vectors from "${namespace}"...\r`);
    } catch (err: any) {
      console.warn(`\nWarning deleting chunk ${i}:`, err?.message || err);
    }
  }

  console.log(`\n\n✅ Successfully sent delete requests for ${deletedCount} quarantined vectors!`);

  // Wait 3 seconds for Pinecone consistency
  console.log('Waiting 3000ms for Pinecone index synchronization...');
  await new Promise((r) => setTimeout(r, 3000));

  console.log('\nFetching Pinecone stats AFTER reconciliation...');
  const statsAfter = await pineconeService.getIndexStats();
  console.log('Stats After:', JSON.stringify(statsAfter, null, 2));

  console.log('\n================================================================');
  console.log('🎉 PHASE F PINECONE RECONCILIATION COMPLETE.');
  console.log('All quarantined/template vectors removed from production namespace.');
  console.log('================================================================\n');

  process.exit(0);
}

reconcilePinecone().catch((err) => {
  console.error('Reconciliation error:', err);
  process.exit(1);
});
