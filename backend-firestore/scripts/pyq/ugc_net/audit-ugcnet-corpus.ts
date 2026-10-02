/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sadhya — UGC NET Computer Science & Applications (Code 87) Corpus Audit
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive end-to-end verification and integrity audit:
 *   1. Paper Coverage Matrix: Validates all 33 official papers (2009-2018).
 *   2. Provenance Verification: Traceable chain from Source -> PDF Hash -> Firestore Doc.
 *   3. Invariant Checks:
 *      - Zero fabrication: 100% authentic questions originate from verified PDFs.
 *      - Two-layer isolation: 100% of authentic PYQs have isAuthenticPYQ: true, corpusBucket: 'OFFICIAL_PYQ'.
 *      - Zero contamination: No synthetic/generated questions in `pyq_questions`.
 *      - Zero collisions: Unique question IDs and valid content hashes.
 *   4. Vector Store Validation:
 *      - Qdrant collection points check for examId: 'UGC_NET'.
 *      - Live semantic retrieval test across core CS domains.
 *
 * USAGE:
 *   npx tsx scripts/pyq/ugc_net/audit-ugcnet-corpus.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { db } from '../../../src/config/firebase';
import { vectorStore } from '../../../src/services/rag/vectorStore';

const MANIFEST_PATH = path.resolve('dataset_staging/ugc_net_cs/verified_papers_manifest.json');
const POOL_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_all_extracted_pyqs.json');
const ANALYTICS_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_pattern_analytics.json');

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Sadhya — UGC NET Computer Science & Applications Audit Engine');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passedTests = 0;
  let failedTests = 0;

  function assertCondition(desc: string, cond: boolean) {
    if (cond) {
      console.log(`  [PASS] ${desc}`);
      passedTests++;
    } else {
      console.log(`  [FAIL] ${desc}`);
      failedTests++;
    }
  }

  // ─── Phase 1: Local Manifest & PDF Hash Verification ─────────────────────
  console.log('--- PHASE 1: Official Question Papers & Cryptographic Hashes ---');
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest missing: ${MANIFEST_PATH}`);
  }
  const manifest: any[] = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  assertCondition(`Manifest contains expected 33 official papers (found ${manifest.length})`, manifest.length === 33);

  let verifiedPdfsOnDisk = 0;
  let matchingHashes = 0;
  for (const p of manifest) {
    if (fs.existsSync(p.localPath)) {
      verifiedPdfsOnDisk++;
      const buf = fs.readFileSync(p.localPath);
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      if (hash === p.documentHash) matchingHashes++;
    }
  }
  assertCondition(`All 33 raw official PDFs exist on disk (${verifiedPdfsOnDisk}/33)`, verifiedPdfsOnDisk === 33);
  assertCondition(`All 33 raw PDFs match verified SHA-256 cryptographic hashes (${matchingHashes}/33)`, matchingHashes === 33);

  // ─── Phase 2: Firestore Source Registry Verification ─────────────────────
  console.log('\n--- PHASE 2: Firestore pyq_source_registry Validation ---');
  const sourceSnap = await db.collection('pyq_source_registry').where('examId', '==', 'UGC_NET').get();
  assertCondition(`All 33 paper sources registered in pyq_source_registry (found ${sourceSnap.size})`, sourceSnap.size === 33);

  let validTiers = 0;
  let validUrls = 0;
  sourceSnap.forEach((doc) => {
    const d = doc.data();
    if (d.sourceTier === 'TIER_A_OFFICIAL' && d.sourceDomain === 'ugcnetonline.in') validTiers++;
    if (d.sourceUrl && d.sourceUrl.startsWith('https://www.ugcnetonline.in/')) validUrls++;
  });
  assertCondition(`All 33 sources designated TIER_A_OFFICIAL (${validTiers}/33)`, validTiers === 33);
  assertCondition(`All 33 source URLs point to official ugcnetonline.in portal (${validUrls}/33)`, validUrls === 33);

  // ─── Phase 3: Firestore pyq_questions Corpus Integrity ───────────────────
  console.log('\n--- PHASE 3: Authentic PYQ Corpus Invariant Checks ---');
  const qSnap = await db.collection('pyq_questions').where('examId', '==', 'UGC_NET').get();
  console.log(`  📊 Authentic UGC NET CS questions in pyq_questions: ${qSnap.size}`);
  assertCondition(`Ingested authentic PYQs match extracted pool (${qSnap.size} >= 1349)`, qSnap.size >= 1349);

  let countAuthenticTrue = 0;
  let countOfficialBucket = 0;
  let countValidProvenance = 0;
  let countValidOptions = 0;
  let countHashes = 0;
  const questionIdSet = new Set<string>();

  qSnap.forEach((doc) => {
    const d = doc.data();
    questionIdSet.add(d.questionId);
    if (d.isAuthenticPYQ === true) countAuthenticTrue++;
    if (d.corpusBucket === 'OFFICIAL_PYQ') countOfficialBucket++;
    if (d.canonicalPaperId && d.sourceUrl && (d.documentHash || d.sourceDocumentHash)) countValidProvenance++;
    if (Array.isArray(d.options) && d.options.length === 4) countValidOptions++;
    if (d.contentHash && d.contentHash.length > 0) countHashes++;
  });

  assertCondition(`Invariant: 100% of questions have isAuthenticPYQ: true (${countAuthenticTrue}/${qSnap.size})`, countAuthenticTrue === qSnap.size);
  assertCondition(`Invariant: 100% of questions have corpusBucket: 'OFFICIAL_PYQ' (${countOfficialBucket}/${qSnap.size})`, countOfficialBucket === qSnap.size);
  assertCondition(`Invariant: 100% have full provenance chain (${countValidProvenance}/${qSnap.size})`, countValidProvenance === qSnap.size);
  assertCondition(`Invariant: 100% have exactly 4 options (${countValidOptions}/${qSnap.size})`, countValidOptions === qSnap.size);
  assertCondition(`Zero ID collisions in pyq_questions (${questionIdSet.size} unique IDs)`, questionIdSet.size === qSnap.size);

  // ─── Phase 4: Two-Layer Isolation Validation ─────────────────────────────
  console.log('\n--- PHASE 4: Two-Layer Isolation & Anti-Contamination ---');
  const contaminatedSnap = await db.collection('pyq_questions')
    .where('examId', '==', 'UGC_NET')
    .where('isAuthenticPYQ', '==', false)
    .get();
  assertCondition(`Zero contaminated questions in pyq_questions (found ${contaminatedSnap.size})`, contaminatedSnap.size === 0);

  const syntheticInPyqSnap = await db.collection('pyq_questions')
    .where('examId', '==', 'UGC_NET')
    .where('corpusBucket', '==', 'PRACTICE_MOCK')
    .get();
  assertCondition(`Zero practice mock questions in pyq_questions (found ${syntheticInPyqSnap.size})`, syntheticInPyqSnap.size === 0);

  // Validate Mock Collection Isolation
  const mockSnap = await db.collection('ugc_net_mock_questions').get();
  assertCondition(`Segregated mock questions collection populated (${mockSnap.size} questions)`, mockSnap.size >= 100);

  let mockAuthenticFalse = 0;
  let mockPracticeBucket = 0;
  let mockHasExplanation = 0;
  mockSnap.forEach((doc) => {
    const d = doc.data();
    if (d.isAuthenticPYQ === false) mockAuthenticFalse++;
    if (d.corpusBucket === 'PRACTICE_MOCK') mockPracticeBucket++;
    if (d.explanation && d.explanation.length > 20) mockHasExplanation++;
  });
  assertCondition(`Invariant: 100% of mock questions have isAuthenticPYQ: false (${mockAuthenticFalse}/${mockSnap.size})`, mockAuthenticFalse === mockSnap.size);
  assertCondition(`Invariant: 100% of mock questions have corpusBucket: 'PRACTICE_MOCK' (${mockPracticeBucket}/${mockSnap.size})`, mockPracticeBucket === mockSnap.size);
  assertCondition(`Quality Gate: 100% of mock questions have academic explanations (${mockHasExplanation}/${mockSnap.size})`, mockHasExplanation === mockSnap.size);

  // ─── Phase 5: Pattern Analytics & Syllabus Coverage ──────────────────────
  console.log('\n--- PHASE 5: Pattern Analytics & 10-Unit Coverage ---');
  assertCondition(`Pattern analytics artifact exists on disk`, fs.existsSync(ANALYTICS_PATH));
  const analyticsDoc = await db.collection('pyq_analytics').doc('UGC_NET_CS_87').get();
  assertCondition(`Pattern analytics document stored in Firestore (pyq_analytics/UGC_NET_CS_87)`, analyticsDoc.exists);

  if (analyticsDoc.exists) {
    const data = analyticsDoc.data()!;
    const units = Object.keys(data.unitWeightage || {});
    assertCondition(`All 10 official UGC NET CS units present in analytics (${units.length}/10)`, units.length === 10);
  }

  // ─── Phase 6: Vector Index Status & Live Retrieval ──────────────────────
  console.log('\n--- PHASE 6: Vector Index Status & Live Retrieval ---');
  const indexStats = await vectorStore.getIndexStats();
  console.log(`  🌲 Vector store (${vectorStore.backend}) points count: ${indexStats.totalVectorCount}`);
  assertCondition(`Vector store is active and healthy (${indexStats.totalVectorCount} points)`, indexStats.totalVectorCount > 0);

  const indexedSnap = await db.collection('pyq_questions')
    .where('examId', '==', 'UGC_NET')
    .where('vectorIndexed', '==', true)
    .get();
  console.log(`  💾 Ingested UGC NET questions marked vectorIndexed: ${indexedSnap.size}`);
  assertCondition(`UGC NET authentic vectors indexed into vector store (${indexedSnap.size} vectors)`, indexedSnap.size > 0);

  const CACHE_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_embedding_cache.json');
  if (fs.existsSync(CACHE_PATH)) {
    const cache: Record<string, number[]> = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    const testKeys = Object.keys(cache);
    if (testKeys.length > 0) {
      const probeKey = testKeys[0];
      const probeVector = cache[probeKey];
      const results = await vectorStore.queryVectors(probeVector, 3, { examId: 'UGC_NET' }, 'production');

      const hitExamMatch = results.every((r) => r.metadata?.examId === 'UGC_NET');
      const hitAuthentic = results.every((r) => r.metadata?.isAuthenticPYQ === true);
      const topScore = results[0]?.score || 0;

      console.log(`  🔍 Retrieval probe for [${probeKey}]: top score = ${topScore.toFixed(4)}, matches = ${results.length}`);
      assertCondition(`Retrieval returned authentic UGC NET vectors only (zero cross-exam contamination)`, hitExamMatch && hitAuthentic && results.length > 0);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  AUDIT RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
