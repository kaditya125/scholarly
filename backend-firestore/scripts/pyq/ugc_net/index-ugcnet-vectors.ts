/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sadhya — UGC NET Computer Science & Applications (Code 87) Vector Indexer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Resumable, rate-limit safe vector embedding and Qdrant indexing engine.
 *
 * Features:
 *   - Local JSON persistent cache (dataset_staging/ugc_net_cs/ugc_net_cs_embedding_cache.json)
 *   - Controlled request pacing (750ms per request) to prevent Vertex AI 429 quota exhaustion
 *   - Exponential retry backoff on transient errors
 *   - Batch upserts into Qdrant collection `edtech_ai_rag` (namespace: production)
 *   - Updates Firestore records with vectorIndexed: true, vectorIndexedAt, and ingestionState: 'INDEXED'
 *   - Supports --limit=<N> for staged indexing or full run
 *
 * USAGE:
 *   npx tsx scripts/pyq/ugc_net/index-ugcnet-vectors.ts --limit=100      # index top 100 benchmark set
 *   npx tsx scripts/pyq/ugc_net/index-ugcnet-vectors.ts --all            # index all 1349 questions
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { qdrantService } from '../../../src/services/rag/qdrant.service';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import { VectorDocument } from '../../../src/services/rag/vectorStore.types';

const POOL_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_all_extracted_pyqs.json');
const CACHE_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_embedding_cache.json');

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
const INDEX_ALL = process.argv.includes('--all');

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildEmbedText(q: any): string {
  return `Examination: UGC NET (Subject Code: 87)
Subject: Computer Science and Applications
Unit ${q.unitNumber}: ${q.unitTitle}
Topic: ${q.topic || 'General'}
Year: ${q.year} | Session: ${q.session} | Paper: ${q.paper}
Question ${q.questionNumber}: ${q.questionText}
Options: (A) ${q.options[0]} (B) ${q.options[1]} (C) ${q.options[2]} (D) ${q.options[3]}
Question Type: ${q.questionType || 'conceptual'}
Content Type: Official Previous Year Question (PYQ)`;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Sadhya — UGC NET Computer Science (Code 87) Vector Indexer');
  console.log(`  Limit: ${LIMIT ? `${LIMIT} questions` : INDEX_ALL ? 'ALL (1349)' : 'Benchmark Set (120)'}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!fs.existsSync(POOL_PATH)) {
    throw new Error(`PYQ pool not found at: ${POOL_PATH}`);
  }

  const allQuestions: any[] = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));
  console.log(`📋 Total authentic questions in pool: ${allQuestions.length}`);

  // Load embedding cache
  let cache: Record<string, number[]> = {};
  if (fs.existsSync(CACHE_PATH)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
      console.log(`💾 Loaded ${Object.keys(cache).length} cached embeddings from disk.`);
    } catch {
      console.warn('⚠️ Could not parse cache file, initializing new cache.');
    }
  }

  const saveCache = () => {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
  };

  // If selecting a benchmark set, ensure balanced distribution across all 10 units
  let targetQuestions: any[] = [];
  const maxToProcess = LIMIT || (INDEX_ALL ? allQuestions.length : 120);

  if (maxToProcess < allQuestions.length) {
    // Pick evenly across units 1 to 10
    const perUnit = Math.ceil(maxToProcess / 10);
    const byUnit: Record<number, any[]> = {};
    for (let u = 1; u <= 10; u++) byUnit[u] = [];
    for (const q of allQuestions) {
      if (byUnit[q.unitNumber]) byUnit[q.unitNumber].push(q);
    }
    for (let u = 1; u <= 10; u++) {
      targetQuestions.push(...byUnit[u].slice(0, perUnit));
    }
    targetQuestions = targetQuestions.slice(0, maxToProcess);
  } else {
    targetQuestions = allQuestions;
  }

  console.log(`🎯 Target questions to embed and index: ${targetQuestions.length}\n`);

  const embeddingProvider = new GoogleEmbeddingProvider();
  const UPSERT_BATCH_SIZE = 20;
  let batchToUpsert: VectorDocument[] = [];
  let indexedCount = 0;
  let newEmbeddingsGenerated = 0;

  for (let i = 0; i < targetQuestions.length; i++) {
    const q = targetQuestions[i];
    let values = cache[q.questionId];

    if (!values || values.length !== 768) {
      const textToEmbed = buildEmbedText(q);
      let success = false;
      let attempt = 0;

      while (!success && attempt < 4) {
        attempt++;
        try {
          values = await embeddingProvider.generateEmbedding(textToEmbed);
          if (values && values.length === 768) {
            cache[q.questionId] = values;
            newEmbeddingsGenerated++;
            success = true;
          }
        } catch (err: any) {
          console.warn(`  ⚠️ Embedding attempt ${attempt} failed for ${q.questionId}: ${err.message}. Backing off...`);
          await sleep(2500 * attempt);
        }
      }

      if (!success || !values) {
        console.error(`  ❌ Skipping ${q.questionId} after ${attempt} failed attempts.`);
        continue;
      }

      // Controlled rate pacing
      await sleep(750);

      // Save cache every 10 items
      if (newEmbeddingsGenerated % 10 === 0) {
        saveCache();
        console.log(`  💾 Cached ${newEmbeddingsGenerated} new embeddings (${i + 1}/${targetQuestions.length})...`);
      }
    }

    const vectorId = `vec_${q.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const doc: VectorDocument = {
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

    batchToUpsert.push(doc);

    // Commit batch to Qdrant & Firestore
    if (batchToUpsert.length >= UPSERT_BATCH_SIZE || i === targetQuestions.length - 1) {
      if (batchToUpsert.length > 0) {
        await qdrantService.upsertVectors(batchToUpsert, 'production');
        indexedCount += batchToUpsert.length;
        console.log(`  🌲 Upserted batch into Qdrant: ${indexedCount}/${targetQuestions.length}`);

        // Update Firestore
        const flagBatch = db.batch();
        for (const v of batchToUpsert) {
          const qId = (v.metadata as any).questionId;
          const ref = db.collection('pyq_questions').doc(qId);
          flagBatch.update(ref, {
            vectorIndexed: true,
            vectorIndexedAt: Date.now(),
            ingestionState: 'INDEXED',
          });
        }
        await flagBatch.commit();
        batchToUpsert = [];
      }
    }
  }

  saveCache();
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`✅ Vector Indexing Complete!`);
  console.log(`  - Total Processed: ${targetQuestions.length}`);
  console.log(`  - Total Upserted to Qdrant: ${indexedCount}`);
  console.log(`  - New Embeddings Generated: ${newEmbeddingsGenerated}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('Fatal vector indexing error:', err);
  process.exit(1);
});
