/**
 * List all notebooks to find the structure
 */

const admin = require('firebase-admin');
require('dotenv').config();

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

async function listNotebooks() {
  console.log('\n📚 Listing all notebooks...\n');

  const notebooksSnapshot = await db.collection('notebooks').limit(50).get();
  
  console.log(`Total notebooks: ${notebooksSnapshot.size}\n`);

  for (const doc of notebooksSnapshot.docs) {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`  Title: ${data.title || 'N/A'}`);
    console.log(`  Owner: ${data.owner || data.userId || 'N/A'}`);
    console.log(`  Type: ${data.type || 'N/A'}`);
    
    // Check for sources
    const sourcesSnapshot = await db.collection('notebooks').doc(doc.id).collection('sources').limit(5).get();
    if (sourcesSnapshot.size > 0) {
      console.log(`  Sources: ${sourcesSnapshot.size}`);
      sourcesSnapshot.docs.slice(0, 3).forEach(sourceDoc => {
        const sourceData = sourceDoc.data();
        console.log(`    - ${sourceData.title} (${sourceDoc.id})`);
      });
    }
    console.log('');
  }

  process.exit(0);
}

listNotebooks().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
