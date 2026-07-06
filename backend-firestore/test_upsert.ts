import { firebaseApp } from './src/config/firebase';
import { pineconeService } from './src/services/rag/pinecone.service';
import { GoogleEmbeddingProvider } from './src/services/ai/providers/google-embedding.provider';

async function testUpsert() {
  console.log('Testing simple embedding and upsert...');
  
  try {
    const embeddingProvider = new GoogleEmbeddingProvider();
    const text = 'This is a test document to verify pinecone upsertion is working.';
    
    console.log('Generating embedding...');
    const embeddings = await embeddingProvider.generateEmbeddings([text]);
    console.log('Embeddings generated:', embeddings.length, 'dims:', embeddings[0]?.length);
    
    const batchVectors = [{
      id: `test_manual_chunk_0`,
      values: embeddings[0],
      metadata: {
        text: text,
        title: 'test'
      }
    }];
    
    console.log('Upserting to Pinecone...');
    await pineconeService.upsertVectors(batchVectors, process.env.PINECONE_NAMESPACE);
    
    console.log('Upsert successful!');
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    process.exit(0);
  }
}

testUpsert();
