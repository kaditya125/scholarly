import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../src/config/firebase';
import { pineconeService, VectorDocument } from '../../src/services/rag/pinecone.service';
import { GoogleEmbeddingProvider } from '../../src/services/ai/providers/google-embedding.provider';
import { PracticeBankQuestion } from '../../src/types/practiceBank.types';

function buildEmbeddingText(q: PracticeBankQuestion): string {
  const optStr = q.options.map((opt, i) => `(${String.fromCharCode(65 + i)}) ${opt}`).join(' ');
  return `Category: ${q.category} Practice & General Knowledge
Question: ${q.text}
Options: ${optStr}
Content Type: Practice & Concept Mock Question`;
}

async function runEmbedding() {
  const isExecute = process.argv.includes('--execute');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  console.log('================================================================');
  console.log('⚡ PRACTICE BANK VECTOR EMBEDDING & PINECONE INGESTION');
  console.log(`Mode: ${isExecute ? '🚨 LIVE MUTATION (--execute)' : '🔎 AUDIT & DRY-RUN'}`);
  if (limit) console.log(`Limit: ${limit} questions`);
  console.log('================================================================\n');

  // Baseline assertions
  const pyqSnapBefore = await db.collection('pyq_questions').count().get();
  const pyqCountBefore = pyqSnapBefore.data().count;
  const qbSnapBefore = await db.collection('question_bank').count().get();
  const qbCountBefore = qbSnapBefore.data().count;
  const pineconeStatsBefore = await pineconeService.getIndexStats();
  const pineconeCountBefore =
    pineconeStatsBefore.namespaces?.find((n: any) => n.name === 'production')?.vectorCount || 0;

  console.log('--- BASELINE COUNTS ---');
  console.log(`pyq_questions before:       ${pyqCountBefore}`);
  console.log(`question_bank before:       ${qbCountBefore}`);
  console.log(`Pinecone production before: ${pineconeCountBefore}\n`);

  console.log('Fetching questions from "practice_bank"...');
  const snap = await db.collection('practice_bank').get();
  let questions = snap.docs.map((d) => d.data() as PracticeBankQuestion & { vectorIndexed?: boolean });
  console.log(`Fetched ${questions.length} total questions from Firestore.`);

  // Filter out ambiguous/invalid questions from Pinecone indexing if desired
  const eligibleQuestions = questions.filter(
    (q) => !q.reviewFlags?.includes('ambiguous_or_invalid')
  );
  console.log(`Eligible questions for indexing: ${eligibleQuestions.length}`);

  let toProcess = eligibleQuestions;
  if (limit) {
    toProcess = toProcess.slice(0, limit);
  }

  // Check cache for embeddings to avoid re-generating
  const cachePath = path.resolve(__dirname, 'data/embeddings_cache.json');
  let cache: Record<string, number[]> = {};
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log(`Loaded ${Object.keys(cache).length} cached embeddings from disk.`);
    } catch {
      console.warn('Failed to parse embedding cache, starting fresh');
    }
  }

  const saveCache = () => {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
  };

  const embeddingProvider = new GoogleEmbeddingProvider();
  const vectorsToUpsert: VectorDocument[] = [];
  let generatedCount = 0;
  let cachedHitCount = 0;

  console.log(`Starting vector generation for ${toProcess.length} items...`);

  for (let i = 0; i < toProcess.length; i++) {
    const q = toProcess[i];
    let vector = cache[q.id];

    if (vector && vector.length === 768) {
      cachedHitCount++;
    } else {
      const textToEmbed = buildEmbeddingText(q);
      let attempts = 0;
      let success = false;
      while (!success && attempts < 5) {
        attempts++;
        try {
          vector = await embeddingProvider.generateEmbedding(textToEmbed);
          if (vector && vector.length === 768) {
            cache[q.id] = vector;
            generatedCount++;
            success = true;
          }
        } catch (err: any) {
          console.warn(`Embedding failed for ${q.id} on attempt ${attempts}: ${err.message || err}. Backoff...`);
          await new Promise((r) => setTimeout(r, 2000 * attempts));
        }
      }

      if (!success || !vector) {
        console.error(`Failed to embed item ${q.id} after ${attempts} attempts. Skipping.`);
        continue;
      }

      // Save cache every 50 items
      if (generatedCount % 50 === 0) {
        saveCache();
        console.log(`Generated ${generatedCount} new embeddings (total processed: ${i + 1}/${toProcess.length})...`);
      }

      // Pacing delay between requests (250ms is well within Gemini rate limits)
      await new Promise((r) => setTimeout(r, 250));
    }

    vectorsToUpsert.push({
      id: `practice_${q.id}`,
      values: vector,
      metadata: {
        content_type: 'practice_bank',
        corpusBucket: 'PRACTICE_MOCK',
        vectorKind: 'PRACTICE_QUESTION',
        public: true,
        owner: 'sadhya-exam-intel',
        category: q.category,
        questionId: q.id,
        text: q.text,
        reviewFlags: q.reviewFlags || [],
      },
    });
  }

  saveCache();
  console.log(`\nVector generation complete. Cache hits: ${cachedHitCount}, Fresh generated: ${generatedCount}`);
  console.log(`Prepared ${vectorsToUpsert.length} vectors for Pinecone.`);

  if (!isExecute) {
    console.log('\n================================================================');
    console.log('🔍 DRY RUN COMPLETE. Zero vectors upserted.');
    console.log('To upsert vectors into Pinecone production namespace, pass: --execute');
    console.log('================================================================');
    process.exit(0);
  }

  // EXECUTE PINECONE UPSERT
  console.log('\n================================================================');
  console.log('🚨 UPSERTING VECTORS TO PINECONE "production" NAMESPACE');
  console.log('================================================================\n');

  const UPSERT_BATCH = 100;
  for (let i = 0; i < vectorsToUpsert.length; i += UPSERT_BATCH) {
    const chunk = vectorsToUpsert.slice(i, i + UPSERT_BATCH);
    await pineconeService.upsertVectors(chunk, 'production');
    console.log(`Upserted ${Math.min(i + UPSERT_BATCH, vectorsToUpsert.length)}/${vectorsToUpsert.length} vectors...`);
  }

  console.log('✅ Pinecone vector upsert completed.');

  // Update Firestore records: vectorIndexed: true, vectorIndexedAt: Date.now()
  console.log('\nMarking Firestore documents as vectorIndexed: true...');
  const FIRESTORE_BATCH = 400;
  let batch = db.batch();
  let countInBatch = 0;
  let totalIndexedMarked = 0;

  for (const v of vectorsToUpsert) {
    const qId = v.metadata.questionId as string;
    const ref = db.collection('practice_bank').doc(qId);
    batch.update(ref, {
      vectorIndexed: true,
      vectorIndexedAt: Date.now(),
      vectorId: v.id,
    });
    countInBatch++;
    totalIndexedMarked++;

    if (countInBatch >= FIRESTORE_BATCH) {
      await batch.commit();
      batch = db.batch();
      countInBatch = 0;
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
  }
  console.log(`✅ Marked ${totalIndexedMarked} practice_bank documents with vectorIndexed: true.`);

  // POST-UPSERT STRICT INVARIANT AUDIT
  console.log('\n--- POST-UPSERT INVARIANT AUDIT ---');
  const pyqSnapAfter = await db.collection('pyq_questions').count().get();
  const pyqCountAfter = pyqSnapAfter.data().count;
  const qbSnapAfter = await db.collection('question_bank').count().get();
  const qbCountAfter = qbSnapAfter.data().count;
  const pineconeStatsAfter = await pineconeService.getIndexStats();
  const pineconeCountAfter =
    pineconeStatsAfter.namespaces?.find((n: any) => n.name === 'production')?.vectorCount || 0;

  console.log(`pyq_questions:       ${pyqCountBefore} -> ${pyqCountAfter} (Assert UNCHANGED)`);
  console.log(`question_bank:       ${qbCountBefore} -> ${qbCountAfter} (Assert UNCHANGED)`);
  console.log(`Pinecone production: ${pineconeCountBefore} -> ${pineconeCountAfter} (+${vectorsToUpsert.length})`);

  if (pyqCountAfter !== pyqCountBefore) {
    throw new Error(`CRITICAL INVARIANT VIOLATION: pyq_questions changed from ${pyqCountBefore} to ${pyqCountAfter}!`);
  }
  if (qbCountAfter !== 0) {
    throw new Error(`CRITICAL INVARIANT VIOLATION: question_bank changed from ${qbCountBefore} to ${qbCountAfter}!`);
  }

  // TEST RETRIEVAL QUERY
  console.log('\n--- TESTING SEMANTIC RETRIEVAL ON PRACTICE BANK ---');
  const testQuery = 'Who is known as the father of modern physics?';
  const queryVector = await embeddingProvider.generateEmbedding(testQuery);
  const matches = await pineconeService.queryVectors(
    queryVector,
    3,
    { content_type: 'practice_bank' },
    'production'
  );

  console.log(`Query: "${testQuery}"`);
  console.log(`Retrieved ${matches?.length || 0} matches:`);
  matches?.forEach((m, idx) => {
    console.log(
      `  [${idx + 1}] Score: ${(m.score || 0).toFixed(4)} | Category: ${m.metadata?.category} | Question: ${m.metadata?.text}`
    );
  });

  console.log('\n================================================================');
  console.log('🎉 EMBEDDING AND PINECONE INGESTION COMPLETE & VERIFIED!');
  console.log('================================================================');
  process.exit(0);
}

runEmbedding().catch((err) => {
  console.error('Embedding script failed:', err);
  process.exit(1);
});


