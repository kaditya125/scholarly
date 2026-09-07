import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import { db } from '../../../src/config/firebase';
import { env } from '../../../src/config/env';
import { pyqRepository } from '../../../src/repositories/pyq.repository';
import { pyqVectorIngestionService } from '../../../src/services/pyq/pyqVectorIngestion.service';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { CanonicalPYQQuestion } from '../../../src/types/pyq.types';

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

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`🚀 UPSC PRELIMS 2020 GS-I INGESTION & EMBEDDING PIPELINE`);
  console.log(`   Mode: ${isExecute ? 'LIVE EXECUTION (--execute)' : 'DRY-RUN (audit only)'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const baseDir = path.resolve('D:/scholarly/backend-firestore');
  const candPath = path.join(baseDir, 'scripts/pyq/official/out/UPSC-CSE-PRELIMS-GS1-2020/candidates.json');

  if (!fs.existsSync(candPath)) {
    throw new Error(`Candidates file missing at ${candPath}`);
  }

  const rawCandidates: any[] = JSON.parse(fs.readFileSync(candPath, 'utf8'));
  console.log(`Loaded ${rawCandidates.length} candidate questions for 2020.`);

  if (rawCandidates.length !== 100) {
    throw new Error(`Expected exactly 100 questions, got ${rawCandidates.length}`);
  }

  // Validate every candidate
  const cleanCandidates: CanonicalPYQQuestion[] = rawCandidates.map((raw) => {
    if (!['A', 'B', 'C', 'D'].includes(raw.correctAnswer)) {
      throw new Error(`Question ${raw.questionNumber} has invalid answer: '${raw.correctAnswer}'`);
    }
    const { _review, ...clean } = raw;
    return clean as CanonicalPYQQuestion;
  });

  console.log(`✅ All 100 questions verified with valid Set A answers.`);

  if (!isExecute) {
    console.log('\n[Dry-Run] Would write 100 questions to Firestore (pyq_questions) in VERIFIED state.');
    console.log('[Dry-Run] Would embed 100 questions and index to Pinecone (production) with public=true, answerAvailable=true.');
    console.log('\nTo execute, run with --execute.');
    return;
  }

  // Phase 1: Write to Firestore
  console.log('\n[Phase 1/2] Writing 100 questions to Firestore collection "pyq_questions"...');
  await pyqRepository.saveCanonicalQuestionsBatch(cleanCandidates);
  console.log('✅ Firestore batch write successful.\n');

  // Phase 2: Embed and Index to Pinecone
  console.log('[Phase 2/2] Generating embeddings and indexing to Pinecone (production)...');
  const namespace = env.PINECONE_NAMESPACE;
  const vectorsBuffer: any[] = [];
  const batchSize = 20;

  for (let i = 0; i < cleanCandidates.length; i++) {
    const q = cleanCandidates[i];
    const embeddingText = pyqVectorIngestionService.formatQuestionForEmbedding(q);
    
    // Slight pacing to avoid sudden burst
    if (i > 0) await new Promise((r) => setTimeout(r, 400));

    const embedding = await generateResilientEmbedding(embeddingText);
    const vectorId = `vec_${q.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const metadata = {
      content_type: 'pyq',
      corpusBucket: q.corpusBucket || 'OFFICIAL_PYQ',
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
      createdAt: q.createdAt,
      uploadedAt: new Date(q.createdAt).toISOString(),
    };

    vectorsBuffer.push({ id: vectorId, values: embedding, metadata });
    process.stdout.write(`   Embedded Q${q.questionNumber} (${i + 1}/100)\r`);

    if (vectorsBuffer.length >= batchSize || i === cleanCandidates.length - 1) {
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
      console.log(`\n   Upserted batch of ${toUpsert.length} vectors to Pinecone namespace "${namespace}".`);
    }
  }

  // Update vectorIndexed status in Firestore
  console.log('\n[Phase 2.5] Updating vectorIndexed=true in Firestore...');
  const firestoreBatch = db.batch();
  for (const q of cleanCandidates) {
    const docRef = db.collection('pyq_questions').doc(q.questionId);
    firestoreBatch.update(docRef, {
      vectorIndexed: true,
      vectorIndexedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  await firestoreBatch.commit();
  console.log('✅ Firestore vectorIndexed flags updated.\n');

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🎉 2020 INGESTION & EMBEDDING COMPLETED SUCCESSFULLY!');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n❌ Fatal error in 2020 ingestion:', err);
  process.exit(1);
});
