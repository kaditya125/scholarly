import { db } from './src/config/firebase';

async function main() {
  const notebooks = await db.collection('notebooks').get();
  console.log(`Notebooks total: ${notebooks.docs.length}`);

  let totalSources = 0;
  let readySources = 0;

  for (const nb of notebooks.docs) {
    const sources = await db.collection('notebooks').doc(nb.id).collection('sources').get();
    totalSources += sources.docs.length;
    
    for (const src of sources.docs) {
      if (src.data().status === 'READY') {
        readySources++;
      }
    }
  }

  console.log(`Total Sources Processed: ${totalSources}`);
  console.log(`Successfully Indexed (READY): ${readySources}`);
  process.exit(0);
}
main();
