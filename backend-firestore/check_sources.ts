import { firebaseApp } from './src/config/firebase';
async function run() {
  const s = await firebaseApp.firestore().collectionGroup('sources').get();
  s.docs.forEach(d => console.log(d.id, d.data().title, d.data().status, d.data().chunksExtracted));
  process.exit();
}
run();
