import { db } from '../../../src/config/firebase';

interface ExamStats {
  total: number;
  byYear: Record<string, number>;
  byBucket: Record<string, number>;
  byVerification: Record<string, number>;
  vectorIndexedCount: number;
  hasValidAnswer: number;
  hasValidText: number;
  uniquePapers: Set<string>;
}

async function getCount(collectionName: string): Promise<number> {
  try {
    const snap = await db.collection(collectionName).count().get();
    return snap.data().count;
  } catch (e) {
    return -1;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('📊 SADHYA DATABASE CORPUS AUDIT');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // 1. Overall Collections Count
  console.log('--- 1. OVERALL CONTENT & QUESTION COLLECTIONS ---');
  const collectionsToCheck = [
    'pyq_questions',
    'pyq_source_registry',
    'pyq_provenance_verifications',
    'questions',
    'practice_bank',
    'ugc_net_mock_questions',
    'upsc_mock_questions',
    'bpsc_mock_questions',
    'reference_chunks',
    'reference_sources',
    'exams',
    'exam_syllabi',
    'exam_syllabi_graphs',
  ];

  for (const col of collectionsToCheck) {
    const count = await getCount(col);
    console.log(`  • ${col.padEnd(30)} : ${count >= 0 ? count.toLocaleString() : 'N/A'}`);
  }

  // 2. In-Depth PYQ_QUESTIONS Audit
  console.log('\n--- 2. IN-DEPTH ANALYSIS: pyq_questions ---');
  console.log('Streaming all documents from pyq_questions with projection...');

  const examMap: Record<string, ExamStats> = {};
  let totalProcessed = 0;
  let lastDoc: any = null;

  while (true) {
    let q: FirebaseFirestore.Query = db.collection('pyq_questions')
      .select('examId', 'year', 'corpusBucket', 'verificationStatus', 'correctAnswer', 'questionText', 'vectorIndexed', 'canonicalPaperId')
      .orderBy('__name__')
      .limit(2500);

    if (lastDoc) {
      q = q.startAfter(lastDoc);
    }

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data();
      const examId = (data.examId || 'UNKNOWN').trim().toUpperCase();
      const year = String(data.year || 'UNKNOWN');
      const bucket = data.corpusBucket || 'UNKNOWN';
      const ver = data.verificationStatus || 'UNKNOWN';
      const isIndexed = !!data.vectorIndexed;
      const validAns = data.correctAnswer && data.correctAnswer !== 'UNKNOWN' && String(data.correctAnswer).trim() !== '';
      const validText = data.questionText && String(data.questionText).trim().length > 5;
      const paperId = data.canonicalPaperId || '';

      if (!examMap[examId]) {
        examMap[examId] = {
          total: 0,
          byYear: {},
          byBucket: {},
          byVerification: {},
          vectorIndexedCount: 0,
          hasValidAnswer: 0,
          hasValidText: 0,
          uniquePapers: new Set<string>(),
        };
      }

      const st = examMap[examId];
      st.total++;
      st.byYear[year] = (st.byYear[year] || 0) + 1;
      st.byBucket[bucket] = (st.byBucket[bucket] || 0) + 1;
      st.byVerification[ver] = (st.byVerification[ver] || 0) + 1;
      if (isIndexed) st.vectorIndexedCount++;
      if (validAns) st.hasValidAnswer++;
      if (validText) st.hasValidText++;
      if (paperId) st.uniquePapers.add(paperId);

      totalProcessed++;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\rProcessed ${totalProcessed.toLocaleString()} questions...`);
    if (snap.size < 2500) break;
  }

  console.log(`\rTotal pyq_questions audited: ${totalProcessed.toLocaleString()}\n`);

  // Print Exam Breakdown
  const sortedExams = Object.entries(examMap).sort((a, b) => b[1].total - a[1].total);
  for (const [examId, stats] of sortedExams) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📘 Exam: ${examId} | Total Questions: ${stats.total.toLocaleString()}`);
    console.log(`   Unique Canonical Papers : ${stats.uniquePapers.size}`);
    console.log(`   Vector Indexed (Qdrant) : ${stats.vectorIndexedCount.toLocaleString()} (${((stats.vectorIndexedCount / stats.total) * 100).toFixed(1)}%)`);
    console.log(`   Confirmed Answer Keys   : ${stats.hasValidAnswer.toLocaleString()} (${((stats.hasValidAnswer / stats.total) * 100).toFixed(1)}%)`);
    console.log(`   Valid Prompt Content    : ${stats.hasValidText.toLocaleString()} (${((stats.hasValidText / stats.total) * 100).toFixed(1)}%)`);

    console.log('   Breakdown by Year:');
    const sortedYears = Object.entries(stats.byYear).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [yr, cnt] of sortedYears) {
      console.log(`     * ${yr}: ${cnt.toLocaleString()} questions`);
    }

    console.log('   Breakdown by Corpus Bucket:');
    for (const [bkt, cnt] of Object.entries(stats.byBucket)) {
      console.log(`     * ${bkt}: ${cnt.toLocaleString()}`);
    }

    console.log('   Breakdown by Verification:');
    for (const [ver, cnt] of Object.entries(stats.byVerification)) {
      console.log(`     * ${ver}: ${cnt.toLocaleString()}`);
    }
    console.log('');
  }

  // 3. In-Depth PYQ_SOURCE_REGISTRY Audit
  console.log('--- 3. IN-DEPTH ANALYSIS: pyq_source_registry ---');
  const srcSnap = await db.collection('pyq_source_registry').get();
  console.log(`Total Official Source Records: ${srcSnap.size}`);
  const srcByExam: Record<string, { total: number; byYear: Record<string, number> }> = {};

  for (const doc of srcSnap.docs) {
    const d = doc.data();
    const examId = (d.examId || 'UNKNOWN').trim().toUpperCase();
    const yr = String(d.year || 'UNKNOWN');

    if (!srcByExam[examId]) {
      srcByExam[examId] = { total: 0, byYear: {} };
    }
    srcByExam[examId].total++;
    srcByExam[examId].byYear[yr] = (srcByExam[examId].byYear[yr] || 0) + 1;
  }

  for (const [examId, s] of Object.entries(srcByExam)) {
    console.log(`  • ${examId}: ${s.total} registered shift papers`);
    const yrs = Object.entries(s.byYear).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [yr, c] of yrs) {
      console.log(`      - ${yr}: ${c} papers`);
    }
  }

  // 4. Sample check on questions collection if non-empty
  const questionsCount = await getCount('questions');
  if (questionsCount > 0) {
    console.log(`\n--- 4. 'questions' LEGACY / GENERAL COLLECTION (${questionsCount.toLocaleString()} docs) ---`);
    const qSampleSnap = await db.collection('questions').limit(10).get();
    const sampleExams = new Set<string>();
    for (const d of qSampleSnap.docs) {
      const data = d.data();
      if (data.examId || data.exam) sampleExams.add(data.examId || data.exam);
    }
    console.log('  Sample Exam IDs in questions collection:', Array.from(sampleExams));
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('✅ AUDIT COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
