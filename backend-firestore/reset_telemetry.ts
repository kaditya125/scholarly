import { db } from './src/config/firebase';

async function wipeTelemetry() {
  const snaps = await db.collection('telemetry').get();
  const batch = db.batch();
  
  snaps.docs.forEach((doc: any) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  console.log(`Deleted ${snaps.size} old telemetry records.`);
  process.exit(0);
}

wipeTelemetry().catch(console.error);
