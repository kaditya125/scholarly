/**
 * Ingest verified UPSC Prelims candidate records into Sadhya.
 *
 * Enforces the integrity pipeline:
 * 1. Reads candidate records and official fetch receipt.
 * 2. Strips review metadata (_review) before touching database models.
 * 3. Asserts provenance invariants (TIER_A_OFFICIAL must trace to verified paper SHA-256,
 *    and OFFICIAL_CONFIRMED must have a non-empty answer).
 * 4. Writes all 100 questions (93 verified + 7 quarantined) to Firestore pyq_questions
 *    via pyqRepository.saveCanonicalQuestionsBatch().
 * 5. Embeds and indexes the 93 confirmed questions into Pinecone via
 *    pyqVectorIngestionService.indexQuestions().
 * 6. Complies with the embedding guard (aborts if .indexer.lock is held; no bypass).
 *
 * USAGE:
 *   npx tsx scripts/pyq/official/ingest-verified-candidates.ts            # dry-run by default
 *   npx tsx scripts/pyq/official/ingest-verified-candidates.ts --dry-run  # explicit dry-run
 *   npx tsx scripts/pyq/official/ingest-verified-candidates.ts --execute  # live ingestion
 */

import * as fs from 'fs';
import * as path from 'path';
import { pyqRepository } from '../../../src/repositories/pyq.repository';
import { pyqVectorIngestionService } from '../../../src/services/pyq/pyqVectorIngestion.service';
import { CanonicalPYQQuestion } from '../../../src/types/pyq.types';
import { readLock } from '../../phase4a/_embedding-guard';

interface Receipt {
  paperKey: string;
  examId: string;
  year: number;
  paper: string;
  series: string;
  paperUrl: string;
  paperSha256: string | null;
  paperBytes?: number;
  answerKeyUrl?: string | null;
  answerKeySha256?: string | null;
  answerKeyBytes?: number;
  answerKeyHashMatchesTranscription?: boolean;
  downloadedAt?: string;
}

