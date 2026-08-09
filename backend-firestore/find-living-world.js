/**
 * Find "The Living World" chapter in Firestore
 */

const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

const db = admin.firestore();

async function findLivingWorld() {
  console.log('\n🔍 Searching for "The Living World" chapter...\n');

  // Search all notebooks
  const notebooksSnapshot = await db.collection('notebooks').get();
  
  console.log(`Found ${notebooksSnapshot.size} total notebooks\n`);

  for (const notebookDoc of notebooksSnapshot.docs) {
    const notebookId = notebookDoc.id;
    const notebookData = notebookDoc.data();
    
    // Search sources in this notebook
    const sourcesSnapshot = await db.collection('notebooks').doc(notebookId).collection('sources').get();
    
    for (const sourceDoc of sourcesSnapshot.docs) {
      const sourceData = sourceDoc.data();
      if (sourceData.title && sourceData.title.toLowerCase().includes('living world')) {
        console.log('✅ FOUND IT!');
        console.log('========================================');
        console.log(`Notebook: ${notebookData.title || notebookId}`);
        console.log(`Notebook ID: ${notebookId}`);
        console.log(`Source ID: ${sourceDoc.id}`);
        console.log(`Title: ${sourceData.title}`);
        console.log(`Status: ${sourceData.status}`);
        console.log('========================================\n');
        console.log('To trigger generation, run:');
        console.log(`node test-generate.js ${notebookId} ${sourceDoc.id}\n`);
        process.exit(0);
      }
    }
  }

  console.log('❌ "The Living World" chapter not found\n');
  console.log('Try searching manually in Firebase Console:\n');
  console.log('https://console.firebase.google.com/project/schaolarly/firestore\n');
  process.exit(1);
}

findLivingWorld().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
