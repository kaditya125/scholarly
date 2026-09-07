import { db } from '../../../src/config/firebase';

async function main() {
  console.log('Fetching UPSC_CSE questions from Firestore...');
  const snap = await db.collection('pyq_questions')
    .where('examId', '==', 'UPSC_CSE')
    .get();

  console.log(`Total UPSC_CSE docs: ${snap.size}`);
  const yearMap: Record<number, { total: number; verified: number; keyed: number }> = {};

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.paper !== 'General Studies Paper I') continue;
    const y = d.year;
    if (!yearMap[y]) yearMap[y] = { total: 0, verified: 0, keyed: 0 };
    yearMap[y].total++;
    if (d.ingestionState === 'VERIFIED' || d.ingestionState === 'INDEXED' || d.ingestionState === 'ACTIVE') {
      yearMap[y].verified++;
    }
    if (d.correctAnswer && d.correctAnswer.trim().length > 0) {
      yearMap[y].keyed++;
    }
  }

  console.table(yearMap);

  const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
  let totalAll = 0;
  let totalVerified = 0;
  let totalKeyed = 0;

  for (const y of years) {
    totalAll += yearMap[y].total;
    totalVerified += yearMap[y].verified;
    totalKeyed += yearMap[y].keyed;
  }

  console.log({ totalAll, totalVerified, totalKeyed });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
