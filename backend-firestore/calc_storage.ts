import { firebaseApp } from './src/config/firebase';

async function calculateStorage() {
  try {
    const bucket = firebaseApp.storage().bucket('schaolarly.firebasestorage.app');
    const [files] = await bucket.getFiles();
    
    const totalBytes = files.reduce((acc, f) => acc + parseInt(f.metadata.size || '0', 10), 0);
    const mb = (totalBytes / 1024 / 1024).toFixed(2);
    
    console.log(`Total Storage Consumed: ${mb} MB across ${files.length} files`);
  } catch (error) {
    console.error('Error fetching storage:', error);
  }
}

calculateStorage().then(() => process.exit(0));
