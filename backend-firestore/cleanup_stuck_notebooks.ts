/**
 * Cleans up legacy stuck notebooks ncert-c9-physics and ncert-c7-science.
 * These are orphaned from an old ingestion run. The correct replacements are:
 *   ncert-c9-science       (13 chapters, READY)
 *   ncert-c7-science-curiosity (12 chapters, READY)
 *
 * This script:
 * 1. Prints all sources in each stuck notebook
 * 2. Deletes all stuck (non-READY) sources
 * 3. Deletes the notebook document itself if it ends up empty
 */
import { db } from './src/config/firebase';

const STUCK = ['ncert-c9-physics', 'ncert-c7-science'];

async function main() {
  for (const notebookId of STUCK) {
    console.log(`\n=== ${notebookId} ===`);
    const snap = await db.collection('notebooks').doc(notebookId).collection('sources').get();
    console.log(`  ${snap.size} sources found:`);

    const toDelete: FirebaseFirestore.DocumentReference[] = [];
    for (const doc of snap.docs) {
      const s = doc.data() as any;
      console.log(`    [${s.status}]  ${s.title}`);
      if (s.status !== 'READY' && s.status !== 'READY_DEGRADED') {
        toDelete.push(doc.ref);
      }
    }

    if (toDelete.length > 0) {
      console.log(`  Deleting ${toDelete.length} stuck sources...`);
      for (const ref of toDelete) await ref.delete();
      console.log(`  Done.`);
    }

    // Check if notebook is now empty
    const remaining = await db.collection('notebooks').doc(notebookId).collection('sources').get();
    if (remaining.empty) {
      console.log(`  Notebook is now empty — deleting notebook document...`);
      await db.collection('notebooks').doc(notebookId).delete();
      console.log(`  Notebook ${notebookId} deleted.`);
    } else {
      console.log(`  ${remaining.size} READY sources remain — keeping notebook.`);
    }
  }

  console.log('\nCleanup complete.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
