/**
 * Diagnostic script for failed podcast generation
 * Checks Firestore for podcast and job status
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

async function diagnosePodcasts() {
  console.log('🔍 Diagnosing Failed Podcasts\n');
  console.log('='.repeat(70));
  
  try {
    // Get all podcasts sorted by creation time
    const podcastsSnapshot = await db.collection('podcasts')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    
    if (podcastsSnapshot.empty) {
      console.log('❌ No podcasts found in database');
      return;
    }
    
    console.log(`Found ${podcastsSnapshot.size} recent podcasts\n`);
    
    for (const doc of podcastsSnapshot.docs) {
      const podcast = { id: doc.id, ...doc.data() };
      
      console.log(`\n📻 Podcast: ${podcast.id}`);
      console.log('-'.repeat(70));
      console.log(`Title: ${podcast.title || 'N/A'}`);
      console.log(`Status: ${podcast.status || 'N/A'}`);
      console.log(`Progress: ${podcast.progressPct || 0}%`);
      console.log(`Created: ${new Date(podcast.createdAt).toLocaleString()}`);
      console.log(`NotebookID: ${podcast.notebookId || 'N/A'}`);
      console.log(`JobID: ${podcast.jobId || 'N/A'}`);
      
      if (podcast.description && podcast.status === 'FAILED') {
        console.log(`❌ Error: ${podcast.description}`);
      }
      
      // Get job details if exists
      if (podcast.jobId) {
        try {
          const jobDoc = await db.collection('podcast_jobs').doc(podcast.jobId).get();
          
          if (jobDoc.exists) {
            const job = jobDoc.data();
            console.log(`\n📋 Job Details:`);
            console.log(`  Stage: ${job.stage || 'N/A'}`);
            console.log(`  Stage Message: ${job.stageMessage || 'N/A'}`);
            console.log(`  Attempts: ${job.attempts || 0}`);
            console.log(`  Cancel Requested: ${job.cancelRequested ? 'Yes' : 'No'}`);
            
            if (job.error) {
              console.log(`  ❌ Job Error: ${job.error}`);
            }
            
            if (job.checkpoint) {
              console.log(`  ✅ Checkpoint exists: ${JSON.stringify(Object.keys(job.checkpoint))}`);
            }
            
            if (job.request) {
              console.log(`  📝 Request:`);
              console.log(`     Duration: ${job.request.durationMinutes || 'N/A'} minutes`);
              console.log(`     Speaker Style: ${job.request.speakerStyle || 'N/A'}`);
              console.log(`     Language: ${job.request.language || 'N/A'}`);
              console.log(`     Source: ${job.request.source?.kind || 'N/A'}`);
            }
          } else {
            console.log(`⚠️  Job document not found: ${podcast.jobId}`);
          }
        } catch (jobErr) {
          console.log(`❌ Error fetching job: ${jobErr.message}`);
        }
      }
    }
    
    // Check for stuck jobs
    console.log('\n' + '='.repeat(70));
    console.log('🔎 Checking for Stuck Jobs');
    console.log('='.repeat(70));
    
    const jobsSnapshot = await db.collection('podcast_jobs')
      .where('stage', 'in', ['QUEUED', 'PLANNING', 'SCRIPTING', 'SYNTHESIZING', 'STITCHING', 'UPLOADING'])
      .get();
    
    if (jobsSnapshot.empty) {
      console.log('✅ No stuck jobs found');
    } else {
      console.log(`⚠️  Found ${jobsSnapshot.size} potentially stuck jobs:\n`);
      
      for (const doc of jobsSnapshot.docs) {
        const job = doc.data();
        const ageMinutes = Math.floor((Date.now() - job.updatedAt) / 60000);
        
        console.log(`  Job ${doc.id}:`);
        console.log(`    Stage: ${job.stage}`);
        console.log(`    Age: ${ageMinutes} minutes`);
        console.log(`    Attempts: ${job.attempts || 0}`);
        console.log();
      }
    }
    
    // Check worker status
    console.log('='.repeat(70));
    console.log('⚙️  Worker Configuration');
    console.log('='.repeat(70));
    console.log(`DISABLE_WORKERS: ${process.env.DISABLE_WORKERS || 'not set'}`);
    console.log(`REDIS_URL: ${process.env.REDIS_URL ? '✅ configured' : '❌ missing'}`);
    console.log(`GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'not set'}`);
    
    // Check TTS credentials
    const fs = require('fs');
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credsPath && fs.existsSync(credsPath)) {
      console.log(`✅ TTS credentials file exists: ${credsPath}`);
    } else {
      console.log(`❌ TTS credentials file not found: ${credsPath}`);
    }
    
  } catch (err) {
    console.error('❌ Diagnostic error:', err);
  } finally {
    process.exit(0);
  }
}

diagnosePodcasts();