interface CandidateWithReview extends CanonicalPYQQuestion {
  _review?: {
    defects?: string[];
    dropped?: boolean;
    printedNumber?: number;
    paperAligned?: boolean;
    needsHumanReview?: boolean;
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute') || args.includes('--no-dry-run');
  const isDryRun = !isExecute || args.includes('--dry-run');

  const yearArg = args.find((a) => /^\d{4}$/.test(a)) || '2024';
  const paperKey = `UPSC-CSE-PRELIMS-GS1-${yearArg}`;

  const baseDir = path.join(__dirname, 'out', paperKey);
  const candidatesPath = path.join(baseDir, 'candidates.json');
  const receiptPath = path.join(baseDir, 'receipt.json');

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`📥 SADHYA OFFICIAL PYQ INGESTION: ${paperKey}`);
  console.log(`Mode: ${isDryRun ? '🔍 DRY-RUN (Read-Only Simulation)' : '🚨 LIVE EXECUTION (Firestore + Pinecone)'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // 1. Read and verify receipt
  if (!fs.existsSync(receiptPath)) {
    console.error(`❌ Receipt file not found: ${receiptPath}`);
    console.error(`Run: npx tsx scripts/pyq/official/fetch-verify-upsc-prelims.ts ${yearArg} first.`);
    process.exit(1);
  }

  const receipt: Receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  console.log(`📄 Receipt verified:`);
  console.log(`   Paper URL:    ${receipt.paperUrl}`);
  console.log(`   Paper SHA256: ${receipt.paperSha256 ?? 'MISSING'}`);
  console.log(`   Key SHA256:   ${receipt.answerKeySha256 ?? 'MISSING'}`);
  console.log(`   Key Match:    ${receipt.answerKeyHashMatchesTranscription ? 'YES' : 'NO'}\n`);

  if (!receipt.paperSha256) {
    console.error(`❌ Contradiction: receipt.paperSha256 is null/empty. Cannot ingest unverified paper.`);
    process.exit(1);
  }

  // 2. Read candidates
  if (!fs.existsSync(candidatesPath)) {
    console.error(`❌ Candidates file not found: ${candidatesPath}`);
    process.exit(1);
  }

  const rawCandidates: CandidateWithReview[] = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
  console.log(`📋 Read ${rawCandidates.length} candidate records from ${candidatesPath}`);

  if (rawCandidates.length === 0) {
    console.error(`❌ Zero candidates found in ${candidatesPath}. Aborting.`);
    process.exit(1);
  }

  // 3. Invariant checks & strip _review
  const cleanQuestions: CanonicalPYQQuestion[] = [];
  const gateViolations: string[] = [];

  for (let i = 0; i < rawCandidates.length; i++) {
    const raw = rawCandidates[i];

    // Check invariant: TIER_A_OFFICIAL must trace to a non-null paperSha256
    if (raw.sourceType === 'TIER_A_OFFICIAL' && !receipt.paperSha256) {
      gateViolations.push(
        `Q${raw.questionNumber} (${raw.questionId}): marked TIER_A_OFFICIAL but receipt.paperSha256 is null`
      );
    }

    // Check invariant: OFFICIAL_CONFIRMED must have a non-empty correctAnswer
    if (raw.verificationStatus === 'OFFICIAL_CONFIRMED') {
      if (!raw.correctAnswer || raw.correctAnswer.trim() === '') {
        gateViolations.push(
          `Q${raw.questionNumber} (${raw.questionId}): marked OFFICIAL_CONFIRMED but correctAnswer is empty`
        );
      }
    }

    // Strip _review
    const { _review, ...clean } = raw;
    cleanQuestions.push(clean as CanonicalPYQQuestion);
  }

  if (gateViolations.length > 0) {
    console.error(`\n❌ INVARIANT GATE FAILED (${gateViolations.length} violations):`);
    for (const v of gateViolations) {
      console.error(`   - ${v}`);
    }
    console.error('Aborting ingestion.');
    process.exit(1);
  }

  const confirmedOnly = cleanQuestions.filter(
    (q) => q.verificationStatus === 'OFFICIAL_CONFIRMED' && q.ingestionState === 'VERIFIED'
  );
  const quarantinedOnly = cleanQuestions.filter((q) => q.ingestionState === 'QUARANTINED');

  console.log(`\n📊 Record Classification:`);
  console.log(`   Total Questions:     ${cleanQuestions.length}`);
  console.log(`   OFFICIAL_CONFIRMED:  ${confirmedOnly.length} (will be indexed into Pinecone)`);
  console.log(`   QUARANTINED:         ${quarantinedOnly.length} (will be stored in Firestore for audit only)`);

  // Verify dropped questions
  const droppedQuestions = cleanQuestions.filter((q) => !q.correctAnswer || q.correctAnswer === '');
  console.log(`   Dropped / No Answer: ${droppedQuestions.length} (Q${droppedQuestions.map((q) => q.questionNumber).join(', Q')})`);

  // 4. Check embedding guard lock
  const activeLock = readLock();
  if (activeLock) {
    console.error(`\n🔒 EMBEDDING GUARD ACTIVE:`);
    console.error(`   Indexer lock held by PID ${activeLock.pid} ("${activeLock.label}").`);
    console.error(`   Started at: ${new Date(activeLock.startedAt).toISOString()}`);
    console.error(`   Refusing to proceed while another indexer is active.`);
    process.exit(1);
  } else {
    console.log(`\n🟢 Embedding Guard: Lock free. Ready for indexing.`);
  }

  if (isDryRun) {
    console.log('\n───────────────────────────────────────────────────────────────────────────────');
    console.log('🔍 DRY-RUN COMPLETE');
    console.log('───────────────────────────────────────────────────────────────────────────────');
    console.log(`  [Firestore] Would write ${cleanQuestions.length} canonical questions via saveCanonicalQuestionsBatch()`);
    console.log(`  [Pinecone]  Would index ${confirmedOnly.length} confirmed questions via indexQuestions()`);
    console.log(`              (pacing: 4000ms, batchSize: 20)`);
    console.log(`  [No-op]     No writes were committed to Firestore or Pinecone.`);
    console.log(`\nTo execute live ingestion, run:`);
    console.log(`  npx tsx scripts/pyq/official/ingest-verified-candidates.ts --execute\n`);
    process.exit(0);
  }

  // 5. LIVE EXECUTION
  console.log('\n🚀 Starting Live Ingestion...');

  // Step A: Write all 100 questions to Firestore
  console.log(`\n[1/2] Writing all ${cleanQuestions.length} questions to Firestore (pyq_questions)...`);
  await pyqRepository.saveCanonicalQuestionsBatch(cleanQuestions);
  console.log(`✅ Saved ${cleanQuestions.length} canonical questions to Firestore.`);

  // Step B: Index confirmed questions to Pinecone
  console.log(`\n[2/2] Embedding and vector-indexing ${confirmedOnly.length} confirmed questions...`);
  console.log(`      Pacing: 4000ms per question, batch size: 20`);

  const indexResult = await pyqVectorIngestionService.indexQuestions(confirmedOnly, {
    pacingMs: 4000,
    batchSize: 20,
  });

  console.log('\n───────────────────────────────────────────────────────────────────────────────');
  console.log('🎉 INGESTION COMPLETE');
  console.log('───────────────────────────────────────────────────────────────────────────────');
  console.log(`  Firestore Total Written: ${cleanQuestions.length}`);
  console.log(`  Pinecone Indexed:        ${indexResult.indexedCount}`);
  console.log(`  Pinecone Skipped:        ${indexResult.skippedCount}`);
  console.log(`  Pinecone Failed:         ${indexResult.failedCount}`);
  console.log('───────────────────────────────────────────────────────────────────────────────\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during ingestion:', err);
  process.exit(1);
});
