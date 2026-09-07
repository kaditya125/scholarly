import { db } from '../../../src/config/firebase';

async function main() {
  console.log('Querying BPSC_CCE questions in Firestore...');
  const snap = await db.collection('pyq_questions').where('examId', '==', 'BPSC_CCE').get();
  console.log(`Total BPSC_CCE questions found: ${snap.size}`);

  const subjects: Record<string, number> = {};
  const years: Record<number, number> = {};
  const buckets: Record<string, number> = {};
  const sessions: Record<string, number> = {};

  snap.forEach((doc) => {
    const data = doc.data();
    subjects[data.subject] = (subjects[data.subject] || 0) + 1;
    years[data.year] = (years[data.year] || 0) + 1;
    const b = data.corpusBucket || 'UNKNOWN';
    buckets[b] = (buckets[b] || 0) + 1;
    const s = `${data.session || 'NONE'} | ${data.paperCode || 'NONE'}`;
    sessions[s] = (sessions[s] || 0) + 1;
  });

  console.log('\nYear Breakdown:', years);
  console.log('\nBucket Breakdown:', buckets);
  console.log('\nSessions & Papers Breakdown:');
  console.table(sessions);
  console.log('Subject Breakdown:');
  console.table(subjects);

  const officialSnap = await db.collection('pyq_questions')
    .where('examId', '==', 'BPSC_CCE')
    .where('corpusBucket', '==', 'OFFICIAL_PYQ')
    .limit(1)
    .get();

  if (officialSnap.size > 0) {
    const sample = officialSnap.docs[0].data();
    console.log('\n--- Sample Official PYQ Document ---');
    console.log('ID:', officialSnap.docs[0].id);
    console.log('Question Text:', sample.questionText);
    console.log('Options:', sample.options);
    console.log('Correct Answer:', sample.correctAnswer);
    console.log('Corpus Bucket:', sample.corpusBucket);
    console.log('Source Tier:', sample.sourceTier);
    console.log('Verification Status:', sample.verificationStatus);
    console.log('Subject:', sample.subject, '| Topic:', sample.topic);
    console.log('Metadata:', sample.metadata);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
