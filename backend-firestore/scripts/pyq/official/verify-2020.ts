import { db } from '../../../src/config/firebase';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { env } from '../../../src/config/env';

const PROBE_VECTOR = new Array(768).fill(0.01);

async function main() {
  console.log('--- Checking 2020 UPSC CSE in Firestore ---');
  const snap = await db.collection('pyq_questions')
    .where('year', '==', 2020)
    .get();

  const upscDocs = snap.docs.filter(d => d.data().examId === 'UPSC_CSE');
  console.log('Total 2020 UPSC CSE docs in Firestore:', upscDocs.length);

  let verified = 0;
  let ansAvailable = 0;
  let vectorIndexed = 0;

  for (const doc of upscDocs) {
    const d = doc.data();
    if (d.ingestionState === 'VERIFIED') verified++;
    if (d.correctAnswer && d.correctAnswer.length > 0) ansAvailable++;
    if (d.vectorIndexed) vectorIndexed++;
  }

  console.log({ verified, ansAvailable, vectorIndexed });

  // Spot-check 2020
  const q1Doc = upscDocs.find(d => d.data().questionNumber === 1)?.data();
  const q50Doc = upscDocs.find(d => d.data().questionNumber === 50)?.data();
  const q100Doc = upscDocs.find(d => d.data().questionNumber === 100)?.data();

  console.log('\n2020 UPSC Spot Checks in Firestore:');
  console.log('  Q1:', {
    id: q1Doc?.questionId,
    ans: q1Doc?.correctAnswer,
    state: q1Doc?.ingestionState,
    indexed: q1Doc?.vectorIndexed
  });
  console.log('  Q50:', {
    id: q50Doc?.questionId,
    ans: q50Doc?.correctAnswer,
    state: q50Doc?.ingestionState,
    indexed: q50Doc?.vectorIndexed
  });
  console.log('  Q100:', {
    id: q100Doc?.questionId,
    ans: q100Doc?.correctAnswer,
    state: q100Doc?.ingestionState,
    indexed: q100Doc?.vectorIndexed
  });

  // Query Pinecone for 2020 vectors
  console.log('\n--- Checking 2020 in Pinecone ---');
  const sample = await pineconeService.queryVectors(
    PROBE_VECTOR,
    10,
    { examId: 'UPSC_CSE', year: 2020 } as any,
    env.PINECONE_NAMESPACE
  );

  console.log(`Queried 2020 vectors in Pinecone namespace '${env.PINECONE_NAMESPACE}': found ${sample.length} sample matches`);
  for (const match of sample.slice(0, 5)) {
    console.log(`   Vector ${match.id.slice(0, 45)}...`);
    console.log(`     qNum: ${(match.metadata as any)?.questionNumber}, ans: ${(match.metadata as any)?.correctAnswer}, public: ${(match.metadata as any)?.public}, answerAvailable: ${(match.metadata as any)?.answerAvailable}, content_type: ${(match.metadata as any)?.content_type}`);
  }

  // All 15 Years Coverage Check
  console.log('\n--- 15-Year UPSC GS-I Coverage Audit ---');
  const allUpscSnap = await db.collection('pyq_questions')
    .where('examId', '==', 'UPSC_CSE')
    .where('paperId', '==', 'general_studies_paper_i')
    .get();

  const yearMap: Record<number, { count: number; verified: number; ansAvailable: number }> = {};
  for (const doc of allUpscSnap.docs) {
    const d = doc.data();
    const y = d.year;
    if (!yearMap[y]) yearMap[y] = { count: 0, verified: 0, ansAvailable: 0 };
    yearMap[y].count++;
    if (d.ingestionState === 'VERIFIED' || d.ingestionState === 'INDEXED') yearMap[y].verified++;
    if (d.correctAnswer && d.correctAnswer.length > 0) yearMap[y].ansAvailable++;
  }

  console.table(yearMap);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
