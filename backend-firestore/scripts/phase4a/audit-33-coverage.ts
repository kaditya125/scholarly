/**
 * Every exam the platform knows about, and whether it has a syllabus behind it.
 *
 * The gap that matters is an exam a student can SELECT but which retrieval cannot answer for —
 * that is the case where Sadhya looks like it supports something and then has nothing to say.
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';

const BANKING = /ibps|sbi|rbi|nabard|bank|clerk|po\b|sidbi|lic|niacl/i;
const RAILWAY = /rrb|railway|ntpc|alp|rpf|group\s*d|technician/i;

(async () => {
  const exams = await db.collection('exams').get();
  const syl = await db.collection('exam_syllabi').get();

  const sylByExam = new Map<string, string[]>();
  syl.forEach((d) => {
    const x: any = d.data();
    const list = sylByExam.get(x.examId) || [];
    list.push(x.status);
    sylByExam.set(x.examId, list);
  });

  const rows: Array<{ id: string; name: string; statuses: string[] }> = [];
  exams.forEach((d) => {
    const x: any = d.data();
    const id = x.examId || d.id;
    rows.push({ id, name: String(x.name || x.fullName || ''), statuses: sylByExam.get(id) || [] });
  });
  rows.sort((a, b) => a.id.localeCompare(b.id));

  const mark = (s: string[]) => !s.length ? 'NO SYLLABUS'
    : s.includes('CURRENT') ? 'LIVE'
    : s.includes('VERIFIED') ? 'verified (indexing/pending)'
    : s.join(',').toLowerCase();

  console.log(`exams registered: ${rows.length}   syllabus records: ${syl.size}\n`);
  console.log('=== ALL REGISTERED EXAMS ===');
  for (const r of rows) console.log(`  ${r.id.padEnd(18)} ${mark(r.statuses).padEnd(28)} ${r.name.slice(0, 46)}`);

  const banking = rows.filter((r) => BANKING.test(r.id) || BANKING.test(r.name));
  const railway = rows.filter((r) => RAILWAY.test(r.id) || RAILWAY.test(r.name));
  console.log(`\n=== BANKING ===  ${banking.length ? '' : 'none registered'}`);
  banking.forEach((r) => console.log(`  ${r.id.padEnd(18)} ${mark(r.statuses)}`));
  console.log(`\n=== RAILWAYS ===  ${railway.length ? '' : 'none registered'}`);
  railway.forEach((r) => console.log(`  ${r.id.padEnd(18)} ${mark(r.statuses)}`));
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
