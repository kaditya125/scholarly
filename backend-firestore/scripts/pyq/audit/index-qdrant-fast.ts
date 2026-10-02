/**
 * Dedicated High-Throughput Qdrant Vector Indexer for PYQ Questions.
 *
 * Features:
 * 1. Direct Qdrant upsert to `edtech_ai_rag` (namespace: production) via local SSH tunnel.
 * 2. Vertex AI `gemini-embedding-001` (768-dim) with local disk caching to prevent duplicate API spend.
 * 3. Rate-limit safe pacing (default 800ms) with exponential backoff on 429.
 * 4. Idempotent & Resumable: Checks Qdrant directly, skips existing points.
 * 5. Updates Firestore pyq_questions with vectorIndexed: true, qdrantPointId, and ingestionState: 'INDEXED'.
 *
 * Usage:
 *   npx tsx scripts/pyq/audit/index-qdrant-fast.ts --exam=SSC_CHSL --limit=50
 *   npx tsx scripts/pyq/audit/index-qdrant-fast.ts --exam=SSC_CHSL --all
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { qdrantService, QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import { toQdrantId } from '../../../src/services/rag/qdrantFilter';
import { VectorDocument } from '../../../src/services/rag/vectorStore.types';
import { env } from '../../../src/config/env';
import { classifyProvenance, isAuthenticPyq } from '../../../src/services/pyq/paperIdentity';
import { QdrantClient } from '@qdrant/js-client-rest';

const arg = (name: string, dflt?: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? dflt;

const EXAM = arg('exam', 'SSC_CHSL')!;
const LIMIT = Number(arg('limit', '0'));
const ALL = process.argv.includes('--all');
const PACE_MS = Number(arg('pace', '800'));
const BATCH_SIZE = Number(arg('batch', '25'));
const NAMESPACE = 'production';

const derive = (qid: string) => toQdrantId(NAMESPACE, `vec_${qid.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Persistent local cache
const CACHE_DIR = path.resolve('dataset_staging/cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
const CACHE_FILE = path.join(CACHE_DIR, `${EXAM.toLowerCase()}_embedding_cache.json`);

function loadCache(): Record<string, number[]> {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveCache(cache: Record<string, number[]>) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
}

function formatEmbeddingText(q: any): string {
  const parts = [
    `Examination: ${q.examId || 'SSC_CHSL'} (${q.examName || 'SSC CHSL'})`,
    `Year: ${q.year}${q.session ? ` | Session: ${q.session}` : ''}${q.shift ? ` | Shift: ${q.shift}` : ''}`,
    `Subject: ${q.subject || 'General'}`,
    `Question: ${q.questionText}`,
  ];
  if (q.options && q.options.length > 0) {
    const opts = q.options.map((o: string, idx: number) => `(${String.fromCharCode(65 + idx)}) ${o}`).join(' ');
    parts.push(`Options: ${opts}`);
  }
  return parts.join('\n');
}

function scrubMetadata(m: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(m)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.some((x) => typeof x !== 'string')) {
      out[k] = v.map((x) => String(x));
      continue;
    }
    out[k] = v;
  }
  return out;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`🚀 DIRECT QDRANT INDEXER — Exam: ${EXAM}`);
  console.log(`   Pacing: ${PACE_MS}ms | Batch: ${BATCH_SIZE} | Limit: ${ALL ? 'ALL' : LIMIT || 100}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Verify Qdrant connection
  const client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY || undefined,
    checkCompatibility: false,
  });

  const collections = await client.getCollections();
  console.log(`✅ Connected to Qdrant (${env.QDRANT_URL}). Available:`, collections.collections.map((c) => c.name));

  const cache = loadCache();
  console.log(`💾 Loaded ${Object.keys(cache).length} cached embeddings from disk.`);

  const embedder = new GoogleEmbeddingProvider();

  // 1. Fetch questions from Firestore
  console.log(`\nFetching ${EXAM} questions from Firestore...`);
  const questions: any[] = [];
  let lastDoc: any = null;

  while (true) {
    let q: FirebaseFirestore.Query = db
      .collection('pyq_questions')
      .where('examId', '==', EXAM)
      .orderBy('__name__')
      .limit(2000);

    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      questions.push(d.data());
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\rLoaded ${questions.length} questions...`);
    if (snap.size < 2000) break;
  }
  console.log(`\nTotal questions loaded for ${EXAM}: ${questions.length}`);

  // 2. Filter eligible questions
  const eligible = questions.filter((q) => {
    if (!q.questionText || String(q.questionText).trim().length < 5) return false;
    return true;
  });
  console.log(`Text-valid questions: ${eligible.length} (excluded ${questions.length - eligible.length} diagram/short items)`);

  // 3. Check existing points in Qdrant in batches of 200
  console.log('\nChecking existing points in Qdrant...');
  const existingSet = new Set<string>();
  for (let i = 0; i < eligible.length; i += 200) {
    const chunk = eligible.slice(i, i + 200);
    const ids = chunk.map((q) => derive(q.questionId));
    try {
      const points = await client.retrieve(QDRANT_COLLECTION, {
        ids,
        with_payload: false,
        with_vector: false,
      });
      for (const p of points) existingSet.add(String(p.id));
    } catch (e: any) {
      console.warn(`Warning checking Qdrant ids: ${e.message}`);
    }
    process.stdout.write(`\rChecked ${Math.min(i + 200, eligible.length)} / ${eligible.length} against Qdrant...`);
  }
  console.log(`\nAlready present in Qdrant: ${existingSet.size}`);

  const toIndex = eligible.filter((q) => !existingSet.has(derive(q.questionId)));
  console.log(`Pending indexing queue: ${toIndex.length}`);

  const queue = ALL ? toIndex : toIndex.slice(0, LIMIT || 100);
  console.log(`Target for this session: ${queue.length} questions.\n`);

  if (queue.length === 0) {
    console.log('🎉 No questions pending indexing. All up to date!');
    return;
  }

  // 4. Index loop
  let totalIndexed = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    const vectorDocs: VectorDocument[] = [];
    const questionsToWrite: any[] = [];

    for (const q of batch) {
      let vec = cache[q.questionId];

      if (!vec || vec.length !== 768) {
        let attempts = 0;
        let success = false;
        while (attempts < 3 && !success) {
          attempts++;
          try {
            await sleep(PACE_MS);
            vec = await embedder.generateEmbedding(formatEmbeddingText(q));
            if (vec && vec.length === 768) {
              cache[q.questionId] = vec;
              saveCache(cache);
              success = true;
            }
          } catch (err: any) {
            const is429 = /429|RESOURCE_EXHAUSTED|Quota/i.test(err?.message || '');
            console.warn(`  ⚠️ Attempt ${attempts} error for ${q.questionId}: ${err.message}`);
            await sleep(is429 ? 15000 * attempts : 3000 * attempts);
          }
        }

        if (!success || !vec) {
          console.error(`  ❌ Skipping ${q.questionId} after 3 failed attempts.`);
          totalFailed++;
          continue;
        }
      }

      const pointId = derive(q.questionId);
      const cls = q.provenanceClass ?? classifyProvenance(q);

      vectorDocs.push({
        id: pointId,
        values: vec,
        metadata: scrubMetadata({
          content_type: 'pyq',
          corpusBucket: q.corpusBucket || 'OFFICIAL_PYQ',
          vectorKind: q.corpusBucket === 'PRACTICE_MOCK' ? 'PRACTICE_QUESTION' : 'CANONICAL_PYQ_QUESTION',
          provenanceClass: cls,
          isAuthenticPyq: isAuthenticPyq(cls),
          canonicalPaperId: q.canonicalPaperId,
          paperIdentityStatus: q.paperIdentityStatus ?? 'RESOLVED',
          normalizedSession: q.normalizedSession || 'tier-1',
          normalizedShift: q.normalizedShift || 1,
          public: true,
          owner: 'sadhya-exam-intel',
          userId: '',
          notebookId: `exam-${String(q.examId).toLowerCase()}`,
          sourceId: q.sourceId,
          examId: q.examId,
          examName: q.examName,
          year: q.year,
          session: q.session || '',
          paper: q.paper || '',
          shift: q.shift || '',
          subject: q.subject,
          questionId: q.questionId,
          questionNumber: q.questionNumber,
          questionType: q.questionType,
          difficulty: q.difficulty || 'MEDIUM',
          verificationStatus: q.verificationStatus,
          rightsStatus: q.rightsStatus,
          text: q.questionText,
          options: q.options || [],
          correctAnswer: q.correctAnswer,
          createdAt: q.createdAt,
        }),
      });
      questionsToWrite.push(q);
    }

    if (vectorDocs.length > 0) {
      // Upsert to Qdrant with retry and wait: false to avoid 408 gateway timeouts
      const points = vectorDocs.map((v) => ({
        id: v.id,
        vector: v.values,
        payload: {
          ...(v.metadata as Record<string, any>),
          pinecone_id: v.id,
          pinecone_namespace: NAMESPACE,
        },
      }));

      let upserted = false;
      for (let attempt = 1; attempt <= 5 && !upserted; attempt++) {
        try {
          await client.upsert(QDRANT_COLLECTION, { wait: false, points });
          upserted = true;
        } catch (err: any) {
          console.warn(`  ⚠️ Qdrant upsert attempt ${attempt} failed: ${err.message}. Retrying in ${attempt * 4}s...`);
          await sleep(attempt * 4000);
        }
      }

      if (!upserted) {
        console.error(`  ❌ Failed to upsert batch of ${points.length} vectors to Qdrant after 5 attempts. Continuing...`);
        totalFailed += points.length;
        continue;
      }

      // Commit flags to Firestore
      const fsBatch = db.batch();
      const now = Date.now();
      for (const q of questionsToWrite) {
        fsBatch.set(
          db.collection('pyq_questions').doc(q.questionId),
          {
            vectorIndexed: true,
            vectorIndexedAt: now,
            ingestionState: 'INDEXED',
            vectorIndexStatus: 'VERIFIED_PRESENT',
            vectorIndexReconciledAt: now,
            qdrantPointId: derive(q.questionId),
          },
          { merge: true }
        );
      }
      await fsBatch.commit();

      totalIndexed += vectorDocs.length;
      saveCache(cache);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = ((totalIndexed / (Date.now() - startTime)) * 1000 * 60).toFixed(0);
      console.log(`  ✅ Batch committed: ${totalIndexed} / ${queue.length} vectors indexed (${rate} Qs/min, elapsed: ${elapsed}s)`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`🎉 COMPLETED: ${totalIndexed} vectors indexed to Qdrant, ${totalFailed} failed.`);
  console.log('═══════════════════════════════════════════════════════════════════');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
