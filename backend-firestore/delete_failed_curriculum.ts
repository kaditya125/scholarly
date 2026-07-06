import { db } from './src/config/firebase';

async function removeFailedCurriculum() {
  console.log('Finding NCERT notebooks...');
  const nbSnap = await db.collection('notebooks').where('owner', '==', 'ncert-curriculum').get();
  
  let deletedCount = 0;
  for (const nbDoc of nbSnap.docs) {
    const sourcesSnap = await nbDoc.ref.collection('sources').where('status', '==', 'FAILED').get();
    for (const sourceDoc of sourcesSnap.docs) {
      console.log(`Deleting failed source: ${sourceDoc.data().title} in ${nbDoc.id}`);
      await sourceDoc.ref.delete();
      deletedCount++;
    }
  }
  
  console.log(`Successfully removed ${deletedCount} failed curriculum ingestions.`);
  process.exit(0);
}

removeFailedCurriculum().catch(console.error);
