/**
 * Ingest and Embed NEET UG Papers (2025 Code 45, 2026 Code 13, 2026 Re-NEET Code 50)
 * from the Indian Entrance Exams Benchmark (Hugging Face).
 *
 * PROVENANCE AND GOVERNANCE:
 * - Source: geekyrakshit/indian-entrance-exams-benchmark (Validation split)
 * - Questions: Authentic NEET UG
 * - Answer Keys: Secondary coaching institute published keys (provisional)
 * - Solutions: EXCLUDED (copyrighted coaching institute editorial content)
 * - sourceType: 'TIER_B_REPUTABLE_PLATFORM'
 * - verificationStatus: 'SECONDARY_CONFIRMED'
 * - ingestionState: 'VERIFIED' (or 'QUARANTINED' for figure-dependent / dropped questions)
 * - rightsStatus: 'UNKNOWN' (no license declared on HF dataset card; flagged for review)
 *
 * FIGURE GATING:
 * - Questions with inline <image_N> placeholders in questionText or options are QUARANTINED.
 * - Only the 458 non-figure-dependent, answerable questions are indexed to Pinecone.
 *
 * USAGE:
 *   npx tsx scripts/pyq/official/ingest-neet-benchmark.ts            # dry-run by default
 *   npx tsx scripts/pyq/official/ingest-neet-benchmark.ts --dry-run  # explicit dry-run
 *   npx tsx scripts/pyq/official/ingest-neet-benchmark.ts --execute  # live Firestore + Pinecone ingestion
 *   npx tsx scripts/pyq/official/ingest-neet-benchmark.ts --execute --firestore-only # Firestore only
 *   npx tsx scripts/pyq/official/ingest-neet-benchmark.ts --execute --embed-only     # Pinecone only
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { db } from '../../../src/config/firebase';
import { env } from '../../../src/config/env';
import { pyqRepository } from '../../../src/repositories/pyq.repository';
import { pyqExtractorService } from '../../../src/services/pyq/pyqExtractor.service';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { CanonicalPYQQuestion, PYQQuestionType } from '../../../src/types/pyq.types';
import { acquireIndexerLock, releaseIndexerLock } from '../../phase4a/_embedding-guard';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface BenchmarkConfigSpec {
  config: string;
  year: number;
  session: string;
  paper: string;
  paperCode: string;
  expectedQuestions: number;
  expectedSubjects: { Physics: number; Chemistry: number; Biology: number };
}

const CONFIG_SPECS: BenchmarkConfigSpec[] = [
  {
    config: 'neet2025-code45',
    year: 2025,
    session: 'Main',
    paper: 'NEET UG 2025 (Code 45)',
    paperCode: 'Code 45',
    expectedQuestions: 180,
    expectedSubjects: { Physics: 45, Chemistry: 45, Biology: 90 },
  },
  {
    config: 'neet2026-code13',
    year: 2026,
    session: 'Main',
    paper: 'NEET UG 2026 (Code 13)',
    paperCode: 'Code 13',
    expectedQuestions: 180,
    expectedSubjects: { Physics: 45, Chemistry: 45, Biology: 90 },
  },
  {
    config: 'reneet2026-code50',
    year: 2026,
    session: 'Re-NEET',
    paper: 'NEET UG 2026 Re-NEET (Code 50)',
    paperCode: 'Code 50',
    expectedQuestions: 180,
    expectedSubjects: { Physics: 45, Chemistry: 45, Biology: 90 },
  },
];

const OUT_DIR = path.join(__dirname, 'out', 'neet-benchmark');
const HF_DATASET_URL = 'https://huggingface.co/datasets/geekyrakshit/indian-entrance-exams-benchmark';

// Regional pool of Vertex AI locations (gemini-embedding-001 @ 768 dims)
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
        // Rotate for load distribution
        currentRegionIdx = (currentRegionIdx + 1) % VERTEX_REGIONS.length;
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

      currentRegionIdx = (currentRegionIdx + 1) % VERTEX_REGIONS.length;
      if (is429) {
        await new Promise((r) => setTimeout(r, 250));
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  // Final fallback on primary
  console.warn('   ⚠️ All regions busy, waiting 10s before final attempt...');
  await new Promise((r) => setTimeout(r, 10000));
  const { client } = vertexClients[0];
  const res = await client.models.embedContent({
    model: 'gemini-embedding-001',
    contents: text,
    config: { outputDimensionality: 768 },
  });
  return res.embeddings![0].values!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch & Cache
// ─────────────────────────────────────────────────────────────────────────────

async function fetchConfigRows(config: string): Promise<any[]> {
  const cacheFile = path.join(OUT_DIR, `${config}.json`);
  if (fs.existsSync(cacheFile)) {
    const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return data.rows || [];
  }

  let offset = 0;
  const length = 100;
  const allRows: any[] = [];
  let features: any = null;

  while (true) {
    const url = `https://datasets-server.huggingface.co/rows?dataset=geekyrakshit%2Findian-entrance-exams-benchmark&config=${config}&split=validation&offset=${offset}&length=${length}`;
    console.log(`Fetching ${config} [offset ${offset}, length ${length}]...`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    if (!features && data.features) features = data.features;
    const rows = data.rows || [];
    if (rows.length === 0) break;
    allRows.push(...rows.map((r: any) => r.row));
    offset += rows.length;
    if (offset >= data.num_rows_total || rows.length < length) break;
  }

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }
  fs.writeFileSync(cacheFile, JSON.stringify({ config, features, rows: allRows }, null, 2));
  return allRows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform to CanonicalPYQQuestion
// ─────────────────────────────────────────────────────────────────────────────

function formatQuestionForEmbedding(q: CanonicalPYQQuestion): string {
  const lines: string[] = [
    `Examination: ${q.examId} (${q.examName})`,
    `Year: ${q.year}${q.session ? ` | Session: ${q.session}` : ''}${q.shift ? ` | Shift: ${q.shift}` : ''}`,
    `Subject: ${q.subject}${q.topic ? ` > ${q.topic}` : ''}${q.subtopic ? ` > ${q.subtopic}` : ''}`,
    `Question Type: ${q.questionType} | Difficulty: ${q.difficulty || 'MEDIUM'}`,
    `Question ${q.questionNumber}: ${q.questionText}`,
  ];

  if (q.options && q.options.length > 0) {
    lines.push(`Options: ${q.options.map((opt, idx) => `(${String.fromCharCode(65 + idx)}) ${opt}`).join('  ')}`);
  }

  if (q.passageText) {
    lines.push(`Reference Passage: ${q.passageText}`);
  }

  lines.push(`Content Type: Official Previous Year Question (PYQ)`);
  return lines.join('\n');
}

export function buildCandidateQuestions(): CanonicalPYQQuestion[] {
  const now = Date.now();
  const allQuestions: CanonicalPYQQuestion[] = [];

  for (const spec of CONFIG_SPECS) {
    const cacheFile = path.join(OUT_DIR, `${spec.config}.json`);
    if (!fs.existsSync(cacheFile)) {
      throw new Error(`Cache file not found: ${cacheFile}. Run fetch first.`);
    }
    const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const rows: any[] = data.rows || [];

    // Verify Blueprint
    if (rows.length !== spec.expectedQuestions) {
      throw new Error(`Expected ${spec.expectedQuestions} rows for ${spec.config}, found ${rows.length}`);
    }

    const subCounts: Record<string, number> = { Physics: 0, Chemistry: 0, Biology: 0 };
    for (const r of rows) {
      subCounts[r.subject] = (subCounts[r.subject] || 0) + 1;
    }
    if (
      subCounts.Physics !== spec.expectedSubjects.Physics ||
      subCounts.Chemistry !== spec.expectedSubjects.Chemistry ||
      subCounts.Biology !== spec.expectedSubjects.Biology
    ) {
      throw new Error(`Subject count mismatch in ${spec.config}: ${JSON.stringify(subCounts)}`);
    }

    for (const r of rows) {
      const qNum = r.question_number;
      const rawQuestion = r.question || '';
      const rawOptions: string[] = Array.isArray(r.options) ? r.options : [];

      // LaTeX & Notation Preservation
      const normText = pyqExtractorService.normalizeMathAndScienceNotation(rawQuestion);
      const normOpts = rawOptions.map((o) => pyqExtractorService.normalizeMathAndScienceNotation(o));

      const contentHash = pyqExtractorService.generateQuestionHash('NEET_UG', normText, normOpts, qNum);

      // Question ID convention starting with pyq:neet_ug:2025: and pyq:neet_ug:2026:
      const sessionTag = spec.session === 'Re-NEET' ? 'reneet_code50' : spec.config.replace(/^neet\d+-/, '');
      const questionId = `pyq:neet_ug:${spec.year}:${sessionTag}:q${qNum}:${contentHash.slice(0, 8)}`;

      // Figures check
      const qHasImg = /<image_\d+>/i.test(rawQuestion);
      const optHasImg = rawOptions.some((o) => /<image_\d+>/i.test(o));
      const isFigureDependent = qHasImg || optHasImg;

      // Answer parsing
      const answerStatus = r.answer_status || 'normal';
      let correctAnswer = '';
      let qType: PYQQuestionType = 'MCQ_SINGLE';

      if (answerStatus === 'dropped') {
        correctAnswer = '';
      } else if (answerStatus === 'multiple' || (Array.isArray(r.correct_option) && r.correct_option.length > 1)) {
        qType = 'MCQ_MULTIPLE';
        const letters = (r.correct_option as number[])
          .slice()
          .sort((a, b) => a - b)
          .map((idx) => String.fromCharCode(65 + idx));
        correctAnswer = letters.join(',');
      } else if (Array.isArray(r.correct_option) && r.correct_option.length === 1) {
        correctAnswer = String.fromCharCode(65 + r.correct_option[0]);
      } else {
        throw new Error(`Unexpected correct_option format in ${spec.config} Q#${qNum}: ${JSON.stringify(r.correct_option)}`);
      }

      // Ingestion state & Quarantine
      let ingestionState: CanonicalPYQQuestion['ingestionState'] = 'VERIFIED';
      let quarantineReason: CanonicalPYQQuestion['quarantineReason'] | undefined = undefined;
      let diagrams: CanonicalPYQQuestion['diagrams'] = undefined;

      if (isFigureDependent) {
        diagrams = [
          {
            assetId: `diag_${questionId}`,
            storagePath: `pyq_diagrams/NEET_UG/${spec.year}/${questionId}.png`,
            altText: '',
            isRequiredForAnswering: true,
          },
        ];
        ingestionState = 'QUARANTINED';
        quarantineReason = 'UNVERIFIED_OFFICIAL_SOURCE';
      } else if (answerStatus === 'dropped') {
        ingestionState = 'QUARANTINED';
        quarantineReason = 'INVALID_PROVENANCE';
      }

      const canonical: CanonicalPYQQuestion = {
        questionId,
        examId: 'NEET_UG',
        examName: 'National Eligibility cum Entrance Test (UG)',
        year: spec.year,
        session: spec.session,
        paper: spec.paper,
        subject: r.subject,
        questionNumber: qNum,
        questionText: normText,
        questionType: qType,
        options: normOpts.length > 0 ? normOpts : undefined,
        correctAnswer,
        correctAnswerSource: 'Coaching institute published key (secondary)',
        // Copyright governance: solution excluded
        solution: undefined,
        solutionSource: undefined,
        difficulty: 'MEDIUM',
        marks: 4,
        negativeMarks: 1,
        language: 'en',
        diagrams,
        extractionQualityScore: 0.98,
        sourceId: `src_neet_ug_${spec.year}_benchmark_${spec.config}`,
        sourceUrl: HF_DATASET_URL,
        sourceType: 'TIER_B_REPUTABLE_PLATFORM',
        provenanceRecords: [
          {
            sourceTier: 'TIER_B_REPUTABLE_PLATFORM',
            sourceName: 'Indian Entrance Exams Benchmark (Hugging Face)',
            sourceUrl: HF_DATASET_URL,
            sourceDomain: 'huggingface.co',
            retrievedAt: now,
            isOfficial: false,
            extractedAnswer: correctAnswer,
            contentHash,
            notes: 'Answer key sourced from secondary coaching institute published keys. Solutions excluded due to copyright.',
          },
        ],
        verificationStatus: 'SECONDARY_CONFIRMED',
        rightsStatus: 'UNKNOWN',
        rightsSource: 'Hugging Face: geekyrakshit/indian-entrance-exams-benchmark',
        redistributionAllowed: false,
        contentHash,
        corpusBucket: 'OFFICIAL_PYQ',
        ingestionState,
        quarantineReason,
        vectorIndexed: false,
        retrievalTested: false,
        createdAt: now,
        updatedAt: now,
      };

      allQuestions.push(canonical);
    }
  }

  return allQuestions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isFirestoreOnly = args.includes('--firestore-only');
  const isEmbedOnly = args.includes('--embed-only');
  const isDryRun = !isExecute || args.includes('--dry-run');

  console.log('═════════════════════════════════════════════════════════════════════');
  console.log('  NEET UG Benchmark Ingestion & Embedding Pipeline');
  console.log(`  Mode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'LIVE EXECUTION'}`);
  console.log(`  Target Flags: firestoreOnly=${isFirestoreOnly}, embedOnly=${isEmbedOnly}`);
  console.log('═════════════════════════════════════════════════════════════════════');

  // 1. Ensure all rows are cached
  for (const spec of CONFIG_SPECS) {
    await fetchConfigRows(spec.config);
  }

  // 2. Build Canonical Questions
  const questions = buildCandidateQuestions();
  console.log(`\nGenerated ${questions.length} canonical questions across 3 configs.`);

  // Counts breakdown
  const byYear: Record<number, number> = {};
  const bySubject: Record<string, number> = {};
  const byState: Record<string, number> = {};
  let totalWithDiagrams = 0;
  let totalEmbeddable = 0;

  for (const q of questions) {
    byYear[q.year] = (byYear[q.year] || 0) + 1;
    bySubject[q.subject] = (bySubject[q.subject] || 0) + 1;
    byState[q.ingestionState] = (byState[q.ingestionState] || 0) + 1;
    if (q.diagrams && q.diagrams.length > 0) totalWithDiagrams++;
    if (q.ingestionState === 'VERIFIED') totalEmbeddable++;
  }

  console.log('\n── Breakdown ──');
  console.log('By Year:             ', byYear);
  console.log('By Subject:          ', bySubject);
  console.log('By Ingestion State:  ', byState);
  console.log(`Figure Quarantined:   ${totalWithDiagrams}`);
  console.log(`Total Embeddable:     ${totalEmbeddable}`);

  if (isDryRun) {
    console.log('\n[DRY RUN] Invariant verification passed. No Firestore or Pinecone changes made.');
    console.log('To execute live ingestion, run with: --execute');
    return;
  }

  // 3. Firestore Ingestion
  if (!isEmbedOnly) {
    console.log(`\n── Writing ${questions.length} canonical questions to Firestore ──`);
    await pyqRepository.saveCanonicalQuestionsBatch(questions);
    console.log('✅ Firestore batch write completed successfully.');
  }

  // 4. Pinecone Embedding
  if (!isFirestoreOnly) {
    // Check existing indexed records in Firestore to resume seamlessly
    const neetDocsSnap = await db.collection('pyq_questions')
      .where('examId', '==', 'NEET_UG')
      .where('ingestionState', '==', 'INDEXED')
      .select()
      .get();
    const alreadyIndexedIds = new Set(neetDocsSnap.docs.map((d) => d.id));

    const embeddableQuestions = questions.filter(
      (q) => q.ingestionState === 'VERIFIED' && !alreadyIndexedIds.has(q.questionId)
    );

    console.log(`\n── Indexing ${embeddableQuestions.length} remaining verified questions into Pinecone (${alreadyIndexedIds.size} already indexed) ──`);

    if (embeddableQuestions.length === 0) {
      console.log('✅ All verified questions are already indexed in Pinecone.');
      return;
    }

    acquireIndexerLock('ingest-neet-benchmark');

    const namespace = env.PINECONE_NAMESPACE;
    const pacingMs = Number(process.env.SYLLABUS_EMBEDDING_PACING_MS ?? 1500);
    const batchSize = 10;

    let indexedCount = 0;
    let failedCount = 0;
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const vectorsBuffer: { id: string; values: number[]; metadata: any }[] = [];
    const questionsToUpdate: CanonicalPYQQuestion[] = [];

    try {
      for (let i = 0; i < embeddableQuestions.length; i++) {
        const q = embeddableQuestions[i];

        try {
          if (i > 0 && pacingMs > 0) {
            await pause(pacingMs);
          }

          const embeddingText = formatQuestionForEmbedding(q);
          const embedding = await generateResilientEmbedding(embeddingText);

          const vectorId = `vec_${q.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

          const metadata = {
            content_type: 'pyq',
            answerAuthority: 'secondary',
            corpusBucket: q.corpusBucket || 'OFFICIAL_PYQ',
            vectorKind: 'CANONICAL_PYQ_QUESTION',
            public: true,
            owner: 'sadhya-exam-intel',
            userId: '',
            notebookId: 'exam-neet_ug',
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
            correctAnswer: q.correctAnswer,
            hasDiagram: Boolean(q.diagrams && q.diagrams.length > 0),
            createdAt: q.createdAt,
            uploadedAt: new Date(q.createdAt).toISOString(),
          };

          vectorsBuffer.push({
            id: vectorId,
            values: embedding,
            metadata,
          });

          q.vectorIndexed = true;
          q.vectorIndexedAt = Date.now();
          q.ingestionState = 'INDEXED';
          questionsToUpdate.push(q);

          if ((i + 1) % 5 === 0 || i === embeddableQuestions.length - 1) {
            console.log(`   [${i + 1}/${embeddableQuestions.length}] Embedded ${q.questionId}`);
          }

          if (vectorsBuffer.length >= batchSize) {
            const toUpsert = vectorsBuffer.splice(0);
            await pineconeService.upsertVectors(toUpsert, namespace);
            const toPersist = questionsToUpdate.splice(0);
            await pyqRepository.saveCanonicalQuestionsBatch(toPersist);
            indexedCount += toUpsert.length;
            console.log(`   >>> Persisted ${indexedCount}/${embeddableQuestions.length} vectors to Pinecone & Firestore`);
          }
        } catch (err: any) {
          failedCount++;
          console.error(`   ❌ Failed to embed question ${q.questionId}:`, err.message);
        }
      }

      if (vectorsBuffer.length > 0) {
        const remaining = vectorsBuffer.length;
        await pineconeService.upsertVectors(vectorsBuffer, namespace);
        await pyqRepository.saveCanonicalQuestionsBatch(questionsToUpdate);
        indexedCount += remaining;
        console.log(`   Final flush: ${indexedCount}/${embeddableQuestions.length} vectors persisted.`);
      }

      console.log(`\n✅ Vector indexing complete: ${indexedCount} indexed, ${failedCount} failed.`);
    } finally {
      releaseIndexerLock();
    }
  }

  console.log('\n═════════════════════════════════════════════════════════════════════');
  console.log('  NEET UG Ingestion & Embedding Pipeline Completed Successfully!');
  console.log('═════════════════════════════════════════════════════════════════════');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}
