import 'dotenv/config';
import { db } from '../../../src/config/firebase';

async function inspectCandidateQuestions() {
  console.log('--- Inspecting Candidate Quarantined Questions for Evidence ---');
  
  // 1. Inspect JEE_ADVANCED (42 records)
  const jeeAdvSnap = await db.collection('pyq_questions')
    .where('examId', '==', 'JEE_ADVANCED')
    .get();

  console.log(`\nJEE_ADVANCED count: ${jeeAdvSnap.size}`);
  jeeAdvSnap.docs.slice(0, 5).forEach((d) => {
    const data = d.data();
    console.log(`[JEE_ADV] Year: ${data.year} | Paper: ${data.paper} | Q: ${data.questionNumber}`);
    console.log(`  Text: ${data.questionText.slice(0, 100)}`);
    console.log(`  Answer: ${data.correctAnswer} | KeySource: ${data.correctAnswerSource}`);
    console.log(`  Provenance:`, data.provenanceRecords);
  });

  // 2. Inspect UPSC_CSE questions (565 records)
  const upscSnap = await db.collection('pyq_questions')
    .where('examId', '==', 'UPSC_CSE')
    .limit(5)
    .get();

  console.log(`\nUPSC_CSE sample:`);
  upscSnap.docs.forEach((d) => {
    const data = d.data();
    console.log(`[UPSC] Year: ${data.year} | Paper: ${data.paper} | Q: ${data.questionNumber}`);
    console.log(`  Text: ${data.questionText.slice(0, 100)}`);
    console.log(`  Answer: ${data.correctAnswer} | KeySource: ${data.correctAnswerSource}`);
  });

  // 3. Inspect NEET overlapping questions
  const neetSnap = await db.collection('pyq_questions')
    .where('examId', '==', 'NEET_UG')
    .limit(5)
    .get();

  // Inspect UNKNOWN or missing examId records
  console.log('\n--- Inspecting UNKNOWN_EXAM / Missing examId records ---');
  const allSnap = await db.collection('pyq_questions').get();
  const unknowns = allSnap.docs.filter(d => {
    const ex = d.data().examId;
    return !ex || ex === 'UNKNOWN_EXAM' || ex === 'UNKNOWN';
  });
  console.log(`Total UNKNOWN / Missing examId records: ${unknowns.length}`);
  unknowns.forEach(d => {
    const data = d.data();
    console.log(`\nDoc ID: ${d.id}`);
    console.log(`  examId: ${data.examId}`);
    console.log(`  createdAt: ${data.createdAt}`);
    console.log(`  updatedAt: ${data.updatedAt}`);
    console.log(`  ingestionState: ${data.ingestionState || data.status}`);
    console.log(`  origin: ${data.origin}`);
    console.log(`  restorationState: ${data.restorationState}`);
    console.log(`  quarantineReason: ${data.quarantineReason}`);
    console.log(`  retrievalTestedAt: ${data.retrievalTestedAt} (${data.retrievalTestedAt ? new Date(data.retrievalTestedAt).toISOString() : 'none'})`);
    console.log(`  allKeys:`, Object.keys(data));
    console.log(`  fullData:`, JSON.stringify(data));
  });

  process.exit(0);
}

inspectCandidateQuestions().catch(console.error);
