/**
 * Manually trigger chapter generation for debugging
 */

const http = require('http');
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

async function triggerGeneration() {
  const notebookId = process.argv[2];
  const sourceId = process.argv[3];

  if (!notebookId || !sourceId) {
    console.error('\n❌ Usage: node test-generate.js <notebookId> <sourceId>');
    console.error('\nExample: node test-generate.js ncert-biology-11-2025 living-world\n');
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('Manual Chapter Generation');
  console.log('========================================\n');

  // First, check if the source exists
  const db = admin.firestore();
  const sourceDoc = await db.collection('notebooks').doc(notebookId).collection('sources').doc(sourceId).get();
  
  if (!sourceDoc.exists) {
    console.error(`❌ Source not found: ${notebookId}/${sourceId}\n`);
    process.exit(1);
  }

  const sourceData = sourceDoc.data();
  console.log(`📄 Found source: ${sourceData.title}`);
  console.log(`   Current status: ${sourceData.status}\n`);

  // Make HTTP request to localhost:8080
  console.log('🚀 Triggering generation via API...');
  console.log(`   POST http://localhost:8080/api/documents/books/${notebookId}/chapters/${sourceId}/generate\n`);

  const options = {
    hostname: 'localhost',
    port: 8080,
    path: `/api/documents/books/${notebookId}/chapters/${sourceId}/generate`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log(`✅ Response status: ${res.statusCode}`);
      console.log(`   Response: ${data}\n`);
      
      if (res.statusCode === 202) {
        console.log('✅ Generation started!');
        console.log('\nNow monitoring source status for changes...\n');
        monitorStatus(notebookId, sourceId);
      } else {
        console.error('❌ Unexpected response');
        process.exit(1);
      }
    });
  });

  req.on('error', (error) => {
    console.error(`❌ Request failed: ${error.message}\n`);
    console.error('Make sure the backend is running on port 8080\n');
    process.exit(1);
  });

  req.end();
}

function monitorStatus(notebookId, sourceId) {
  const db = admin.firestore();
  let lastStatus = '';
  let checkCount = 0;
  const maxChecks = 60; // 60 checks * 2 seconds = 2 minutes max

  const interval = setInterval(async () => {
    checkCount++;
    
    try {
      const sourceDoc = await db.collection('notebooks').doc(notebookId).collection('sources').doc(sourceId).get();
      const currentStatus = sourceDoc.data()?.status || 'UNKNOWN';
      
      if (currentStatus !== lastStatus) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] Status changed: ${lastStatus || 'UNKNOWN'} → ${currentStatus}`);
        lastStatus = currentStatus;
      }

      // Check if we're done
      if (currentStatus === 'READY' || currentStatus === 'READY_DEGRADED') {
        console.log(`\n✅ Generation completed with status: ${currentStatus}`);
        
        // Check for DOCUMENTARY_ARTICLE
        const assetsSnapshot = await db.collection('notebooks').doc(notebookId).collection('assets')
          .where('type', '==', 'DOCUMENTARY_ARTICLE')
          .limit(1)
          .get();
        
        if (!assetsSnapshot.empty) {
          console.log('✅ DOCUMENTARY_ARTICLE asset created!');
        } else {
          console.log('⚠️  DOCUMENTARY_ARTICLE asset NOT found (this is the problem)');
        }
        
        clearInterval(interval);
        process.exit(0);
      } else if (currentStatus === 'FAILED') {
        console.log('\n❌ Generation failed!');
        const data = sourceDoc.data();
        if (data.errorDetails) {
          console.log(`   Error: ${data.errorDetails}`);
        }
        clearInterval(interval);
        process.exit(1);
      }

      if (checkCount >= maxChecks) {
        console.log('\n⏱️  Timeout: Generation taking longer than expected');
        clearInterval(interval);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error checking status: ${error.message}`);
    }
  }, 2000); // Check every 2 seconds
}

triggerGeneration().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
