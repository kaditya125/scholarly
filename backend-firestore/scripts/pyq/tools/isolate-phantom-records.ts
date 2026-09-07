import 'dotenv/config';
import { db } from '../../../src/config/firebase';

async function isolatePhantomRecords() {
  const phantomIds = [
    'pyq:jee_main:2024:sess:shift_1:q1:81d76c03',
    'pyq:jee_main:2024:session_1:shift_1:q1:81d76c03',
    'pyq:jee_main:2024:session_1:shift_1:q1:c1d2e3f4'
  ];

  console.log('Isolating phantom retrieval test records in Firestore...');
  const now = Date.now();

  for (const id of phantomIds) {
    const docRef = db.collection('pyq_questions').doc(id);
    const doc = await docRef.get();
    if (doc.exists) {
      await docRef.set({
        ingestionState: 'QUARANTINED',
        quarantineReason: 'UNKNOWN_ORIGIN',
        origin: 'unknown',
        restorationState: 'UNVERIFIED',
        quarantinedAt: now,
        quarantinedBy: 'reconciliation-audit-v2',
        updatedAt: now,
        vectorIndexed: false,
        phantomRetrievalStub: true
      }, { merge: true });
      console.log(`✅ Successfully quarantined phantom stub: ${id}`);
    } else {
      console.log(`Document not found: ${id}`);
    }
  }

  process.exit(0);
}

isolatePhantomRecords().catch(err => {
  console.error(err);
  process.exit(1);
});
