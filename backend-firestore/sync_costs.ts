import { db } from './src/config/firebase';
import { FieldValue } from 'firebase-admin/firestore';

async function syncHistoricalCosts() {
  const totalLlm = 1.5;
  const totalEmbedding = 0.9;

  console.log(`Syncing historical LLM Cost: $${totalLlm}`);
  console.log(`Syncing historical Embedding Cost: $${totalEmbedding}`);

  // Push to db
  await db.collection('platform').doc('stats').set({
    totalLlmCostUsd: FieldValue.increment(totalLlm),
    totalEmbeddingCostUsd: FieldValue.increment(totalEmbedding),
    totalCostUsd: FieldValue.increment(totalLlm + totalEmbedding)
  }, { merge: true });
  console.log('Successfully synced platform stats with ~$2.4 (200 INR) historical cost.');
}

syncHistoricalCosts().catch(console.error);
