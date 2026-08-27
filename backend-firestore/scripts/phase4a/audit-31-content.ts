/**
 * Is this tree real syllabus text, or a well-formed tree full of PDF sludge?
 *
 * Validation checks shape, not sense. BPSC DSP Wireless validates perfectly and contains
 * "PAPEBJ" and "Electronics icationsE nee" — its source PDF has a broken text layer. Indexing
 * that costs real embedding spend and then answers students with nonsense, so every tree gets
 * read before it is paid for.
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { syllabusNodesOf, walkSyllabusNodes } from '../../src/types/exam.types';

const EXAMS = process.argv.slice(2);

/** Words a real syllabus does not contain: fused caps, orphan fragments, vowel-less runs. */
function damageScore(names: string[]) {
  let bad = 0;
  const samples: string[] = [];
  for (const n of names) {
    const fused = /[a-z]{2}[A-Z][a-z]{2}/.test(n) && !/[-–—:,()]/.test(n);
    const vowelless = /\b[bcdfghjklmnpqrstvwxz]{5,}\b/i.test(n);
    const shard = n.trim().length > 0 && n.trim().length < 3;
    if (fused || vowelless || shard) { bad++; if (samples.length < 4) samples.push(n.slice(0, 70)); }
  }
  return { bad, pct: names.length ? (bad / names.length) * 100 : 0, samples };
}

(async () => {
  const all = await db.collection('exam_syllabi').get();
  for (const examId of EXAMS) {
    const docs = all.docs.map((d) => d.data() as any)
      .filter((s) => s.examId === examId && (s.status === 'INVALID' || s.status === 'VERIFIED'));
    if (!docs.length) { console.log(`── ${examId}: no record\n`); continue; }
    const s = docs.sort((a, b) => String(b.version).localeCompare(String(a.version)))[0];
    const nodes = syllabusNodesOf(s);
    const topicNames: string[] = [];
    walkSyllabusNodes(nodes, (n: any) => { if (n.type === 'TOPIC') topicNames.push(String(n.name || '')); });

    const d = damageScore(topicNames);
    const avgLen = Math.round(topicNames.reduce((a, b) => a + b.length, 0) / Math.max(1, topicNames.length));
    console.log(`── ${examId}  (${s.syllabusId})`);
    console.log(`   topics=${topicNames.length} avgNameLen=${avgLen} suspect=${d.bad} (${d.pct.toFixed(1)}%)`);
    console.log(`   sample topics:`);
    for (const t of topicNames.slice(0, 4)) console.log(`     · ${t.slice(0, 88)}`);
    if (d.samples.length) { console.log(`   suspect samples:`); d.samples.forEach((x) => console.log(`     ! ${x}`)); }
    console.log();
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
