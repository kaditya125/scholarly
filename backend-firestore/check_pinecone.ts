import { pineconeService } from './src/services/pinecone.service';

async function main() {
  try {
    const stats = await pineconeService.getStats();
    console.log('Pinecone Stats:', stats);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
main();
