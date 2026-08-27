import 'dotenv/config';
import { db } from '../../src/config/firebase';
(async () => {
  // Manifests live in a SUBcollection, so listing the parent returns nothing meaningful.
  const ref = db.collection('exam_syllabi_graphs').doc('UPSC_CSE').collection('versions');
  const versions = await ref.get();
  console.log(`UPSC_CSE graph versions: ${versions.size}`);
  versions.forEach(d => { const x: any = d.data(); console.log(`  ${d.id} validated=${x.validated} nodes=${x.nodeCount} edges=${x.edgeCount}`); });

  const sub = await db.collection('exam_syllabi_graphs').doc('UPSC_CSE')
    .collection('versions').doc('syl_upsc_cse_2026_2026_v1').listCollections();
  console.log(`  subcollections: ${sub.map(c=>c.id).join(', ') || 'none'}`);
  for (const c of sub) {
    const n = await c.limit(3).get();
    console.log(`   ${c.id}: sample ${n.size}`);
    n.forEach(d => { const x: any = d.data(); console.log(`     ${JSON.stringify(x).slice(0,150)}`); });
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
