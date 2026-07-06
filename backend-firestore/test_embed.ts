import { GoogleEmbeddingProvider } from './src/services/ai/providers/google-embedding.provider';

async function test() {
  try {
    const provider = new GoogleEmbeddingProvider();
    const result = await provider.generateEmbeddings(['This is a test']);
    console.log('Embedding successful. Dimensions:', result[0]?.length);
  } catch (err) {
    console.error('Error generating embedding:', err);
  }
}
test();
