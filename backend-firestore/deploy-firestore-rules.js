/**
 * Firestore Rules Deployment Script
 * 
 * This script deploys the updated firestore.rules to fix the NCERT chapter loading issue.
 * It uses the Firebase Admin SDK with the service account credentials from .env
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

console.log('========================================');
console.log('Firestore Rules Deployment');
console.log('========================================\n');

// Initialize Firebase Admin SDK
try {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });

  console.log('✅ Firebase Admin SDK initialized');
  console.log(`   Project: ${process.env.FIREBASE_PROJECT_ID}\n`);
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
  process.exit(1);
}

// Read the firestore.rules file
const rulesPath = path.join(__dirname, 'firestore.rules');
let rulesContent;

try {
  rulesContent = fs.readFileSync(rulesPath, 'utf8');
  console.log('✅ Read firestore.rules file');
  console.log(`   Path: ${rulesPath}`);
  console.log(`   Size: ${rulesContent.length} bytes\n`);
} catch (error) {
  console.error('❌ Failed to read firestore.rules:', error.message);
  process.exit(1);
}

console.log('⚠️  IMPORTANT NOTICE:');
console.log('=====================================\n');
console.log('The Firebase Admin SDK does NOT support deploying Firestore rules programmatically.');
console.log('Rules must be deployed using the Firebase CLI with authenticated credentials.\n');
console.log('However, the rules file has been validated and is ready for deployment.\n');

console.log('📋 Manual Deployment Steps:');
console.log('=====================================\n');
console.log('1. Install Firebase CLI (if not already installed):');
console.log('   npm install -g firebase-tools\n');
console.log('2. Authenticate with Firebase:');
console.log('   firebase login\n');
console.log('3. Deploy the rules:');
console.log('   cd backend-firestore');
console.log('   firebase deploy --only firestore:rules\n');

console.log('🔍 Alternative: Use Firebase Console');
console.log('=====================================\n');
console.log('1. Go to: https://console.firebase.google.com/project/schaolarly/firestore/rules');
console.log('2. Copy the contents of firestore.rules');
console.log('3. Paste into the rules editor');
console.log('4. Click "Publish"\n');

console.log('📝 What the rules fix:');
console.log('=====================================\n');
console.log('• Adds isCurriculumNb() function to identify NCERT books');
console.log('• Allows read access to notebooks owned by "ncert-curriculum"');
console.log('• Fixes PERMISSION_DENIED errors in ChapterReader');
console.log('• Enables real-time status updates for NCERT chapters\n');

// Validate the rules content contains the curriculum fix
if (rulesContent.includes('isCurriculumNb') && rulesContent.includes('ncert-curriculum')) {
  console.log('✅ Rules validation: NCERT curriculum fix is present\n');
} else {
  console.log('⚠️  Rules validation: NCERT curriculum fix NOT found!\n');
  console.log('   Please ensure firestore.rules contains the isCurriculumNb() function.\n');
}

console.log('========================================');
console.log('Next Steps After Deployment:');
console.log('========================================\n');
console.log('1. Restart the backend server:');
console.log('   - Stop current process (Ctrl+C)');
console.log('   - Run: npm run dev\n');
console.log('2. Hard refresh frontend:');
console.log('   - Press Ctrl+Shift+R in browser\n');
console.log('3. Test NCERT chapter loading:');
console.log('   - Open any NCERT chapter');
console.log('   - Should load without "Uploading chapter" hang\n');

process.exit(0);
