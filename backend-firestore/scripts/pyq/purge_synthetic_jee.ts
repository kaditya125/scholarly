import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { env } from '../../src/config/env';

async function purgeSyntheticJEEMain() {
  console.log('--- PURGING SYNTHETIC JEE_MAIN QUESTIONS ---');
  
  // 1. Fetch all Firestore JEE_MAIN questions
  console.log('Querying Firestore pyq_questions for examId = JEE_MAIN...');
  const snap = await db.collection('pyq_questions').where('examId', '==', 'JEE_MAIN').get();
  console.log(`Found ${snap.size} Firestore questions under JEE_MAIN.`);
  
  // Gather vector IDs to remove from Pinecone
  const vectorIds: string[] = [];
  const docRefs: FirebaseFirestore.DocumentReference[] = [];
  
  snap.forEach((doc) => {
    docRefs.push(doc.ref);
    const data = doc.data();
    const qId = data.questionId || doc.id;
    vectorIds.push(`vec_${qId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
  });

  // 2. Delete vectors from Pinecone in batches
  const namespace = env.PINECONE_NAMESPACE;
  console.log(`Deleting ${vectorIds.length} vectors from Pinecone namespace: "${namespace}"...`);
  const chunkSize = 100;
  for (let i = 0; i < vectorIds.length; i += chunkSize) {
    const chunk = vectorIds.slice(i, i + chunkSize);
    try {
      await pineconeService.deleteVectors(chunk, namespace);
      process.stdout.write(`Deleted ${Math.min(i + chunkSize, vectorIds.length)} / ${vectorIds.length} vectors\r`);
    } catch (e: any) {
      console.warn(`\nWarning deleting chunk ${i}:`, e?.message || e);
    }
  }
  console.log('\nPinecone vector purge complete.');

  // 3. Delete Firestore documents in batches of 400
  console.log(`Deleting ${docRefs.length} documents from Firestore pyq_questions...`);
  const batchSize = 400;
  for (let i = 0; i < docRefs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = docRefs.slice(i, i + batchSize);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    process.stdout.write(`Deleted ${Math.min(i + batchSize, docRefs.length)} / ${docRefs.length} docs\r`);
  }
  console.log('\nFirestore document purge complete.');
  console.log('--- PURGE COMPLETED SUCCESSFULLY ---');
}

purgeSyntheticJEEMain()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Purge error:', err);
    process.exit(1);
  });
