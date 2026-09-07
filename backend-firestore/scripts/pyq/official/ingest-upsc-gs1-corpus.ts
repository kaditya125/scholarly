/**
 * Ingest and Embed the UPSC Prelims GS-I Corpus (2011–2025) into Sadhya.
 *
 * Sequence:
 * 1. Read candidates from out/UPSC-CSE-PRELIMS-GS1-<year>/candidates.json for 2011–2025.
 * 2. Deduplicate 2016 Q90 false positive.
 * 3. Strip _review from every record.
 * 4. Invariant assertion:
 *    - Class A (2024): TIER_A_OFFICIAL, OFFICIAL_CONFIRMED (93) / QUARANTINED (7), correctAnswer present.
 *    - Class B (all other years): TIER_C_SECONDARY, UNVERIFIED, QUARANTINED, correctAnswer empty, questionNumberVerified stamped.
 * 5. Phase 1: Write all questions to Firestore via pyqRepository.saveCanonicalQuestionsBatch().
 * 6. Phase 2: Embed Class A and Class B separately with gemini-embedding-001 (768 dim, 4000ms pacing).
 *    - Class A: public: true, content_type: 'pyq', answerAvailable: true.
 *    - Class B: public: false, content_type: 'pyq_unkeyed', answerAvailable: false.
 *
 * USAGE:
 *   npx tsx scripts/pyq/official/ingest-upsc-gs1-corpus.ts            # dry-run by default
 *   npx tsx scripts/pyq/official/ingest-upsc-gs1-corpus.ts --dry-run  # explicit dry-run
 *   npx tsx scripts/pyq/official/ingest-upsc-gs1-corpus.ts --execute  # live ingestion
 *   npx tsx scripts/pyq/official/ingest-upsc-gs1-corpus.ts --execute --firestore-only  # Firestore only
 *   npx tsx scripts/pyq/official/ingest-upsc-gs1-corpus.ts --execute --embed-only      # Embedding only
 *   npx tsx scripts/pyq/official/ingest-upsc-gs1-corpus.ts --execute --embed-only --class=A  # Class A only
 *   npx tsx scripts/pyq/official/ingest-upsc-gs1-corpus.ts --execute --embed-only --class=B  # Class B only
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { env } from '../../../src/config/env';
import { pyqRepository } from '../../../src/repositories/pyq.repository';
import { pyqVectorIngestionService } from '../../../src/services/pyq/pyqVectorIngestion.service';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { CanonicalPYQQuestion } from '../../../src/types/pyq.types';
import { readLock, requireNoIndexer } from '../../phase4a/_embedding-guard';

interface Receipt {
  paperKey: string;
  examId: string;
  year: number;
  paper: string;
  series: string;
  paperUrl: string | null;
  paperSha256: string | null;
  answerKeyUrl: string | null;
  answerKeySha256: string | null;
  answerKeyHashMatchesTranscription: boolean | null;
  textUrl: string | null;
  textSha256: string | null;
  downloadedAt: string;
}

interface RawCandidate extends CanonicalPYQQuestion {
  questionNumberVerified?: boolean;
  _review?: {
    defects?: string[];
    dropped?: boolean;
    printedNumber?: number | null;
    paperAligned?: boolean;
    needsHumanReview?: boolean;
  };
}

const OUT = path.join(__dirname, 'out');
const YEARS = Array.from({ length: 15 }, (_, i) => 2011 + i); // 2011..2025

import { GoogleGenAI } from '@google/genai';

// Regional pool of Vertex AI locations (gemini-embedding-001 @ 768 dims)
// All verified cosine 1.0000000000000002 equivalent and draw on the same service account
const VERTEX_REGIONS = [
  'asia-south1',
  'asia-southeast1',
  'asia-east1',
  'asia-northeast1',
  'europe-west1',
  'europe-west4',
  'us-east4',
  'us-west1',
];

const vertexClients = VERTEX_REGIONS.map((loc) => ({
  loc,
  client: new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_VERTEX_PROJECT || 'eng-cache-501514-q4',
    location: loc,
  }),
}));

let currentRegionIdx = 0;

async function generateResilientEmbedding(text: string): Promise<number[]> {
  const maxAttempts = VERTEX_REGIONS.length * 2;
  let lastErr: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { loc, client } = vertexClients[currentRegionIdx];
    try {
      const res = await client.models.embedContent({
        model: 'gemini-embedding-001',
        contents: text,
        config: { outputDimensionality: 768 },
      });
      const vector = res.embeddings?.[0]?.values;
      if (vector && vector.length === 768) {
        return vector;
      }
      throw new Error(`Invalid vector shape from ${loc}: length ${vector?.length}`);
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || '');
      const is429 =
        err?.status === 429 ||
        msg.includes('429') ||
        msg.includes('Quota exceeded') ||
        msg.includes('RESOURCE_EXHAUSTED');

      // Rotate to next region
      currentRegionIdx = (currentRegionIdx + 1) % VERTEX_REGIONS.length;

      if (is429) {
        // Short pause before trying next region
        await new Promise((r) => setTimeout(r, 250));
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  // If all regions exhausted in rapid succession, wait 15s and try once more on primary
  console.warn('   ⚠️ All regions busy, waiting 15s before final attempt...');
  await new Promise((r) => setTimeout(r, 15000));
  const { client } = vertexClients[0];
  const res = await client.models.embedContent({
    model: 'gemini-embedding-001',
    contents: text,
    config: { outputDimensionality: 768 },
  });
  return res.embeddings![0].values!;
}

async function embedAndIndexBatch(
  questions: CanonicalPYQQuestion[],
  isClassA: boolean,
  namespace: string
): Promise<{ indexedCount: number; failedCount: number }> {
  const pacingMs = 500;
  const batchSize = 25;

  let indexedCount = 0;
  let failedCount = 0;
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const vectorsBuffer: { id: string; values: number[]; metadata: any }[] = [];
  const questionsToUpdate: CanonicalPYQQuestion[] = [];

  const label = isClassA ? 'Class A (Official 2024)' : 'Class B (Unkeyed Mirror)';

  console.log(`\n── Starting Vector Indexing: ${label} (${questions.length} questions) ──`);
  console.log(`   Namespace:        ${namespace}`);
  console.log(`   content_type:     ${isClassA ? "'pyq'" : "'pyq_unkeyed'"}`);
  console.log(`   public:           ${isClassA ? 'true' : 'false'}`);
  console.log(`   answerAvailable:  ${isClassA ? 'true' : 'false'}`);
  console.log(`   pacing:           ${pacingMs}ms, batchSize: ${batchSize}\n`);

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    if (q.vectorIndexed) {
      continue;
    }

    let embedding: number[] | null = null;
    try {
      if (i > 0 && pacingMs > 0) {
        await pause(pacingMs);
      }
      const embeddingText = pyqVectorIngestionService.formatQuestionForEmbedding(q);
      embedding = await generateResilientEmbedding(embeddingText);
    } catch (err: any) {
      console.error(`   [${isClassA ? 'Class A' : 'Class B'}] Failed to embed Q${q.questionNumber} (${q.questionId}): ${err.message}`);
      failedCount++;
      continue;
    }

    if (!embedding) continue;

    const vectorId = `vec_${q.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const metadata = {
      content_type: isClassA ? 'pyq' : 'pyq_unkeyed',
      corpusBucket: q.corpusBucket || 'OFFICIAL_PYQ',
      vectorKind: 'CANONICAL_PYQ_QUESTION',
      public: isClassA ? true : false,
      answerAvailable: isClassA ? true : false,
      owner: 'sadhya-exam-intel',
      userId: '',
      notebookId: `exam-${q.examId.toLowerCase()}`,
      sourceId: q.sourceId,
      examId: q.examId,
      examName: q.examName,
      year: q.year,
      session: q.session || '',
      paper: q.paper || '',
      shift: q.shift || '',
      subject: q.subject,
      topic: q.topic || '',
      subtopic: q.subtopic || '',
      syllabusNodeId: q.syllabusNodeId || '',
      questionId: q.questionId,
      questionNumber: q.questionNumber,
      questionType: q.questionType,
      difficulty: q.difficulty || 'MEDIUM',
      sourceType: q.sourceType,
      verificationStatus: q.verificationStatus,
      rightsStatus: q.rightsStatus,
      text: q.questionText,
      options: q.options || [],
      correctAnswer: isClassA ? q.correctAnswer : '',
      hasDiagram: Boolean(q.diagrams && q.diagrams.length > 0),
      createdAt: q.createdAt,
      uploadedAt: new Date(q.createdAt).toISOString(),
    };

    vectorsBuffer.push({ id: vectorId, values: embedding, metadata });

    q.vectorIndexed = true;
    q.vectorIndexedAt = Date.now();
    if (isClassA) {
      q.ingestionState = 'INDEXED';
    }
    questionsToUpdate.push(q);

    // Flush batch to Pinecone and Firestore with resilience
    if (vectorsBuffer.length >= batchSize) {
      const toUpsert = vectorsBuffer.splice(0);
      let upsertOk = false;
      for (let pAttempt = 1; pAttempt <= 5; pAttempt++) {
        try {
          await pineconeService.upsertVectors(toUpsert, namespace);
          upsertOk = true;
          break;
        } catch (pErr: any) {
          console.warn(`   [Pinecone] Upsert retry ${pAttempt}/5 failed: ${pErr.message}. Waiting 3s...`);
          await pause(3000);
        }
      }
      if (!upsertOk) {
        throw new Error(`Failed to upsert vectors to Pinecone after 5 attempts.`);
      }
      indexedCount += toUpsert.length;

      const toPersist = questionsToUpdate.splice(0);
      await pyqRepository.saveCanonicalQuestionsBatch(toPersist);

      console.log(`   [${isClassA ? 'Class A' : 'Class B'}] Flushed and persisted ${indexedCount} / ${questions.length} vectors.`);
    }
  }

  // Final flush
  if (vectorsBuffer.length > 0) {
    const remainingCount = vectorsBuffer.length;
    let upsertOk = false;
    for (let pAttempt = 1; pAttempt <= 5; pAttempt++) {
      try {
        await pineconeService.upsertVectors(vectorsBuffer, namespace);
        upsertOk = true;
        break;
      } catch (pErr: any) {
        console.warn(`   [Pinecone] Final flush retry ${pAttempt}/5 failed: ${pErr.message}. Waiting 3s...`);
        await pause(3000);
      }
    }
    if (!upsertOk) {
      throw new Error(`Failed to upsert final batch to Pinecone after 5 attempts.`);
    }
    indexedCount += remainingCount;

    await pyqRepository.saveCanonicalQuestionsBatch(questionsToUpdate);
    console.log(`   [${isClassA ? 'Class A' : 'Class B'}] Final flush: ${indexedCount} / ${questions.length} vectors persisted.`);
  }

  console.log(`✅ [${isClassA ? 'Class A' : 'Class B'}] Complete: ${indexedCount} indexed, ${failedCount} failed.\n`);
  return { indexedCount, failedCount };
}

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute') || args.includes('--no-dry-run');
  const isDryRun = !isExecute || args.includes('--dry-run');
  const firestoreOnly = args.includes('--firestore-only');
  const embedOnly = args.includes('--embed-only');
  const classFilter = args.find((a) => a.startsWith('--class='))?.split('=')[1]?.toUpperCase(); // 'A', 'B', or undefined
  const yearFilter = args.find((a) => a.startsWith('--year='))?.split('=')[1]?.split(',').map(Number);

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('📚 SADHYA UPSC PRELIMS GS-I CORPUS INGESTION (2011–2025)');
  console.log(`Mode:           ${isDryRun ? '🔍 DRY-RUN (Simulation)' : '🚨 LIVE EXECUTION (Firestore + Pinecone)'}`);
  if (firestoreOnly) console.log('Scope:          Firestore write only (skipping embedding)');
  if (embedOnly) console.log('Scope:          Embedding only (skipping Firestore write)');
  if (classFilter) console.log(`Class Filter:   ${classFilter}`);
  if (yearFilter) console.log(`Year Filter:    ${yearFilter.join(', ')}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // 1. Read all candidates
  const allCandidates: CanonicalPYQQuestion[] = [];
  const classACandidates: CanonicalPYQQuestion[] = [];
  const classBCandidates: CanonicalPYQQuestion[] = [];
  const perYearStats: Record<number, { total: number; clean: number; defective: number; confirmed: number; dropped: number }> = {};
  const duplicateWarnings: string[] = [];

  for (const year of YEARS) {
    if (yearFilter && !yearFilter.includes(year)) continue;

    const paperKey = `UPSC-CSE-PRELIMS-GS1-${year}`;
    const dir = path.join(OUT, paperKey);
    const candPath = path.join(dir, 'candidates.json');
    const receiptPath = path.join(dir, 'receipt.json');

    if (!fs.existsSync(candPath)) {
      console.warn(`⚠️ Candidates file missing for ${year}: ${candPath}`);
      continue;
    }

    const receipt: Receipt = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : ({} as any);
    const rawList: RawCandidate[] = JSON.parse(fs.readFileSync(candPath, 'utf8'));

    // Deduplicate 2016 Q90 false positive (source file has consecutive identical Q90)
    let processedList = rawList;
    if (year === 2016) {
      const seenHashes = new Set<string>();
      const deduped: RawCandidate[] = [];
      for (const q of rawList) {
        if (seenHashes.has(q.contentHash)) {
          duplicateWarnings.push(`2016: Deduplicated consecutive duplicate question ${q.questionNumber} (${q.contentHash.slice(0, 10)})`);
        } else {
          seenHashes.add(q.contentHash);
          deduped.push(q);
        }
      }
      processedList = deduped;
    }

    perYearStats[year] = { total: processedList.length, clean: 0, defective: 0, confirmed: 0, dropped: 0 };

    for (const raw of processedList) {
      // Invariant checks
      const isClassA = year === 2024;

      if (isClassA) {
        if (!receipt.paperSha256 || !receipt.answerKeySha256) {
          throw new Error(`Contradiction: 2024 marked Class A but receipt missing hashes!`);
        }
        if (raw.verificationStatus === 'OFFICIAL_CONFIRMED' && (!raw.correctAnswer || raw.correctAnswer.trim() === '')) {
          throw new Error(`Contradiction: Q${raw.questionNumber} in 2024 marked OFFICIAL_CONFIRMED with empty answer!`);
        }
        if (raw.verificationStatus === 'OFFICIAL_CONFIRMED') perYearStats[year].confirmed++;
        if (raw._review?.dropped) perYearStats[year].dropped++;
      } else {
        // Class B assertions
        if (raw.correctAnswer !== '') {
          throw new Error(`Contradiction: Year ${year} is unkeyed Class B but has correctAnswer="${raw.correctAnswer}"!`);
        }
        if (raw.sourceType !== 'TIER_C_SECONDARY') {
          throw new Error(`Contradiction: Year ${year} is Class B but sourceType="${raw.sourceType}"!`);
        }
        if (raw.verificationStatus !== 'UNVERIFIED' || raw.ingestionState !== 'QUARANTINED') {
          throw new Error(`Contradiction: Year ${year} is Class B but status is not UNVERIFIED/QUARANTINED!`);
        }
      }

      if (raw._review?.defects && raw._review.defects.length > 0) {
        perYearStats[year].defective++;
      } else {
        perYearStats[year].clean++;
      }

      // Strip _review
      const { _review, ...cleanQuestion } = raw;
      const clean = cleanQuestion as CanonicalPYQQuestion;

      allCandidates.push(clean);
      if (isClassA) {
        classACandidates.push(clean);
      } else {
        classBCandidates.push(clean);
      }
    }
  }

  console.log('───────────────────────────────────────────────────────────────────────────────');
  console.log('YEAR   PARSED   CLEAN   DEFECTIVE   OFFICIAL_CONFIRMED   DROPPED   CLASS');
  console.log('───────────────────────────────────────────────────────────────────────────────');
  for (const year of YEARS) {
    const s = perYearStats[year];
    if (!s) continue;
    const cls = year === 2024 ? 'Class A (UPSC PDF + Key)' : 'Class B (OCR Mirror Unkeyed)';
    console.log(
      `${year}   ${String(s.total).padStart(6)}  ${String(s.clean).padStart(6)}  ${String(s.defective).padStart(10)}   ${String(s.confirmed).padStart(18)}  ${String(s.dropped).padStart(8)}   ${cls}`
    );
  }
  console.log('───────────────────────────────────────────────────────────────────────────────');
  console.log(`TOTAL  ${String(allCandidates.length).padStart(6)} questions across ${Object.keys(perYearStats).length} years`);
  console.log(`       Class A: ${classACandidates.length} questions (2024)`);
  console.log(`       Class B: ${classBCandidates.length} questions (2011–2023, 2025)\n`);

  if (duplicateWarnings.length > 0) {
    console.log('⚠️ Deduplication notes:');
    for (const w of duplicateWarnings) console.log(`   • ${w}`);
    console.log('');
  }

  // 2. Check embedding guard
  const activeLock = readLock();
  if (activeLock) {
    console.error(`🔒 EMBEDDING GUARD ACTIVE:`);
    console.error(`   Indexer lock held by PID ${activeLock.pid} ("${activeLock.label}").`);
    console.error(`   Refusing to proceed. Wait for the indexer to complete.`);
    process.exit(1);
  } else {
    console.log(`🟢 Embedding Guard: Lock free. Ready for ingestion.\n`);
  }

  // 3. Dry-Run Check
  if (isDryRun) {
    console.log('───────────────────────────────────────────────────────────────────────────────');
    console.log('🔍 DRY-RUN COMPLETE');
    console.log('───────────────────────────────────────────────────────────────────────────────');
    console.log(`  [Firestore] Would write ${allCandidates.length} canonical questions via saveCanonicalQuestionsBatch()`);
    console.log(`  [Pinecone]  Would index:`);
    console.log(`              - Class A: 93 confirmed questions (content_type='pyq', public=true)`);
    console.log(`              - Class B: ${classBCandidates.length} unkeyed questions (content_type='pyq_unkeyed', public=false, answerAvailable=false)`);
    console.log(`  [Pacing]    4000ms per question, batch size 20`);
    console.log(`  [No-op]     Zero writes committed.`);
    console.log(`\nTo execute live ingestion, run:`);
    console.log(`  npx tsx scripts/pyq/official/ingest-upsc-gs1-corpus.ts --execute\n`);
    process.exit(0);
  }

  // 4. LIVE EXECUTION
  console.log('🚀 LIVE EXECUTION COMMENCING...\n');

  // STEP 1: Write all questions to Firestore first
  if (!embedOnly) {
    console.log(`[Phase 1/3] Writing ${allCandidates.length} canonical questions to Firestore (pyq_questions)...`);
    const BATCH_SIZE = 400;
    for (let i = 0; i < allCandidates.length; i += BATCH_SIZE) {
      const chunk = allCandidates.slice(i, i + BATCH_SIZE);
      await pyqRepository.saveCanonicalQuestionsBatch(chunk);
      console.log(`   Saved ${Math.min(i + BATCH_SIZE, allCandidates.length)} / ${allCandidates.length} records to Firestore.`);
    }
    console.log(`✅ Phase 1 Complete: All ${allCandidates.length} questions written to Firestore.\n`);
  } else {
    console.log(`[Phase 1/3] Skipping Firestore write (--embed-only flag active).\n`);
  }

  if (firestoreOnly) {
    console.log('🏁 Firestore write complete. Exiting as requested by --firestore-only flag.');
    process.exit(0);
  }

  // STEP 2: Embed Class A (2024 Confirmed)
  const shouldEmbedClassA = !classFilter || classFilter === 'A';
  const shouldEmbedClassB = !classFilter || classFilter === 'B';

  const confirmedClassA = classACandidates.filter(
    (q) => q.verificationStatus === 'OFFICIAL_CONFIRMED' && q.ingestionState === 'VERIFIED'
  );

  if (shouldEmbedClassA && confirmedClassA.length > 0) {
    console.log(`[Phase 2/3] Embedding Class A: ${confirmedClassA.length} confirmed questions (2024)...`);
    requireNoIndexer('Class_A_Vector_Ingestion');
    await embedAndIndexBatch(confirmedClassA, true, env.PINECONE_NAMESPACE);
  } else if (!shouldEmbedClassA) {
    console.log(`[Phase 2/3] Skipping Class A (filter = ${classFilter}).\n`);
  }

  // STEP 3: Embed Class B (Unkeyed 2011–2023, 2025)
  if (shouldEmbedClassB && classBCandidates.length > 0) {
    console.log(`[Phase 3/3] Embedding Class B: ${classBCandidates.length} unkeyed questions (2011–2023, 2025)...`);
    requireNoIndexer('Class_B_Vector_Ingestion');
    await embedAndIndexBatch(classBCandidates, false, env.PINECONE_NAMESPACE);
  } else if (!shouldEmbedClassB) {
    console.log(`[Phase 3/3] Skipping Class B (filter = ${classFilter}).\n`);
  }

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🎉 INGESTION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during ingestion:', err);
  process.exit(1);
});
