import 'dotenv/config';
import { pineconeService } from '../../../src/services/rag/pinecone.service';

async function test() {
  const stats = await pineconeService.getIndexStats();
  console.log('Pinecone index stats:', stats);
}

test().catch(console.error);
