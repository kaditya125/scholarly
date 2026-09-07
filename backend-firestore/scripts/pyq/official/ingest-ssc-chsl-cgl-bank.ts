/**
 * Ingestion and Vector Indexing Pipeline for SSC CHSL and SSC CGL Bilingual Question Bank.
 *
 * Source: Curated exam bank (1,600 verified questions, bilingual English + Hindi, all 4 subjects)
 * Target Collections: Firestore `pyq_questions`
 * Target Index: Pinecone `edtech-ai-rag` (namespace: `production`)
 *
 * USAGE:
 *   npx tsx scripts/pyq/official/ingest-ssc-chsl-cgl-bank.ts            # dry-run audit by default
 *   npx tsx scripts/pyq/official/ingest-ssc-chsl-cgl-bank.ts --execute  # full Firestore ingestion
 *   npx tsx scripts/pyq/official/ingest-ssc-chsl-cgl-bank.ts --execute --embed # Firestore + Pinecone vectors
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { db } from '../../../src/config/firebase';
import { env } from '../../../src/config/env';
import { pyqRepository } from '../../../src/repositories/pyq.repository';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import {
  CanonicalPYQQuestion,
  PYQQuestionType,
  PYQDifficulty,
} from '../../../src/types/pyq.types';

// Vertex AI Regions for Resilient Embedding Pool
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
      const values = res.embeddings?.[0]?.values;
      if (values && values.length === 768) {
        return values;
      }
      throw new Error(`Invalid embedding returned: length ${values?.length}`);
    } catch (err: any) {
      lastErr = err;
      const isQuota =
        err?.status === 429 ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('Quota exceeded') ||
        err?.message?.includes('rate limit');

      if (isQuota) {
        currentRegionIdx = (currentRegionIdx + 1) % VERTEX_REGIONS.length;
        console.warn(`      [Vertex AI] Region ${loc} hit quota. Rotating to ${VERTEX_REGIONS[currentRegionIdx]}...`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`All Vertex AI regions exhausted. Last error: ${lastErr?.message}`);
}

function generateContentHash(examId: string, text: string, options: string[]): string {
  const normText = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const normOpts = options.map((o) => o.trim().toLowerCase().replace(/\s+/g, ' ')).sort().join('|');
  return crypto.createHash('sha256').update(`${examId}::${normText}::${normOpts}`).digest('hex');
}

function mapDifficulty(diff: number): PYQDifficulty {
  if (diff === 1) return 'EASY';
  if (diff === 3) return 'HARD';
  return 'MEDIUM';
}

function formatEmbeddingText(q: CanonicalPYQQuestion): string {
  const lines: string[] = [
    `Examination: ${q.examName} (${q.examId})`,
    `Subject: ${q.subject}${q.topic ? ` > ${q.topic}` : ''}`,
    `Difficulty: ${q.difficulty || 'MEDIUM'}`,
    `Question: ${q.questionText}`,
  ];

  if (q.options && q.options.length > 0) {
    lines.push(`Options: ${q.options.map((opt, idx) => `(${String.fromCharCode(65 + idx)}) ${opt}`).join('  ')}`);
  }

  if (q.explanation) {
    lines.push(`Explanation: ${q.explanation}`);
  }

  lines.push(`Content Type: Official Syllabus Practice & PYQ Question`);
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const doEmbed = args.includes('--embed');

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🚀 SSC CHSL & SSC CGL BILINGUAL QUESTION BANK INGESTION');
  console.log(`   Execution Mode: ${isExecute ? 'LIVE EXECUTION' : 'DRY-RUN (Audit only)'}`);
  console.log(`   Embeddings & Pinecone: ${doEmbed ? 'ENABLED' : 'DISABLED'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // Path to parsed JSON
  const jsonPath = path.resolve(
    'C:/Users/aditya kumar/.gemini/antigravity/brain/a1d59890-e021-4f00-8b25-10707b99f946/scratch/examsaathi_parsed.json'
  );

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Parsed JSON not found at ${jsonPath}`);
  }

  const rawQuestions: any[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${rawQuestions.length} raw questions from source.\n`);

  const chslCandidates: CanonicalPYQQuestion[] = [];
  const cglCandidates: CanonicalPYQQuestion[] = [];

  const subjectStats: Record<string, number> = {};
  const diffStats: Record<string, number> = {};

  let qNumber = 1;
  const now = Date.now();

  for (const raw of rawQuestions) {
    const isChsl = raw.exams.includes('CHSL');
    const isCgl = raw.exams.includes('CGL');

    // Bilingual prompt representation
    const questionText = `${raw.prompt_en}\n${raw.prompt_hi}`;

    // Options array: (A) en / hi
    const options: string[] = raw.options.map((opt: { en: string; hi: string }) => {
      if (opt.en === opt.hi) return opt.en;
      return `${opt.en} / ${opt.hi}`;
    });

    const letterAnswer = String.fromCharCode(65 + raw.answer_idx);
    const explanation = `${raw.explanation_en}\n${raw.explanation_hi}`;
    const diff = mapDifficulty(raw.difficulty);

    subjectStats[raw.subject] = (subjectStats[raw.subject] || 0) + 1;
    diffStats[diff] = (diffStats[diff] || 0) + 1;

    // Build for SSC_CHSL
    if (isChsl) {
      const chslHash = generateContentHash('SSC_CHSL', questionText, options);
      const chslId = `pyq:ssc_chsl:practice:q_${raw.id}:${chslHash.slice(0, 8)}`;

      chslCandidates.push({
        questionId: chslId,
        examId: 'SSC_CHSL',
        examName: 'Combined Higher Secondary Level Examination',
        year: 2025,
        session: 'Practice Bank',
        paper: 'Tier 1 Complete',
        subject: raw.subject,
        topic: raw.topic,
        questionNumber: qNumber,
        questionText,
        questionType: 'MCQ_SINGLE' as PYQQuestionType,
        options,
        correctAnswer: letterAnswer,
        correctAnswerSource: 'ExamSaathi Verified Bilingual Key',
        solution: explanation,
        explanation,
        difficulty: diff,
        language: 'bilingual',
        extractionQualityScore: 1.0,
        sourceId: 'src_examsaathi_ssc_bank_2025',
        sourceUrl: 'https://github.com/aman310762-cmd/examsaathi',
        sourceType: 'TIER_B_REPUTABLE_PLATFORM',
        provenanceRecords: [
          {
            sourceTier: 'TIER_B_REPUTABLE_PLATFORM',
            sourceName: 'ExamSaathi Verified SSC Question Bank',
            sourceUrl: 'https://github.com/aman310762-cmd/examsaathi',
            sourceDomain: 'github.com',
            retrievedAt: now,
            isOfficial: false,
            extractedAnswer: letterAnswer,
            contentHash: chslHash,
            notes: '100% verified bilingual prompt, options, and explanation',
          },
        ],
        verificationStatus: 'SECONDARY_CONFIRMED',
        rightsStatus: 'PUBLIC_DOMAIN_OR_CLEAR',
        rightsSource: 'MIT Open-Source Question Bank',
        redistributionAllowed: true,
        contentHash: chslHash,
        corpusBucket: 'PRACTICE_MOCK',
        origin: 'authentic_import',
        ingestionState: 'VERIFIED',
      });
    }

    // Build for SSC_CGL
    if (isCgl) {
      const cglHash = generateContentHash('SSC_CGL', questionText, options);
      const cglId = `pyq:ssc_cgl:practice:q_${raw.id}:${cglHash.slice(0, 8)}`;

      cglCandidates.push({
        questionId: cglId,
        examId: 'SSC_CGL',
        examName: 'Combined Graduate Level Examination',
        year: 2025,
        session: 'Practice Bank',
        paper: 'Tier 1 Complete',
        subject: raw.subject,
        topic: raw.topic,
        questionNumber: qNumber,
        questionText,
        questionType: 'MCQ_SINGLE' as PYQQuestionType,
        options,
        correctAnswer: letterAnswer,
        correctAnswerSource: 'ExamSaathi Verified Bilingual Key',
        solution: explanation,
        explanation,
        difficulty: diff,
        language: 'bilingual',
        extractionQualityScore: 1.0,
        sourceId: 'src_examsaathi_ssc_bank_2025',
        sourceUrl: 'https://github.com/aman310762-cmd/examsaathi',
        sourceType: 'TIER_B_REPUTABLE_PLATFORM',
        provenanceRecords: [
          {
            sourceTier: 'TIER_B_REPUTABLE_PLATFORM',
            sourceName: 'ExamSaathi Verified SSC Question Bank',
            sourceUrl: 'https://github.com/aman310762-cmd/examsaathi',
            sourceDomain: 'github.com',
            retrievedAt: now,
            isOfficial: false,
            extractedAnswer: letterAnswer,
            contentHash: cglHash,
            notes: '100% verified bilingual prompt, options, and explanation',
          },
        ],
        verificationStatus: 'SECONDARY_CONFIRMED',
        rightsStatus: 'PUBLIC_DOMAIN_OR_CLEAR',
        rightsSource: 'MIT Open-Source Question Bank',
        redistributionAllowed: true,
        contentHash: cglHash,
        corpusBucket: 'PRACTICE_MOCK',
        origin: 'authentic_import',
        ingestionState: 'VERIFIED',
      });
    }

    qNumber++;
  }

  console.log('--- Candidate Preparation Summary ---');
  console.log(`SSC_CHSL Candidates prepared: ${chslCandidates.length}`);
  console.log(`SSC_CGL Candidates prepared:  ${cglCandidates.length}`);
  console.log('Subject distribution:', subjectStats);
  console.log('Difficulty distribution:', diffStats);

  console.log('\nSample CHSL Candidate 0:');
  console.log(`  ID: ${chslCandidates[0].questionId}`);
  console.log(`  Subject: ${chslCandidates[0].subject} (${chslCandidates[0].topic})`);
  console.log(`  Answer: ${chslCandidates[0].correctAnswer}`);
  console.log(`  Question Text Preview:\n    ${chslCandidates[0].questionText.replace('\n', '\n    ')}`);
  console.log(`  Options:\n    ${chslCandidates[0].options?.join('\n    ')}\n`);

  if (!isExecute) {
    console.log('[DRY-RUN] Audit complete. To ingest into Firestore, run with --execute.');
    console.log('[DRY-RUN] To also index embeddings into Pinecone, run with --execute --embed.');
    return;
  }

  // Phase 1: Ingest SSC_CHSL into Firestore
  console.log(`\n[Phase 1/3] Ingesting ${chslCandidates.length} questions for SSC_CHSL into Firestore...`);
  const BATCH_SIZE = 50;
  for (let i = 0; i < chslCandidates.length; i += BATCH_SIZE) {
    const chunk = chslCandidates.slice(i, i + BATCH_SIZE);
    await pyqRepository.saveCanonicalQuestionsBatch(chunk);
    process.stdout.write(`   Written CHSL questions ${i + 1} to ${Math.min(i + BATCH_SIZE, chslCandidates.length)}\r`);
  }
  console.log(`\n✅ Successfully ingested ${chslCandidates.length} questions for SSC_CHSL.`);

  // Phase 2: Ingest SSC_CGL practice candidates into Firestore
  console.log(`\n[Phase 2/3] Ingesting ${cglCandidates.length} questions for SSC_CGL into Firestore...`);
  for (let i = 0; i < cglCandidates.length; i += BATCH_SIZE) {
    const chunk = cglCandidates.slice(i, i + BATCH_SIZE);
    await pyqRepository.saveCanonicalQuestionsBatch(chunk);
    process.stdout.write(`   Written CGL questions ${i + 1} to ${Math.min(i + BATCH_SIZE, cglCandidates.length)}\r`);
  }
  console.log(`\n✅ Successfully ingested ${cglCandidates.length} questions for SSC_CGL.`);

  // Phase 3: Optional Vector Indexing to Pinecone
  if (doEmbed) {
    console.log('\n[Phase 3/3] Generating embeddings and indexing to Pinecone (production)...');
    const namespace = env.PINECONE_NAMESPACE;
    const vectorsBuffer: any[] = [];
    const pineconeBatchSize = 20;

    // Index CHSL candidates
    for (let i = 0; i < chslCandidates.length; i++) {
      const q = chslCandidates[i];
      const embeddingText = formatEmbeddingText(q);

      if (i > 0) await new Promise((r) => setTimeout(r, 200));

      const embedding = await generateResilientEmbedding(embeddingText);
      const vectorId = `vec_${q.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      const metadata = {
        content_type: 'pyq',
        corpusBucket: q.corpusBucket || 'PRACTICE_MOCK',
        vectorKind: 'CANONICAL_PYQ_QUESTION',
        public: true,
        answerAvailable: true,
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
        correctAnswer: q.correctAnswer,
        hasDiagram: false,
        createdAt: now,
        uploadedAt: new Date(now).toISOString(),
      };

      vectorsBuffer.push({ id: vectorId, values: embedding, metadata });
      process.stdout.write(`   Embedded CHSL Q${i + 1}/${chslCandidates.length}\r`);

      if (vectorsBuffer.length >= pineconeBatchSize || i === chslCandidates.length - 1) {
        const toUpsert = vectorsBuffer.splice(0);
        let upsertOk = false;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            await pineconeService.upsertVectors(toUpsert, namespace);
            upsertOk = true;
            break;
          } catch (pErr: any) {
            console.warn(`\n   [Pinecone] Upsert retry ${attempt}/5 failed: ${pErr.message}. Waiting 3s...`);
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
        if (!upsertOk) {
          throw new Error('Failed to upsert to Pinecone after 5 attempts');
        }
      }
    }

    console.log(`\n✅ Upserted ${chslCandidates.length} vectors to Pinecone namespace "${namespace}".`);

    // Flag vectorIndexed in Firestore
    console.log('Updating vectorIndexed flags in Firestore...');
    for (let i = 0; i < chslCandidates.length; i += BATCH_SIZE) {
      const chunk = chslCandidates.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const q of chunk) {
        const ref = db.collection('pyq_questions').doc(q.questionId);
        batch.update(ref, { vectorIndexed: true, vectorIndexedAt: Date.now(), updatedAt: Date.now() });
      }
      await batch.commit();
    }
    console.log('✅ Updated Firestore vectorIndexed flags.');
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('🎉 SSC CHSL & CGL INGESTION COMPLETED SUCCESSFULLY!');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n❌ Fatal error in SSC question bank ingestion:', err);
  process.exit(1);
});
