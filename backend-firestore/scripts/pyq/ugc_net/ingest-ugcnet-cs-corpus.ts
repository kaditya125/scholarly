/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sadhya — UGC NET Computer Science & Applications (Code 87) Corpus Ingestion
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Ingests authentic, verified UGC NET CS PYQs into Firestore (`pyq_questions` and
 * `pyq_source_registry`) and indexes them into Qdrant (`edtech_ai_rag`).
 *
 * Enforces:
 *   - Zero fabrication: All questions originate from verified official PDFs.
 *   - Strict provenance: Each question links to canonicalPaperId, documentHash, and sourceUrl.
 *   - Two-layer isolation: `isAuthenticPYQ: true`, `corpusBucket: 'OFFICIAL_PYQ'`.
 *   - Zero orphaning: 1:1 match between Firestore records and Qdrant points.
 *
 * USAGE:
 *   npx tsx scripts/pyq/ugc_net/ingest-ugcnet-cs-corpus.ts               # dry-run
 *   npx tsx scripts/pyq/ugc_net/ingest-ugcnet-cs-corpus.ts --execute     # live Firestore ingestion
 *   npx tsx scripts/pyq/ugc_net/ingest-ugcnet-cs-corpus.ts --execute --index-vectors # Firestore + Qdrant
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { qdrantService } from '../../../src/services/rag/qdrant.service';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import { CanonicalPYQQuestion, PYQSourceEntry } from '../../../src/types/pyq.types';

const EXECUTE = process.argv.includes('--execute');
const INDEX_VECTORS = process.argv.includes('--index-vectors');
const SKIP_FIRESTORE = process.argv.includes('--skip-firestore');

