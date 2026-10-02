import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../../src/config/env';
import { getSecret } from '../../src/services/runtimeSecrets.service';

async function main() {
  console.log('Qdrant URL:', env.QDRANT_URL);
  const apiKey = getSecret('QDRANT_API_KEY') || env.QDRANT_API_KEY;
  console.log('Qdrant API Key defined:', !!apiKey);

  const client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: apiKey || undefined,
    checkCompatibility: false,
  });

  try {
    const collections = await client.getCollections();
    console.log('Collections:', JSON.stringify(collections, null, 2));
  } catch (err: any) {
    console.error('Failed to connect to Qdrant:', err.message || err);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
