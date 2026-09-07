import 'dotenv/config';
import { db } from '../../../src/config/firebase';

async function main() {
  const totalSnap = await db.collection('pyq_questions').count().get();
  console.log(`Total pyq_questions in Firestore: ${totalSnap.data().count}`);

  const neetSnap = await db.collection('pyq_questions').where('examId', '==', 'NEET_UG').get();
  console.log(`NEET_UG total records: ${neetSnap.size}`);

  const neetTexts = new Set<string>();
  const neetHashes = new Set<string>();
  const byYear: Record<number, number> = {};
  const byState: Record<string, number> = {};

  for (const doc of neetSnap.docs) {
    const d = doc.data();
    const norm = (d.questionText || '').trim().toLowerCase().replace(/\s+/g, ' ');
    neetTexts.add(norm);
    if (d.contentHash) neetHashes.add(d.contentHash);
    if (d.year) byYear[d.year] = (byYear[d.year] || 0) + 1;
    if (d.ingestionState) byState[d.ingestionState] = (byState[d.ingestionState] || 0) + 1;
  }

  console.log(`NEET_UG distinct texts: ${neetTexts.size}`);
  console.log(`NEET_UG distinct content hashes: ${neetHashes.size}`);
  console.log('NEET_UG years breakdown:', byYear);
  console.log('NEET_UG ingestionState breakdown:', byState);
}

main().catch(console.error);
