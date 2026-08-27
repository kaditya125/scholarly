import 'dotenv/config';
import { db } from '../../src/config/firebase';
(async () => {
  const n = await db.collection('exam_syllabi_graphs').doc('JEE_MAIN')
    .collection('versions').doc('syl_jee_main_2026_2026_v1').collection('nodes').limit(2).get();
  n.forEach(d => { const x: any = d.data(); console.log(`docId : ${d.id.slice(0,70)}`); console.log(`id fld: ${String(x.id).slice(0,70)}\n`); });
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
