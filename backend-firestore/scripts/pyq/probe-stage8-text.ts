import 'dotenv/config';
import { db } from '../../src/config/firebase';
(async () => {
  const ids = [
    'pyq:jee_main:2024:session_1:29_jan_shift_1:q1:47007c',
    'pyq:jee_main:2024:session_1:29_jan_shift_1:q9:0bbe01',
    'pyq:jee_main:2024:session_1:29_jan_shift_1:q52:a3730',
  ];
  const snap = await db.collection('pyq_questions').where('examId', '==', 'JEE_MAIN').get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  for (const partial of ids) {
    const r = rows.find((x) => x.id.startsWith(partial.slice(0, 50)));
    if (!r) { console.log(`${partial}  NOT FOUND`); continue; }
    console.log(`\n--- ${r.id.slice(0, 56)}`);
    console.log(`    subject=${r.subject} q=${r.questionNumber} answer=${r.correctAnswer}`);
    console.log(`    text: ${String(r.questionText).slice(0, 210)}`);
    console.log(`    options: ${JSON.stringify(r.options ?? r.choices ?? null).slice(0, 160)}`);
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
