/** Select the Stage 8 pilot cohort. READ ONLY, zero embeddings. */
import 'dotenv/config';
import { db } from '../../src/config/firebase';

(async () => {
  const snap = await db.collection('pyq_questions').where('examId', '==', 'JEE_MAIN').get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  console.log(`JEE_MAIN questions: ${rows.length}\n`);

  // What paper identity do they actually claim?
  const byPaper = new Map<string, any[]>();
  rows.forEach((r) => {
    const key = [r.year, r.session, r.examDate ?? '-', r.shift].join(' | ');
    byPaper.set(key, [...(byPaper.get(key) ?? []), r]);
  });
  console.log('claimed paper identities (top 8):');
  [...byPaper.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8)
    .forEach(([k, v]) => console.log(`  ${String(k).padEnd(46)} ${v.length}`));

  console.log('\nidentity fields present on a sample record:');
  const s = rows[0] ?? {};
  ['year', 'session', 'examDate', 'shift', 'paper', 'subject', 'questionNumber', 'sourceUrl', 'correctAnswer', 'correctAnswerSource', 'contentHash']
    .forEach((f) => console.log(`  ${f.padEnd(22)} ${JSON.stringify((s as any)[f])}`));

  // Pilot: 2024 Session 1 Shift 1 if it exists, else the largest 2024 cluster.
  const pilotKey = [...byPaper.keys()].find((k) => /2024/.test(k) && /Shift 1/.test(k) && /Session 1/.test(k))
    ?? [...byPaper.entries()].filter(([k]) => /2024/.test(k)).sort((a, b) => b[1].length - a[1].length)[0]?.[0];
  const pilot = (byPaper.get(pilotKey!) ?? []).slice(0, 15);
  console.log(`\nPILOT COHORT: "${pilotKey}"  -> ${pilot.length} questions`);
  pilot.forEach((p, i) => console.log(`  ${i + 1}. ${p.id.slice(0, 52)}  q${p.questionNumber ?? '?'}  ${p.subject ?? '?'}`));
  console.log('\ndistinct source URLs in cohort:');
  [...new Set(pilot.map((p) => p.sourceUrl))].forEach((u) => console.log(`  ${u}`));
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
