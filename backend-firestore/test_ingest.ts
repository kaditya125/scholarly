import { firebaseApp } from './src/config/firebase';
import { sourceService } from './src/services/source.service';
import { pineconeService } from './src/services/rag/pinecone.service';

async function testIngest() {
  console.log('Testing ingestion pipeline...');
  const mockFile = {
    buffer: Buffer.from('This is a test document with some basic content about biology. The mitochondria is the powerhouse of the cell. Cells have nucleus and ribosomes. This text is meant to be chunked and embedded.'),
    originalname: 'test_doc.txt',
    mimetype: 'text/plain',
    size: 200
  } as any;
  
  try {
    // Generate a mock notebook
    const db = firebaseApp.firestore();
    const nbRef = db.collection('notebooks').doc();
    await nbRef.set({ title: 'Test Notebook', userId: 'system', createdAt: Date.now() });
    
    console.log('Notebook created:', nbRef.id);
    
    // We mock a source object instead of calling processUpload so we can await processFileBackground
    const source = {
      id: nbRef.collection('sources').doc().id,
      notebookId: nbRef.id,
      userId: 'system',
      title: 'Test Source',
      createdAt: Date.now()
    } as any;
    
    await nbRef.collection('sources').doc(source.id).set(source);
    
    console.log('Source created:', source.id);
    
    console.log('Running processFileBackground directly and awaiting it...');
    // Using any to bypass private visibility
    await (sourceService as any).processFileBackground(source, mockFile);
    
    const sDoc = await db.collection('notebooks').doc(nbRef.id).collection('sources').doc(source.id).get();
    console.log('Final source status:', sDoc.data()?.status);
    console.log('Chunks extracted:', sDoc?.data()?.chunksExtracted);
    
    // Check pinecone
    const stats = await pineconeService.getIndexStats();
    console.log('Pinecone stats:', stats);
    
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    process.exit(0);
  }
}

testIngest();
