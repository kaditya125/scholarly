/**
 * Diagnostic: Test the podcast generation API directly
 * This simulates what the frontend should be sending
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase
const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const db = admin.firestore();

async function diagnose() {
  console.log('🔍 Podcast Generation Diagnostic\n');
  console.log('='.repeat(70));
  
  // Check 1: Backend configuration
  console.log('\n1️⃣  Backend Configuration');
  console.log('-'.repeat(70));
  console.log(`✅ Firebase Project: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(`✅ Storage Bucket: ${process.env.FIREBASE_STORAGE_BUCKET}`);
  console.log(`Workers Disabled: ${process.env.DISABLE_WORKERS || 'not set'}`);
  console.log(`Redis URL: ${process.env.REDIS_URL ? '✅ configured' : '❌ missing'}`);
  
  // Check 2: Recent podcasts
  console.log('\n2️⃣  Recent Podcasts (Last 5)');
  console.log('-'.repeat(70));
  
  try {
    const snapshot = await db.collection('podcasts')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    if (snapshot.empty) {
      console.log('❌ No podcasts found in database');
      console.log('   This means requests are not reaching the controller');
      console.log('   or failing validation before creating documents');
    } else {
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`\n📻 ${doc.id}`);
        console.log(`   Status: ${data.status}`);
        console.log(`   Title: ${data.title || 'N/A'}`);
        console.log(`   Created: ${new Date(data.createdAt).toLocaleString()}`);
        console.log(`   Progress: ${data.progressPct || 0}%`);
        
        if (data.status === 'FAILED' && data.description) {
          console.log(`   ❌ Error: ${data.description}`);
        }
      });
    }
  } catch (err) {
    console.error('❌ Error querying podcasts:', err.message);
  }
  
  // Check 3: Check if backend is responding
  console.log('\n3️⃣  Backend Health Check');
  console.log('-'.repeat(70));
  
  try {
    const response = await fetch('http://localhost:8080/api/health').catch(e => null);
    if (response && response.ok) {
      console.log('✅ Backend is responding on http://localhost:8080');
    } else {
      console.log('❌ Backend is NOT responding on http://localhost:8080');
      console.log('   Make sure to run: cd backend-firestore && npm run dev');
    }
  } catch (err) {
    console.log('❌ Cannot connect to backend');
    console.log('   Error:', err.message);
  }
  
  // Check 4: Test notebooks exist
  console.log('\n4️⃣  Check Notebooks');
  console.log('-'.repeat(70));
  
  try {
    const notebooksSnapshot = await db.collection('notebooks')
      .limit(3)
      .get();
    
    if (notebooksSnapshot.empty) {
      console.log('⚠️  No notebooks found in database');
      console.log('   You need at least one notebook to generate podcasts');
    } else {
      console.log(`✅ Found ${notebooksSnapshot.size} notebooks`);
      notebooksSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   - ${doc.id}: ${data.title || 'Untitled'}`);
      });
    }
  } catch (err) {
    console.error('❌ Error querying notebooks:', err.message);
  }
  
  // Check 5: Worker status
  console.log('\n5️⃣  Worker Status');
  console.log('-'.repeat(70));
  
  const workersDisabled = process.env.DISABLE_WORKERS === 'true';
  if (workersDisabled) {
    console.log('⚠️  Workers are DISABLED');
    console.log('   Podcasts will stay in PENDING forever');
    console.log('   Fix: Set DISABLE_WORKERS=false in .env');
  } else {
    console.log('✅ Workers should be enabled');
    console.log('   Make sure backend is running with workers');
  }
  
  // Check 6: Google Cloud TTS credentials
  console.log('\n6️⃣  Google Cloud TTS');
  console.log('-'.repeat(70));
  
  const fs = require('fs');
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/vertex-sa.json';
  
  if (fs.existsSync(credsPath)) {
    console.log(`✅ Credentials file exists: ${credsPath}`);
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      console.log(`   Project: ${creds.project_id}`);
      console.log(`   Client Email: ${creds.client_email}`);
    } catch (err) {
      console.log(`⚠️  Could not read credentials: ${err.message}`);
    }
  } else {
    console.log(`❌ Credentials file NOT found: ${credsPath}`);
    console.log('   TTS synthesis will fail without credentials');
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📋 DIAGNOSIS SUMMARY');
  console.log('='.repeat(70));
  
  console.log('\nLikely Issues:');
  console.log('1. ❌ Backend might not be running');
  console.log('2. ❌ Frontend might not be sending correct format');
  console.log('3. ❌ Request might be failing before creating podcast document');
  console.log('4. ⚠️  Workers might be disabled');
  
  console.log('\nNext Steps:');
  console.log('1. Check if backend is running: http://localhost:8080/api/health');
  console.log('2. Check browser console for API errors');
  console.log('3. Check backend terminal for error logs');
  console.log('4. Verify frontend is sending POST to /api/podcasts/generate');
  
  process.exit(0);
}

diagnose();
