import { GoogleEmbeddingProvider } from './src/services/ai/providers/google-embedding.provider';
import { env } from './src/config/env';

async function main() {
  console.log(`Using API Key starting with: ${env.GEMINI_API_KEY.substring(0, 15)}...`);
  const provider = new GoogleEmbeddingProvider();
  
  try {
    console.log("Generating 1 test embedding to check quota...");
    const result = await provider.generateEmbedding("Hello world this is a test.");
    console.log(`Success! Vector length: ${result.length}`);
  } catch (error: any) {
    console.error("Embedding failed!");
    console.error(error.message || error);
  }
}

main().catch(console.error);
