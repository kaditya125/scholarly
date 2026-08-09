/**
 * Check the status of a specific NCERT chapter and its assets
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

async function checkChapterStatus() {
  // Get command line arguments for notebookId and sourceId
  const notebookId = process.argv[2];
  const sourceId = process.argv[3];

  if (!notebookId || !sourceId) {
    console.error('Usage: node check-chapter-status.js <notebookId> <sourceId>');
    console.error('Example: node check-chapter-status.js ncert-biology-11 chapter-1');
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('Chapter Status Check');
  console.log('========================================\n');
  console.log(`Notebook ID: ${notebookId}`);
  console.log(`Source ID: ${sourceId}\n`);

  try {
    // Check source document
    const sourceDoc = await db.collection('notebooks').doc(notebookId).collection('sources').doc(sourceId).get();
    
    if (!sourceDoc.exists) {
      console.log('❌ Source document not found!');
      process.exit(1);
    }

    const sourceData = sourceDoc.data();
    console.log('📄 Source Document:');
    console.log(`   Title: ${sourceData.title}`);
    console.log(`   Status: ${sourceData.status}`);
    console.log(`   Created: ${new Date(sourceData.createdAt).toLocaleString()}`);
    if (sourceData.updatedAt) {
      console.log(`   Updated: ${new Date(sourceData.updatedAt).toLocaleString()}`);
    }
    if (sourceData.failedAt) {
      console.log(`   Failed At: ${new Date(sourceData.failedAt).toLocaleString()}`);
      console.log(`   Failure Reason: ${sourceData.failureReason || 'N/A'}`);
      console.log(`   Error Details: ${sourceData.errorDetails || 'N/A'}`);
    }
    console.log('');

    // Check assets
    const assetsSnapshot = await db.collection('notebooks').doc(notebookId).collection('assets').get();
    
    console.log(`📦 Assets (${assetsSnapshot.size} total):`);
    
    const assetsByType = {};
    assetsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!assetsByType[data.type]) {
        assetsByType[data.type] = [];
      }
      assetsByType[data.type].push({
        id: doc.id,
        title: data.title,
        createdAt: data.createdAt
      });
    });

    Object.keys(assetsByType).sort().forEach(type => {
      console.log(`\n   ${type}:`);
      assetsByType[type].forEach(asset => {
        console.log(`      ✓ ${asset.title}`);
        console.log(`        Created: ${new Date(asset.createdAt).toLocaleString()}`);
      });
    });

    // Check specifically for DOCUMENTARY_ARTICLE
    const docArticle = assetsByType['DOCUMENTARY_ARTICLE'];
    console.log('\n========================================');
    if (docArticle && docArticle.length > 0) {
      console.log('✅ DOCUMENTARY_ARTICLE exists!');
      console.log(`   Count: ${docArticle.length}`);
    } else {
      console.log('❌ DOCUMENTARY_ARTICLE is missing!');
      console.log('\nThis is why the Article view shows "Preparing your learning experience..."');
      console.log('\nTo fix:');
      console.log(`1. Click "Force Retry" in the UI`);
      console.log(`2. Or run: curl -X POST http://localhost:8080/api/documents/books/${notebookId}/chapters/${sourceId}/generate`);
    }
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

checkChapterStatus();
