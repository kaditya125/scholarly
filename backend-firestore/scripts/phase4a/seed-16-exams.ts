/**
 * Seeds the exam REGISTRY only — no syllabi.
 *
 * seedPilotExams stopped creating syllabus documents after the pilot seed shipped a fabricated
 * CURRENT syllabus with the SHA-256 of an empty string as its provenance. Registry rows are safe:
 * they record that an exam exists, who conducts it, and which domains count as official — which is
 * exactly what officialSourceVerification needs before any document can be fetched for it.
 */
import 'dotenv/config';
import { seedPilotExams } from '../../src/seed/examSeeds';
import { db } from '../../src/config/firebase';

(async () => {
  const before = (await db.collection('exams').get()).size;
  const result = await seedPilotExams();
  const after = await db.collection('exams').get();

  console.log(`exams before: ${before}  ->  after: ${after.size}`);
  console.log(`seeded: ${result.seededExams} exams, ${result.seededSyllabi} syllabi (syllabi must be 0)\n`);
  for (const d of after.docs) {
    const x: any = d.data();
    console.log(`  ${d.id.padEnd(10)} ${String(x.shortName || '').padEnd(12)} cycle=${String(x.currentCycle || '-').padEnd(6)} domains=${(x.officialDomains || []).join(', ')}`);
  }
  const syllabi = await db.collection('exam_syllabi').get();
  console.log(`\nexam_syllabi untouched: ${syllabi.size} docs`);
  syllabi.docs.forEach(d => console.log(`  ${d.id}  status=${(d.data() as any).status}`));
  process.exit(result.seededSyllabi === 0 ? 0 : 2);
})().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
