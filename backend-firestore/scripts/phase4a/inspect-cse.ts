/** Read the actual UPSC CSE tree before trusting it. Validation says "well-formed", not "correct". */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { syllabusNodesOf } from '../../src/types/exam.types';

(async () => {
  const snap = await db.collection('exam_syllabi').doc('syl_upsc_cse_2026_2026_v1').get();
  const s: any = snap.data();
  console.log('examId:', s.examId, '| status:', s.status, '| source:', (s.sourceUrl || s.source || '?').slice(0, 110));
  console.log('sha256:', (s.documentHash || s.sha256 || '?').slice(0, 24), '| fetchedAt:', s.fetchedAt || s.createdAt);
  const nodes = syllabusNodesOf(s);
  const line = (n: any, d: number, cap: number) => {
    if (d > cap) return;
    console.log('  '.repeat(d) + `${n.type}: ${String(n.name).slice(0, 88)}`);
    (n.children || n.subtopics || []).forEach((c: any) => line(c, d + 1, cap));
  };
  console.log(`\n── top level (${nodes.length} roots) ──`);
  nodes.forEach((n: any) => console.log(`  ${n.type}: ${String(n.name).slice(0, 90)}`));
  console.log('\n── first root expanded ──');
  line(nodes[0], 0, 2);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
