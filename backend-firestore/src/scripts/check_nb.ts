import { firebaseApp } from '../config/firebase';

async function run() {
  const db = firebaseApp.firestore();
  console.log("Checking article asset by type...");
  
  const snap = await db.collection('notebooks').doc('ncert-c11-biology').collection('assets').where('type', '==', 'DOCUMENTARY_ARTICLE').get();
  console.log('Found:', snap.docs.length);
  if (snap.docs.length > 0) {
    const data = snap.docs[0].data();
    console.log('Asset generation successful!');
    console.log('Preview:', JSON.stringify(data?.content).slice(0, 100));
  } else {
    console.log('Asset does NOT exist in this project!');
  }
}

run().catch(console.error);
