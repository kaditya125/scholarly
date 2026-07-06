import { config } from 'dotenv';
config({ path: 'D:/scholarly/backend-firestore/.env' });
import { GoogleEmbeddingProvider } from './src/services/ai/providers/google-embedding.provider';
import { pineconeService } from './src/services/rag/pinecone.service';

async function main() {
  try {
    const embedder = new GoogleEmbeddingProvider();
    const vector = await embedder.generateEmbedding("what is the powerhouse of plant");
    console.log("Vector generated", vector.length);
    const results = await pineconeService.queryVectors(vector, 5, undefined, "production");
    console.log("Results", results);
  } catch(e) {
    console.error("ERROR:", e);
  }
}
main();
