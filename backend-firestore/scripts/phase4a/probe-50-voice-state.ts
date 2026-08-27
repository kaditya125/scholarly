import 'dotenv/config';
import { db, auth } from '../../src/config/firebase';
(async () => {
  console.log('=== leftover test data from voice QA ===');
  const uid = 'qa-voice-probe-20260826';
  const doc = await db.collection('voice_usage').doc(uid).get();
  console.log(`  voice_usage/${uid}: ${doc.exists ? JSON.stringify(doc.data()) : 'absent'}`);
  try { const u = await auth.getUser(uid); console.log(`  auth user: EXISTS (created ${u.metadata.creationTime})`); }
  catch { console.log('  auth user: absent'); }

  const all = await db.collection('voice_usage').get();
  console.log(`\n=== voice_usage collection: ${all.size} doc(s) ===`);
  all.forEach((d) => { const x: any = d.data(); console.log(`  ${d.id.padEnd(30)} day=${x.day} seconds=${x.seconds} sessions=${x.sessions}`); });
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
