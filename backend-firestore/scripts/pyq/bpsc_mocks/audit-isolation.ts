import { db } from '../../../src/config/firebase';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🔍 AUDIT & ISOLATION VERIFICATION: BPSC MOCKS VS AUTHENTIC PYQ CORPUS');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const pyqSnap = await db.collection('pyq_questions').where('examId', '==', 'BPSC_CCE').get();
  console.log('1. Authentic PYQ Collection (`pyq_questions`):', pyqSnap.size, 'documents');

  const mockSnap = await db.collection('bpsc_mock_questions').get();
  console.log('2. Mock Practice Collection (`bpsc_mock_questions`):', mockSnap.size, 'documents\n');

  // Check for ANY ID overlap
  const pyqIds = new Set(pyqSnap.docs.map((d) => d.id));
  const mockIds = new Set(mockSnap.docs.map((d) => d.id));
  let overlapCount = 0;
  for (const id of mockIds) {
    if (pyqIds.has(id)) overlapCount++;
  }
  console.log('3. Cross-Collection Document ID Collisions:', overlapCount, '(Must be 0)');

  // Verify mock attributes
  let invalidOptionCount = 0;
  let nonMockBucketCount = 0;
  let authenticFlagContamination = 0;
  const subjects: Record<string, number> = {};

  mockSnap.forEach((doc) => {
    const data = doc.data();
    if (!data.options || data.options.length !== 4) invalidOptionCount++;
    if (data.corpusBucket !== 'PRACTICE_MOCK') nonMockBucketCount++;
    if (data.isAuthenticPYQ !== false) authenticFlagContamination++;
    subjects[data.subject] = (subjects[data.subject] || 0) + 1;
  });

  console.log(
    '4. Mock Option Format Validity (All 4 options):',
    invalidOptionCount === 0 ? '✅ 100% Valid' : `❌ ${invalidOptionCount} Invalid`
  );
  console.log(
    '5. Corpus Bucket Segregation (`PRACTICE_MOCK`):',
    nonMockBucketCount === 0 ? '✅ 100% Segregated' : `❌ ${nonMockBucketCount} Violations`
  );
  console.log(
    '6. isAuthenticPYQ Flag Protection (All false):',
    authenticFlagContamination === 0 ? '✅ 100% Protected' : `❌ ${authenticFlagContamination} Violations`
  );

  console.log('\n7. Subject Distribution in `bpsc_mock_questions`:');
  console.table(subjects);

  const papers: Record<string, number> = {};
  const missingPapers: any[] = [];
  mockSnap.forEach((d) => {
    const data = d.data();
    const p = data.mockPaperId || 'UNKNOWN';
    if (!data.mockPaperId) {
      missingPapers.push(d.ref);
    }
    papers[p] = (papers[p] || 0) + 1;
  });
  console.log('\n8. Test Paper / Module Distribution:');
  console.table(papers);

  if (missingPapers.length > 0) {
    console.log(`\nFixing ${missingPapers.length} documents missing mockPaperId -> setting to BPSC_FLT_01...`);
    const b = db.batch();
    for (const ref of missingPapers) {
      b.update(ref, { mockPaperId: 'BPSC_FLT_01', testType: 'FULL_LENGTH', testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 01)' });
    }
    await b.commit();
    console.log('✅ Backfilled mockPaperId to BPSC_FLT_01 successfully!');
  }

  if (mockSnap.size > 0) {
    const sample = mockSnap.docs[0].data();
    console.log('\n--- Sample BPSC Mock Question Document ---');
    console.log('ID:', mockSnap.docs[0].id);
    console.log('Subject:', sample.subject, '| Subtopic:', sample.subtopic);
    console.log('Bihar Special:', sample.isBiharSpecial);
    console.log('Question:', sample.questionText);
    console.log('Options (4):', sample.options);
    console.log('Answer:', sample.correctAnswer);
    console.log('Explanation:', sample.explanation);
    console.log('Difficulty:', sample.difficulty);
    console.log('isAuthenticPYQ:', sample.isAuthenticPYQ);
    console.log('sourceType:', sample.sourceType);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
