import 'dotenv/config';
import { db } from '../../../src/config/firebase';
import { qdrantService } from '../../../src/services/rag/qdrant.service';

async function main() {
  console.log('=== PROBING FIRESTORE & QDRANT STATUS FOR UGC NET ===');
  const sourcesSnap = await db.collection('pyq_source_registry').where('examId', '==', 'UGC_NET').get();
  console.log(`Firestore pyq_source_registry (UGC_NET): ${sourcesSnap.size} papers`);

  const qSnap = await db.collection('pyq_questions').where('examId', '==', 'UGC_NET').get();
  console.log(`Firestore pyq_questions (UGC_NET): ${qSnap.size} questions`);

  let indexedInFirestore = 0;
  qSnap.forEach(d => {
    if (d.data().vectorIndexed) indexedInFirestore++;
  });
  console.log(`Firestore pyq_questions with vectorIndexed: true: ${indexedInFirestore}`);

  const mockSnap = await db.collection('ugc_net_mock_questions').get();
  console.log(`Firestore ugc_net_mock_questions: ${mockSnap.size} mock questions`);

  const stats = await qdrantService.getIndexStats();
  console.log(`Qdrant total points in edtech_ai_rag: ${stats.totalVectorCount}`);

  const sampleHits = await qdrantService.queryVectors(new Array(768).fill(0.01), 5, { examId: 'UGC_NET' }, 'production');
  console.log(`Qdrant UGC_NET query probe hit count: ${sampleHits.length}`);
  if (sampleHits.length > 0) {
    console.log(`First hit ID: ${sampleHits[0].id}`);
    console.log(`First hit question: ${sampleHits[0].metadata?.text?.slice(0, 80)}...`);
    console.log(`First hit unit: Unit ${sampleHits[0].metadata?.unitNumber} - ${sampleHits[0].metadata?.unitTitle}`);
  }
}

main().catch(console.error);
