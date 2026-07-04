import { db } from './src/config/firebase';

async function testRead() {
  try {
    console.log("Attempting direct read from Firestore...");
    const snapshot = await db.collection('test').get();
    console.log("Read successful! Found", snapshot.size, "documents.");
    snapshot.forEach(doc => console.log(doc.id, "=>", doc.data()));
  } catch (error) {
    console.error("Direct read failed:", error);
  } finally {
    process.exit(0);
  }
}

testRead();
