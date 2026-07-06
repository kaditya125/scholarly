/** Deletes sources stuck in a non-terminal status (orphaned by a killed ingestion). */
import { db } from '../config/firebase';

async function main() {
  const snap = await db.collection('notebooks').get();
  let cleared = 0;
  for (const doc of snap.docs) {
    const srcs = await doc.ref.collection('sources').get();
    for (const s of srcs.docs) {
      const status = (s.data() as any).status;
      if (!['READY', 'FAILED'].includes(status)) {
        console.log(`  clearing ${status} source "${(s.data() as any).title}" in ${doc.id}`);
        await s.ref.delete();
        cleared++;
      }
    }
  }
  console.log(`Cleared ${cleared} stuck source(s).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
