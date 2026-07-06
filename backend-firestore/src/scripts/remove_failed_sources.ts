import { db } from '../config/firebase';

async function main() {
  console.log("Searching for failed sources to remove...");
  let deletedCount = 0;

  // Get all notebooks
  const notebooksSnap = await db.collection('notebooks').get();
  console.log(`Checking ${notebooksSnap.size} notebooks...`);

  for (const notebookDoc of notebooksSnap.docs) {
    const notebookId = notebookDoc.id;
    const sourcesSnap = await db.collection('notebooks').doc(notebookId).collection('sources')
      .where('status', '==', 'FAILED').get();

    if (!sourcesSnap.empty) {
      console.log(`Found ${sourcesSnap.size} failed sources in notebook ${notebookId}. Deleting...`);
      for (const sourceDoc of sourcesSnap.docs) {
        console.log(`  -> Deleting source: ${sourceDoc.data().title || sourceDoc.id}`);
        await sourceDoc.ref.delete();
        deletedCount++;
      }
    }
  }

  console.log(`\nCleanup complete! Deleted ${deletedCount} failed PDFs.`);
  process.exit(0);
}

main().catch((e) => { 
  console.error('Cleanup error:', e); 
  process.exit(1); 
});
