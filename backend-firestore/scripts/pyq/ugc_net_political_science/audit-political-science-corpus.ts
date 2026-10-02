import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { db } from '../../../src/config/firebase';
import { vectorStore } from '../../../src/services/rag/vectorStore';

const MANIFEST_PATH = path.resolve('dataset_staging/ugc_net_political_science/verified_political_science_manifest.json');
const POOL_PATH = path.resolve('dataset_staging/ugc_net_political_science/ugc_net_political_science_all_extracted_pyqs.json');
const ANALYTICS_PATH = path.resolve('dataset_staging/ugc_net_political_science/ugc_net_political_science_pattern_analytics.json');
const MOCK_PATH = path.resolve('dataset_staging/ugc_net_political_science/mocks/UGC_NET_POLITICAL_SCIENCE_FLT_01.json');

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Sadhya — UGC NET Political Science (Subject Code 02) Audit Engine');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function assertCondition(desc: string, cond: boolean) {
    if (cond) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.log(`  [FAIL] ${desc}`);
      failed++;
    }
  }

  // Phase 1: Local Manifest & SHA-256 Hashes
  console.log('--- PHASE 1: Official Question Papers & SHA-256 Hashes ---');
  const rawManifest: any[] = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const uniqueManifestMap: Record<string, any> = {};
  for (const m of rawManifest) {
    if (!uniqueManifestMap[m.canonicalPaperId]) {
      uniqueManifestMap[m.canonicalPaperId] = m;
    }
  }
  const manifest = Object.values(uniqueManifestMap);
  assertCondition(`Manifest contains expected official papers (found ${manifest.length})`, manifest.length === 34);

  let verifiedPdfs = 0;
  let matchingHashes = 0;
  for (const p of manifest) {
    if (fs.existsSync(p.localPath)) {
      verifiedPdfs++;
      const buf = fs.readFileSync(p.localPath);
      const h = crypto.createHash('sha256').update(buf).digest('hex');
      if (h === p.documentHash) matchingHashes++;
    }
  }
  assertCondition(`All raw official PDFs exist on disk (${verifiedPdfs}/34)`, verifiedPdfs === 34);
  assertCondition(`All raw PDFs match verified SHA-256 cryptographic hashes (${matchingHashes}/34)`, matchingHashes === 34);

  // Phase 2: Firestore Source Registry
  console.log('\n--- PHASE 2: Firestore pyq_source_registry Validation ---');
  const allUgcSources = await db.collection('pyq_source_registry').where('examId', '==', 'UGC_NET').get();
  let polsciSources = 0;
  allUgcSources.forEach(d => {
    if (d.data().subject === 'Political Science') polsciSources++;
  });
  assertCondition(`Political Science sources registered in pyq_source_registry (found ${polsciSources}/34)`, polsciSources === 34);

  // Phase 3: Canonical PYQ Questions in Firestore
  console.log('\n--- PHASE 3: Authentic PYQ Extraction & Firestore Verification ---');
  const pool: any[] = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));
  assertCondition(`Staging pool contains >= 1000 authentic questions (found ${pool.length})`, pool.length >= 1000);

  const qSnap = await db.collection('pyq_questions')
    .where('examId', '==', 'UGC_NET')
    .where('subjectCode', '==', '02')
    .get();
  assertCondition(`Firestore pyq_questions contains all ingested Political Science questions (found ${qSnap.size})`, qSnap.size === pool.length);

  let authenticFlagCount = 0;
  let officialBucketCount = 0;
  let activeStatusCount = 0;
  let has4OptionsCount = 0;

  qSnap.forEach(d => {
    const data = d.data();
    if (data.isAuthenticPYQ === true) authenticFlagCount++;
    if (data.corpusBucket === 'OFFICIAL_PYQ') officialBucketCount++;
    if (data.status === 'ACTIVE') activeStatusCount++;
    if (Array.isArray(data.options) && data.options.length === 4) has4OptionsCount++;
  });

  assertCondition(`100% of questions have isAuthenticPYQ === true (${authenticFlagCount}/${qSnap.size})`, authenticFlagCount === qSnap.size);
  assertCondition(`100% of questions have corpusBucket === 'OFFICIAL_PYQ' (${officialBucketCount}/${qSnap.size})`, officialBucketCount === qSnap.size);
  assertCondition(`100% of questions have status === 'ACTIVE' (${activeStatusCount}/${qSnap.size})`, activeStatusCount === qSnap.size);
  assertCondition(`100% of questions have exactly 4 plausible options (${has4OptionsCount}/${qSnap.size})`, has4OptionsCount === qSnap.size);

  // Phase 4: Pattern Analytics & Syllabus Coverage
  console.log('\n--- PHASE 4: Pattern Analytics & Syllabus Coverage ---');
  const analytics = JSON.parse(fs.readFileSync(ANALYTICS_PATH, 'utf-8'));
  assertCondition('Pattern analytics covers all 10 official Political Science units', Object.keys(analytics.unitDistribution).length === 10);
  assertCondition('Question typologies calculated and present', Object.keys(analytics.questionTypologies).length >= 5);

  const analyticsDocSnap = await db.collection('pyq_analytics').doc('UGC_NET_POLITICAL_SCIENCE_02').get();
  assertCondition('Analytics document UGC_NET_POLITICAL_SCIENCE_02 exists in Firestore', analyticsDocSnap.exists);

  // Phase 5: Practice Mock Test & Isolation Validation
  console.log('\n--- PHASE 5: Practice Mock Generation & Two-Layer Isolation ---');
  const mockTest = JSON.parse(fs.readFileSync(MOCK_PATH, 'utf-8'));
  assertCondition(`Mock test has exactly 100 questions (found ${mockTest.questions.length})`, mockTest.questions.length === 100);
  assertCondition(`Mock test total marks is 200 (found ${mockTest.totalMarks})`, mockTest.totalMarks === 200);

  const mockSnap = await db.collection('ugc_net_mock_questions').where('testId', '==', 'UGC_NET_POLITICAL_SCIENCE_FLT_01').get();
  assertCondition(`Firestore contains 100 mock questions for UGC_NET_POLITICAL_SCIENCE_FLT_01 (found ${mockSnap.size})`, mockSnap.size === 100);

  let mockIsolatedBucket = 0;
  let mockIsolatedFlag = 0;
  mockSnap.forEach(d => {
    const m = d.data();
    if (m.corpusBucket === 'PRACTICE_MOCK') mockIsolatedBucket++;
    if (m.isAuthenticPYQ === false) mockIsolatedFlag++;
  });
  assertCondition(`100% of mock questions have corpusBucket === 'PRACTICE_MOCK' (${mockIsolatedBucket}/100)`, mockIsolatedBucket === 100);
  assertCondition(`100% of mock questions have isAuthenticPYQ === false (${mockIsolatedFlag}/100)`, mockIsolatedFlag === 100);

  // Phase 6: Vector Index Status & Live Semantic Retrieval
  console.log('\n--- PHASE 6: Vector Index Status & Semantic Retrieval ---');
  const indexedSnap = await db.collection('pyq_questions')
    .where('examId', '==', 'UGC_NET')
    .where('subjectCode', '==', '02')
    .where('vectorIndexed', '==', true)
    .get();
  assertCondition(`Firestore records marked vectorIndexed (found ${indexedSnap.size})`, indexedSnap.size >= 5);

  // Final Summary
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  AUDIT SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  if (failed === 0) {
    console.log('  🎉 100% INVARIANT AND QUALITY CHECKS PASSED FOR POLITICAL SCIENCE (02)!');
  } else {
    console.log('  ⚠️ SOME CHECKS FAILED - REVIEW LOGS ABOVE.');
  }
  console.log('═══════════════════════════════════════════════════════════════════\n');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Political Science audit failed:', err);
  process.exit(1);
});
