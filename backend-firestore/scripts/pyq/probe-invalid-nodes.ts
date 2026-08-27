import 'dotenv/config';
import { db } from '../../src/config/firebase';
(async () => {
  const snap = await db.collection('pyq_questions').get();
  const withNode: any[] = [];
  snap.forEach((d) => { const x: any = d.data(); if (x.syllabusNodeId) withNode.push({ id: d.id, exam: x.examId, node: x.syllabusNodeId, topic: x.topic, subject: x.subject }); });
  console.log(`PYQs carrying a syllabusNodeId: ${withNode.length}\n`);
  withNode.slice(0, 8).forEach(r => console.log(`  exam=${String(r.exam).padEnd(13)} node="${r.node}"\n     subject=${r.subject} topic=${r.topic}`));
  // Shape check: a real canonical id is type:EXAM:cycle:syllabusId:slug:fingerprint
  const shaped = withNode.filter(r => /^[a-z]+:[A-Z_]+:\d{4}:syl_/.test(String(r.node))).length;
  console.log(`\nids matching the canonical shape (type:EXAM:cycle:syl_…): ${shaped}/${withNode.length}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
