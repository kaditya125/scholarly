import 'dotenv/config';
import { db } from '../../../src/config/firebase';

async function checkPending() {
  const snap = await db.collection('pyq_questions')
    .where('corpusBucket', '==', 'PRACTICE_MOCK')
    .where('ingestionState', '==', 'ACTIVE')
    .get();

  let indexed = 0;
  let pending = 0;

  snap.docs.forEach(d => {
    if (d.data().vectorIndexed === true) indexed++;
    else pending++;
  });

  console.log(`Active PRACTICE_MOCK questions:`);
  console.log(`  Indexed: ${indexed}`);
  console.log(`  Pending: ${pending}`);
  console.log(`  Total:   ${snap.size}`);

  process.exit(0);
}

checkPending().catch(err => {
  console.error(err);
  process.exit(1);
});
