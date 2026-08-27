import 'dotenv/config';
import { db } from '../../src/config/firebase';
(async () => {
  const exams = await db.collection('exam_syllabi_graphs').listDocuments();
  console.log('exams with a persisted graph:', exams.map(e=>e.id).join(', '), '\n');
  for (const e of exams) {
    if (!['JEE_MAIN','UPSC_CSE','SSC_CGL'].includes(e.id)) continue;
    const vs = await e.collection('versions').listDocuments();
    console.log(`${e.id}: versions = ${vs.map(v=>v.id).join(', ')}`);
    for (const v of vs) {
      const n = await v.collection('nodes').limit(2).get();
      n.forEach(d => console.log(`   real node id: ${d.id.slice(0,90)}`));
    }
  }
  const sy = await db.collection('exam_syllabi').where('examId','==','JEE_MAIN').get();
  console.log('\nJEE_MAIN syllabus records:');
  sy.forEach(d => { const x: any = d.data(); console.log(`   ${d.id}  status=${x.status}`); });
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
