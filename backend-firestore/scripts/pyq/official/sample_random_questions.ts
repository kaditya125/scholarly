import { db } from '../../../src/config/firebase';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { env } from '../../../src/config/env';

const TARGET_SPECS = [
  { year: 2012, qNum: 15 },
  { year: 2015, qNum: 78 },
  { year: 2018, qNum: 8 },
  { year: 2020, qNum: 1 },
  { year: 2020, qNum: 100 },
  { year: 2024, qNum: 74 },
  { year: 2025, qNum: 5 }
];

async function main() {
  const results = [];

  for (const spec of TARGET_SPECS) {
    const snap = await db.collection('pyq_questions')
      .where('year', '==', spec.year)
      .get();

    const docSnap = snap.docs.find(d => {
      const data = d.data();
      return (data.examId === 'UPSC_CSE' || data.examId === 'upsc_cse') &&
             data.questionNumber === spec.qNum &&
             data.paper === 'General Studies Paper I';
    });

    if (!docSnap) continue;
    const doc = docSnap.data();

    const vectorId = `vec_${doc.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    let pineconeMeta = null;
    try {
      const pRes = await pineconeService.fetchVectors([vectorId], env.PINECONE_NAMESPACE);
      pineconeMeta = pRes?.[0]?.metadata || null;
    } catch (e: any) {
      pineconeMeta = { error: e.message };
    }

    results.push({
      year: doc.year,
      questionNumber: doc.questionNumber,
      questionId: doc.questionId,
      vectorId,
      questionText: doc.questionText,
      options: doc.options,
      correctAnswer: doc.correctAnswer,
      correctAnswerSource: doc.correctAnswerSource,
      verificationStatus: doc.verificationStatus,
      ingestionState: doc.ingestionState,
      sourceType: doc.sourceType,
      sourceUrl: doc.sourceUrl,
      provenance: doc.provenance || doc.provenanceRecords,
      pineconeMetadata: pineconeMeta
    });
  }

  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
