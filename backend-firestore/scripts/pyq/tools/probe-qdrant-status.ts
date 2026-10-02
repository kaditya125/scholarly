import { env } from '../../../src/config/env';
import { getVectorStore } from '../../../src/services/rag/vectorStore';
import { QdrantClient } from '@qdrant/js-client-rest';

async function main() {
  console.log('--- VECTOR STORE PROBE ---');
  console.log('Configured VECTOR_STORE:', env.VECTOR_STORE);
  console.log('QDRANT_URL:', env.QDRANT_URL);
  console.log('QDRANT_API_KEY present:', Boolean(env.QDRANT_API_KEY));

  const client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY || undefined,
    checkCompatibility: false,
  });

  try {
    const collections = await client.getCollections();
    console.log('✅ Qdrant Connected! Collections:', JSON.stringify(collections, null, 2));
  } catch (err: any) {
    console.log('⚠️ Qdrant connection failed:', err?.message);
  }

  const store = getVectorStore();
  console.log('Active VectorStore Backend:', store.backend);
  try {
    const stats = await store.getIndexStats();
    console.log('Vector Store Stats:', JSON.stringify(stats, null, 2));
  } catch (err: any) {
    console.log('Vector Store Stats query failed:', err?.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Probe failed:', err);
    process.exit(1);
  });
