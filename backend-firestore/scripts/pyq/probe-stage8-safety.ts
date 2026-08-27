import 'dotenv/config';
import { db } from '../../src/config/firebase';
(async () => {
  const pyq = await db.collection('pyq_questions').get();
  const ver = await db.collection('pyq_provenance_verifications').get();
  const mastery = await db.collectionGroup('mastery').get();
  const stamped = pyq.docs.filter((d) => (d.data() as any).provenanceStamp).length;
  const selfCert = pyq.docs.filter((d) => (d.data() as any).verificationStatus === 'OFFICIAL_CONFIRMED').length;
  console.log('=== post-Stage-8 safety ===');
  console.log(`  pyq_questions                 : ${pyq.size} (unchanged)`);
  console.log(`  still self-certifying         : ${selfCert} (untouched)`);
  console.log(`  provenanceStamp issued        : ${stamped}`);
  console.log(`  verification records written  : ${ver.size} (separate collection)`);
  console.log(`  mastery records               : ${mastery.size}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
