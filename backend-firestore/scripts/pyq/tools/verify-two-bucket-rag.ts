import 'dotenv/config';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { pyqVectorIngestionService } from '../../../src/services/pyq/pyqVectorIngestion.service';
import { db } from '../../../src/config/firebase';

async function verify() {
  console.log('================================================================');
  console.log('🌲 VERIFYING TWO-BUCKET RAG RETRIEVAL & PINECONE CONSISTENCY');
  console.log('================================================================\n');

  // 1. Pinecone Stats
  const stats = await pineconeService.getIndexStats();
  console.log('Pinecone Stats:', JSON.stringify(stats, null, 2));

  // 2. Firestore Counts
  const officialSnap = await db.collection('pyq_questions')
    .where('corpusBucket', '==', 'OFFICIAL_PYQ')
    .get();

  const practiceSnap = await db.collection('pyq_questions')
    .where('corpusBucket', '==', 'PRACTICE_MOCK')
    .where('ingestionState', '==', 'ACTIVE')
    .get();

  const archivedSnap = await db.collection('pyq_questions')
    .where('ingestionState', '==', 'ARCHIVED_DUPLICATE')
    .get();

  console.log(`\nFirestore Two-Bucket Counts:`);
  console.log(`  - Bucket 1 (OFFICIAL_PYQ):       ${officialSnap.size} (100% Authentic JEE Main)`);
  console.log(`  - Bucket 2 (PRACTICE_MOCK Active):${practiceSnap.size} (Deduplicated Unique Questions)`);
  console.log(`  - Archived Duplicates:           ${archivedSnap.size} (Superfluous Template Copies)`);
  console.log(`  - Total Processed:               ${officialSnap.size + practiceSnap.size + archivedSnap.size}`);

  // 3. Test RAG Search: Bucket 1 (OFFICIAL_PYQ)
  console.log('\n--- TEST 1: Querying BUCKET 1 (OFFICIAL_PYQ) for "electric potential midpoint" ---');
  const resOfficial = await pyqVectorIngestionService.testRetrieval({
    query: 'electric potential midpoint charges',
    expectedExamId: 'JEE_MAIN',
    corpusBucket: 'OFFICIAL_PYQ',
    topK: 3
  });
  console.log(`Passed: ${resOfficial.passed} | Top Score: ${(resOfficial.topMatchScore * 100).toFixed(1)}%`);
  resOfficial.results.forEach((r, idx) => {
    console.log(`  [${idx + 1}] (${(r.score * 100).toFixed(1)}%) ${r.examId} | ${r.subject} > ${r.topic}: ${r.text.slice(0, 80)}...`);
  });

  // 4. Test RAG Search: Bucket 2 (PRACTICE_MOCK) for NEET Biology
  console.log('\n--- TEST 2: Querying BUCKET 2 (PRACTICE_MOCK) for "neuromuscular disorder antibodies" ---');
  const resPractice = await pyqVectorIngestionService.testRetrieval({
    query: 'autoimmune neuromuscular disorder antibodies against acetylcholine',
    expectedExamId: 'NEET_UG',
    corpusBucket: 'PRACTICE_MOCK',
    topK: 3
  });
  console.log(`Passed: ${resPractice.passed} | Top Score: ${(resPractice.topMatchScore * 100).toFixed(1)}%`);
  resPractice.results.forEach((r, idx) => {
    console.log(`  [${idx + 1}] (${(r.score * 100).toFixed(1)}%) ${r.examId} | ${r.subject} > ${r.topic}: ${r.text.slice(0, 80)}...`);
  });

  // 5. Test RAG Search: Bucket 2 (PRACTICE_MOCK) for SSC Quantitative Aptitude
  console.log('\n--- TEST 3: Querying BUCKET 2 (PRACTICE_MOCK) for "7-digit number divisible by 99" ---');
  const resSsc = await pyqVectorIngestionService.testRetrieval({
    query: 'If the 7-digit number 543x82y is divisible by 99',
    expectedExamId: 'SSC_CGL',
    corpusBucket: 'PRACTICE_MOCK',
    topK: 3
  });
  console.log(`Passed: ${resSsc.passed} | Top Score: ${(resSsc.topMatchScore * 100).toFixed(1)}%`);
  resSsc.results.forEach((r, idx) => {
    console.log(`  [${idx + 1}] (${(r.score * 100).toFixed(1)}%) ${r.examId} | ${r.subject} > ${r.topic}: ${r.text.slice(0, 80)}...`);
  });

  process.exit(0);
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
