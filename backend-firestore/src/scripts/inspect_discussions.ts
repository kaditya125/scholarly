import { db, auth } from '../config/firebase';

async function main() {
  console.log('--- Discussions ---');
  const snap = await db.collection('discussions').get();
  for (const doc of snap.docs) {
    console.log(doc.id, JSON.stringify(doc.data(), null, 2));
  }

  console.log('\n--- User Directory ---');
  const dirSnap = await db.collection('userDirectory').get();
  for (const doc of dirSnap.docs) {
    console.log(doc.id, JSON.stringify(doc.data(), null, 2));
  }

  console.log('\n--- Auth Users ---');
  const authUsers = await auth.listUsers();
  for (const u of authUsers.users) {
    console.log(u.uid, u.displayName, u.email);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
