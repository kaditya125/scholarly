import { firebaseApp } from '../config/firebase';
import { sourceRepository } from '../repositories/source.repository';
import { sourceService } from '../services/source.service';

async function main() {
  console.log('Starting revectorization process...');
  const db = firebaseApp.firestore();
  
  // Find all notebooks
  const notebooksSnap = await db.collection('notebooks').get();
  console.log(`Found ${notebooksSnap.size} notebooks.`);
  
  let processed = 0;
  
  for (const nb of notebooksSnap.docs) {
    const notebookId = nb.id;
    const sourcesSnap = await db.collection('notebooks').doc(notebookId).collection('sources').get();
    
    for (const sourceDoc of sourcesSnap.docs) {
      const source = sourceDoc.data() as any;
      
      // Identify sources that have a storage path but appear to have failed vectorization
      // (e.g. chunksExtracted is 0 or surprisingly low compared to sizeBytes)
      if (source.storagePath) {
        if (!source.chunksExtracted || source.chunksExtracted < 10) {
          console.log(`\nRe-vectorizing: ${source.title} (ID: ${source.id})`);
          console.log(`Currently has chunksExtracted = ${source.chunksExtracted}`);
          
          try {
            const bucket = firebaseApp.storage().bucket();
          const fileRef = bucket.file(source.storagePath);
          const [exists] = await fileRef.exists();
          
          if (!exists) {
            console.log(`  [SKIP] File not found in Firebase Storage: ${source.storagePath}`);
            continue;
          }
          
          console.log(`  Downloading from storage...`);
          const [buffer] = await fileRef.download();
          
          // Mock Multer File object required by processFileBackground
          const mockFile = {
            buffer,
            originalname: source.originalName || source.title,
            mimetype: source.mimeType,
            size: buffer.length
          } as any;
          
          console.log(`  Pushing through ingestion pipeline...`);
          // Using any to bypass private method constraint
          await (sourceService as any).processFileBackground(source, mockFile);
          processed++;
          console.log(`  [SUCCESS] Re-vectorization started/completed for ${source.title}`);
        } catch (error) {
          console.error(`  [FAILED] Could not process ${source.title}:`, error);
        }
      }
    }
    }
  }

  console.log(`\nFinished! Initiated re-vectorization for ${processed} documents.`);
}

main().catch(console.error);
