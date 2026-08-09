import { db } from './src/config/firebase';

async function checkLoadTestCount() {
  const snap = await db.collectionGroup('notifications')
    .where('userId', '>=', 'user_load_0')
    .where('userId', '<=', 'user_load_99999')
    .get();
  
  console.log(`Found ${snap.size} load test notifications in Firestore!`);
  process.exit(0);
}

checkLoadTestCount().catch(e => {
  console.error(e);
  process.exit(1);
});
