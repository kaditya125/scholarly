/**
 * Diagnostic script to check which podcasts exist in Firestore
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
});

const db = getFirestore(app);

async function checkPodcasts() {
  try {
    console.log('\n🔍 Checking podcasts collection...\n');
    
    const podcasts = await db.collection('podcasts').limit(10).get();
    
    if (podcasts.empty) {
      console.log('❌ No podcasts found in the database\n');
      return;
    }
    
    console.log(`✅ Found ${podcasts.size} podcasts:\n`);
    
    podcasts.forEach((doc) => {
      const data = doc.data();
      console.log(`📁 Podcast ID: ${doc.id}`);
      console.log(`   Title: ${data.title || 'N/A'}`);
      console.log(`   Status: ${data.status || 'N/A'}`);
      console.log(`   User ID: ${data.userId || 'N/A'}`);
      console.log(`   Notebook ID: ${data.notebookId || 'N/A'}`);
      console.log(`   Audio Path: ${data.audioPath || 'N/A'}`);
      console.log(`   Created: ${data.createdAt ? new Date(data.createdAt).toLocaleString() : 'N/A'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error checking podcasts:', error);
  } finally {
    process.exit(0);
  }
}

checkPodcasts();
