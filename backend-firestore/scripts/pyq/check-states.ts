import * as admin from 'firebase-admin';
import * as path from 'path';

const svcPath = path.resolve(process.cwd(), 'service-account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(svcPath) });
const db = admin.firestore();

async function main() {
  const exams = ['UPSC_CSE', 'SSC_CGL', 'BPSC_CCE', 'SSC_CHSL'];
  for (const exam of exams) {
    const snap = await db.collection('canonical_questions')
      .where('examType', '==', exam).where('vectorIndexed', '!=', true).get();
    const counts: Record<string, number> = {};
    for (const doc of snap.docs) {
      const s = doc.data().ingestionState || 'MISSING';
      counts[s] = (counts[s] || 0) + 1;
    }
    console.log([]  unindexed:);
    for (const [s, c] of Object.entries(counts).sort((a,b) => b[1]-a[1])) console.log(  : );
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
