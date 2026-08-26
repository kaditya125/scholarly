import 'dotenv/config';
import { db } from '../../src/config/firebase';
(async () => {
  const mastery = await db.collectionGroup('mastery').get();
  const anchored = mastery.docs.filter((d) => (d.data() as any).syllabusNodeId).length;
  console.log(`mastery records: ${mastery.size} (node-anchored: ${anchored}, label-keyed: ${mastery.size - anchored})`);

  const attempts = await db.collectionGroup('quiz_attempts').limit(50).get().catch(() => null);
  if (attempts && !attempts.empty) {
    let withNode = 0, total = 0, breakdownWithNode = 0, breakdownRows = 0;
    attempts.forEach((d) => {
      const x: any = d.data();
      (x.questions || []).forEach((q: any) => { total++; if (q.syllabusNodeId) withNode++; });
      (x.topicBreakdown || []).forEach((r: any) => { breakdownRows++; if (r.syllabusNodeId) breakdownWithNode++; });
    });
    console.log(`quiz_attempts sampled: ${attempts.size}`);
    console.log(`  questions carrying syllabusNodeId : ${withNode}/${total}`);
    console.log(`  breakdown rows carrying it        : ${breakdownWithNode}/${breakdownRows}  <-- the break`);
  } else {
    console.log('quiz_attempts: none found at collectionGroup level');
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
