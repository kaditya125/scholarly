import fs from 'fs';
import path from 'path';
import { db } from './src/config/firebase';
import { FieldValue } from 'firebase-admin/firestore';

async function recoverCosts() {
  const logPath = path.resolve('C:/Users/aditya kumar/.gemini/antigravity/brain/b60330a0-4faa-401b-8afe-935330a9d1a4/.system_generated/tasks/task-2396.log');
  
  if (!fs.existsSync(logPath)) {
    console.error('Log file not found');
    return;
  }

  const logs = fs.readFileSync(logPath, 'utf8');
  const lines = logs.split('\n');

  let totalLlm = 0;
  let totalEmbedding = 0;

  for (const line of lines) {
    if (line.includes('[TELEMETRY_COST]')) {
      const parts = line.split('-');
      if (parts.length >= 3) {
        const costStr = parts[parts.length - 1].trim().replace('$', '');
        const cost = parseFloat(costStr);
        if (!isNaN(cost)) {
          if (line.includes('embedding')) {
            totalEmbedding += cost;
          } else {
            totalLlm += cost;
          }
        }
      }
    }
  }

  // To account for API overhead or missed tracking, we can scale or just push what we found.
  // We'll push exactly what we found.
  console.log(`Recovered LLM Cost: $${totalLlm}`);
  console.log(`Recovered Embedding Cost: $${totalEmbedding}`);

  // Push to db
  if (totalLlm > 0 || totalEmbedding > 0) {
    await db.collection('platform').doc('stats').set({
      totalLlmCostUsd: FieldValue.increment(totalLlm),
      totalEmbeddingCostUsd: FieldValue.increment(totalEmbedding),
      totalCostUsd: FieldValue.increment(totalLlm + totalEmbedding)
    }, { merge: true });
    console.log('Successfully updated platform stats.');
  } else {
    console.log('No costs to recover.');
  }
}

recoverCosts().catch(console.error);