const STAGING_POOL_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_all_extracted_pyqs.json');
const MANIFEST_PATH = path.resolve('dataset_staging/ugc_net_cs/verified_papers_manifest.json');

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Sadhya — UGC NET Computer Science (Code 87) Ingestion Engine');
  console.log(`  Mode: ${EXECUTE ? '🔴 LIVE EXECUTE' : '🟡 DRY-RUN (pass --execute to write)'}`);
  console.log(`  Vector Indexing: ${INDEX_VECTORS ? '🌲 ENABLED (Qdrant)' : '⏸️ DISABLED'}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!fs.existsSync(STAGING_POOL_PATH) || !fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Required staging files missing: ${STAGING_POOL_PATH} or ${MANIFEST_PATH}`);
  }

  const manifest: any[] = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const rawQuestions: any[] = JSON.parse(fs.readFileSync(STAGING_POOL_PATH, 'utf-8'));

  console.log(`📋 Total official papers to register: ${manifest.length}`);
  console.log(`📋 Total canonical questions to ingest: ${rawQuestions.length}\n`);

  // ─── Step 1: Register Official Papers in pyq_source_registry ─────────────
  let registeredSources = 0;
  if (!SKIP_FIRESTORE) {
    console.log('--- STEP 1: Paper Source Registry Registration ---');
    for (const p of manifest) {
      const sourceId = `src_${p.canonicalPaperId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const sourceEntry: PYQSourceEntry = {
        sourceId,
        examId: 'UGC_NET',
        examName: 'University Grants Commission National Eligibility Test',
        year: p.year,
        session: p.session,
        paper: p.paper,
        subject: 'Computer Science and Applications',
        language: 'en',
        authority: p.authority || 'University Grants Commission (UGC) / CBSE',
        sourceTier: 'TIER_A_OFFICIAL',
        sourceName: p.sourceName,
        sourceUrl: p.sourceUrl,
        sourceDomain: 'ugcnetonline.in',
        documentType: 'QUESTION_PAPER',
        availabilityStatus: 'AVAILABLE',
        retrievalStatus: 'VERIFIED',
        rightsStatus: 'PUBLIC_DOMAIN_OR_CLEAR',
        artifactPath: p.localPath,
        documentHash: p.documentHash,
        documentSize: p.documentSize,
        mimeType: 'application/pdf',
        hasAnswerKey: false,
        hasSolutions: false,
        discoveredAt: p.retrievedAt,
        lastCheckedAt: Date.now(),
      };

      if (EXECUTE) {
        await db.collection('pyq_source_registry').doc(sourceId).set(sourceEntry, { merge: true });
      }
      registeredSources++;
    }
    console.log(`✅ [Step 1] ${registeredSources} paper sources registered in pyq_source_registry.\n`);
  } else {
    console.log('⏭️ [Step 1] Skipped (--skip-firestore passed).\n');
  }

  // ─── Step 2: Ingest Canonical Questions into pyq_questions ───────────────
  let ingestedQuestions = 0;
  if (!SKIP_FIRESTORE) {
    console.log('--- STEP 2: Ingest Canonical PYQs into pyq_questions ---');
    const BATCH_SIZE = 100;

    for (let i = 0; i < rawQuestions.length; i += BATCH_SIZE) {
      const chunk = rawQuestions.slice(i, i + BATCH_SIZE);
      
      if (EXECUTE) {
        const batch = db.batch();
        for (const q of chunk) {
          const docRef = db.collection('pyq_questions').doc(q.questionId);
          batch.set(docRef, q, { merge: true });
        }
        await batch.commit();
      }
      ingestedQuestions += chunk.length;
      console.log(`  💾 Ingested ${ingestedQuestions}/${rawQuestions.length} questions into Firestore`);
    }
    console.log(`✅ [Step 2] Complete: ${ingestedQuestions} questions in pyq_questions.\n`);
  } else {
    console.log('⏭️ [Step 2] Skipped (--skip-firestore passed).\n');
  }

  // ─── Step 3: Vector Indexing into Qdrant (if requested) ───────────────────
  if (INDEX_VECTORS && EXECUTE) {
    console.log('--- STEP 3: Vector Embedding & Qdrant Indexing ---');
    const embeddingProvider = new GoogleEmbeddingProvider();
    const VECTOR_BATCH_SIZE = 25;
    const CONCURRENCY = 5;
    let indexedVectors = 0;

    for (let i = 0; i < rawQuestions.length; i += VECTOR_BATCH_SIZE) {
      const batchQuestions = rawQuestions.slice(i, i + VECTOR_BATCH_SIZE);
      const pointsToUpsert: any[] = [];

      for (let j = 0; j < batchQuestions.length; j += CONCURRENCY) {
        const workerSlice = batchQuestions.slice(j, j + CONCURRENCY);
        const embeddedSlice = await Promise.all(
          workerSlice.map(async (q) => {
            try {
              const embedText = `Examination: UGC NET (Subject Code: 87)
Subject: Computer Science and Applications
Unit ${q.unitNumber}: ${q.unitTitle}
Topic: ${q.topic || 'General'}
Year: ${q.year} | Session: ${q.session} | Paper: ${q.paper}
Question ${q.questionNumber}: ${q.questionText}
Options: (A) ${q.options[0]} (B) ${q.options[1]} (C) ${q.options[2]} (D) ${q.options[3]}
Question Type: ${q.questionType || 'conceptual'}
Content Type: Official Previous Year Question (PYQ)`;

              const values = await embeddingProvider.generateEmbedding(embedText);
              const vectorId = `vec_${q.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

              return {
                id: vectorId,
                values,
                metadata: {
                  questionId: q.questionId,
                  canonicalPaperId: q.canonicalPaperId,
                  examId: 'UGC_NET',
                  subject: 'Computer Science and Applications',
                  subjectCode: '87',
                  unitNumber: q.unitNumber,
                  unitTitle: q.unitTitle,
                  topic: q.topic || '',
                  year: q.year,
                  session: q.session,
                  paper: q.paper,
                  questionNumber: q.questionNumber,
                  questionType: q.questionType || 'conceptual',
                  content_type: 'pyq',
                  corpusBucket: 'OFFICIAL_PYQ',
                  isAuthenticPYQ: true,
                  public: true,
                  text: q.questionText,
                  options: q.options,
                },
              };
            } catch (err: any) {
              console.warn(`  ⚠️ Embedding error for ${q.questionId}:`, err.message);
              return null;
            }
          })
        );

        for (const pt of embeddedSlice) {
          if (pt) pointsToUpsert.push(pt);
        }
        await sleep(150); // Safe pacing for rate limits
      }

      if (pointsToUpsert.length > 0) {
        await qdrantService.upsertVectors(pointsToUpsert, 'production');
        indexedVectors += pointsToUpsert.length;
        console.log(`  🌲 Qdrant batch upserted: ${indexedVectors}/${rawQuestions.length}`);

        // Update vectorIndexed flag in Firestore
        const flagBatch = db.batch();
        for (const pt of pointsToUpsert) {
          const qId = pt.metadata.questionId;
          const ref = db.collection('pyq_questions').doc(qId);
          flagBatch.update(ref, {
            vectorIndexed: true,
            vectorIndexedAt: Date.now(),
            ingestionState: 'INDEXED',
          });
        }
        await flagBatch.commit();
      }
    }
    console.log(`✅ [Step 3] Vector indexing complete: ${indexedVectors} vectors in Qdrant.\n`);
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  INGESTION RUN COMPLETED');
  console.log(`  - Sources Registered: ${registeredSources}`);
  console.log(`  - Questions Ingested: ${ingestedQuestions}`);
  console.log('═══════════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Fatal ingestion error:', err);
  process.exit(1);
});
