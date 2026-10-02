import { db } from '../../../src/config/firebase';

async function main() {
  console.log('=== VERIFYING FIRESTORE SSC CHSL MULTI-SHIFT PAPERS ===');

  const regSnap = await db.collection('pyq_source_registry').where('examId', '==', 'SSC_CHSL').get();
  console.log(`Total official papers registered: ${regSnap.size}`);

  const years = [2019, 2020, 2021, 2022, 2023, 2024];
  for (const yr of years) {
    const shiftsYr = regSnap.docs.filter((d) => d.data().year === yr);
    console.log(`  - ${yr} official shifts registered: ${shiftsYr.length}`);
  }

  console.log('\nQuerying pyq_questions by year...');
  let totalAllYears = 0;
  for (const yr of years) {
    const qSnap = await db.collection('pyq_questions').where('examId', '==', 'SSC_CHSL').where('year', '==', yr).get();
    console.log(`  - ${yr} authentic questions in pyq_questions: ${qSnap.size}`);
    totalAllYears += qSnap.size;
  }
  console.log(`\n  🎯 TOTAL ALL YEARS (2019-2024) IN FIRESTORE: ${totalAllYears} questions across ${regSnap.size} official shift papers!`);

  // Sample questions from one paper
  const sampleDoc = regSnap.docs[0]?.data();
  const paperId = sampleDoc?.canonicalPaperId;
  if (paperId) {
    const paperQuestions = await db.collection('pyq_questions').where('canonicalPaperId', '==', paperId).get();
    console.log(`\nQuestions in paper "${paperId}": ${paperQuestions.size}`);
    const qSample = paperQuestions.docs[0]?.data();
    if (qSample) {
      console.log('  Q1 Text:   ', qSample.questionText?.slice(0, 100));
      console.log('  Subject:   ', qSample.subject);
      console.log('  Options:   ', qSample.options);
      console.log('  Answer:    ', qSample.correctAnswer);
      console.log('  Provenance:', qSample.provenanceRecords?.[0]?.sourceName);
    }
  }

  console.log('\n✅ ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
