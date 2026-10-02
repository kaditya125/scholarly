import { db } from '../../../src/config/firebase';

async function main() {
  const subjects = [
    { name: 'General Paper I', code: '00' },
    { name: 'Economics', code: '01' },
    { name: 'Political Science', code: '02' },
    { name: 'Philosophy', code: '03' },
    { name: 'Psychology', code: '04' },
    { name: 'Sociology', code: '05' },
    { name: 'History', code: '06' },
    { name: 'Commerce', code: '08' },
    { name: 'Education', code: '09' },
    { name: 'Home Science', code: '12' },
    { name: 'Public Administration', code: '14' },
    { name: 'Population Studies', code: '15' },
    { name: 'Management', code: '17' },
    { name: 'Hindi', code: '20' },
    { name: 'Sanskrit', code: '25' },
    { name: 'Social Work', code: '10' },
    { name: 'Defence and Strategic Studies', code: '11' },
    { name: 'English', code: '30' },
    { name: 'Law', code: '58' },
    { name: 'Geography', code: '80' },
    { name: 'Computer Science', code: '87' },
    { name: 'Electronic Science', code: '88' },
    { name: 'Environmental Sciences', code: '89' },
    { name: 'International and Area Studies', code: '90' },
    { name: 'Prakrit', code: '91' },
    { name: 'Human Rights and Duties', code: '92' },
    { name: 'Tourism Administration and Management', code: '93' }
  ];

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       SADHYA UGC NET MULTI-SUBJECT CORPUS SUMMARY            ');
  console.log('═══════════════════════════════════════════════════════════════');

  let grandTotal = 0;
  for (const s of subjects) {
    const snap = await db.collection('pyq_questions')
      .where('examId', '==', 'UGC_NET')
      .where('subjectCode', '==', s.code)
      .count()
      .get();
    const count = snap.data().count;
    grandTotal += count;
    console.log(`  • Subject Code ${s.code.padEnd(2)} | ${s.name.padEnd(25)} : ${count.toLocaleString()} questions`);
  }

  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  Total Live Canonical PYQs in pyq_questions : ${grandTotal.toLocaleString()}`);

  const sourceSnap = await db.collection('pyq_source_registry')
    .where('examId', '==', 'UGC_NET')
    .count()
    .get();
  console.log(`  Total Registered Official Exam Papers     : ${sourceSnap.data().count.toLocaleString()}`);

  const mockSnap = await db.collection('ugc_net_mock_questions').count().get();
  console.log(`  Total Isolated Practice Mock Questions    : ${mockSnap.data().count.toLocaleString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
