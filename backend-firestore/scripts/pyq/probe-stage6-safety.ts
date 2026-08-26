/** Stage 6 production-safety verification (§24). READ ONLY. */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
(async () => {
  const graphs = await db.collection('exam_syllabi_graphs').listDocuments();
  let versions = 0, nodes = 0;
  for (const g of graphs) {
    const vs = await g.collection('versions').get();
    versions += vs.size;
    for (const v of vs.docs) nodes += (v.data() as any).nodeCount ?? 0;
  }
  const mastery = await db.collectionGroup('mastery').get();
  const pyq = await db.collection('pyq_questions').get();
  const syl = await db.collection('exam_syllabi').get();
  console.log('=== post-Stage-6 state (nothing should have changed) ===');
  console.log(`  exams with graph      : ${graphs.length}`);
  console.log(`  syllabus versions     : ${versions}`);
  console.log(`  graph nodes           : ${nodes}`);
  console.log(`  syllabus records      : ${syl.size}`);
  console.log(`  mastery records       : ${mastery.size}`);
  console.log(`  pyq_questions         : ${pyq.size}  (untouched by Stage 6)`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
