import { db } from '../config/firebase';
import { notebookRepository } from '../repositories/notebook.repository';
import { sourceService } from '../services/source.service';
import * as dotenv from 'dotenv';

dotenv.config();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('=== Starting Migration: Linking Existing Concept Nodes ===');
  
  try {
    const notebooksSnap = await db.collection('notebooks').get();
    console.log(`Found ${notebooksSnap.size} notebooks in the database.`);

    for (let index = 0; index < notebooksSnap.docs.length; index++) {
      const doc = notebooksSnap.docs[index];
      const notebookId = doc.id;
      const notebookName = doc.data().name || 'Unnamed';

      console.log(`\n[${index + 1}/${notebooksSnap.docs.length}] Processing Notebook: "${notebookName}" (ID: ${notebookId})...`);
      
      const allNodes = await notebookRepository.getKGNodes(notebookId);
      console.log(`-> Notebook has ${allNodes.length} concept nodes.`);

      if (allNodes.length <= 1) {
        console.log('-> Not enough nodes to generate connections. Skipping.');
        continue;
      }

      // Batch process nodes in chunks of 30 to avoid hitting token limits
      const chunkSize = 30;
      for (let i = 0; i < allNodes.length; i += chunkSize) {
        const batch = allNodes.slice(i, i + chunkSize);
        console.log(`   -> Analyzing batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(allNodes.length / chunkSize)} (${batch.length} nodes)...`);
        
        await sourceService.linkGraphConcepts(notebookId, batch);
        
        // Add a small delay between batches to protect API rate limits
        await sleep(1500);
      }
    }

    console.log('\n⭐⭐⭐ Finished linking all existing concepts across the platform! ⭐⭐⭐');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
