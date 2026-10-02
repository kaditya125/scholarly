/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sadhya — UGC NET CS High-Yield Benchmark Vector Indexer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Selects 2 high-yield authentic exemplar PYQs per unit (20 total across all 10 units)
 * and indexes them into Qdrant with safe 4.5s request pacing to respect Vertex AI quota.
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { qdrantService } from '../../../src/services/rag/qdrant.service';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import { VectorDocument } from '../../../src/services/rag/vectorStore.types';

const POOL_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_all_extracted_pyqs.json');
const CACHE_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_embedding_cache.json');

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
  console.log('  Sadhya — UGC NET CS Benchmark Vector Indexer (10 Units x 2 Qs)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!fs.existsSync(POOL_PATH)) {
    throw new Error(`PYQ pool not found: ${POOL_PATH}`);
  }

  const allQuestions: any[] = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));

  // Select 1 high-yield authentic question each from units 4, 5, 7, 8, 9
  const targetUnits = [4, 5, 7, 8, 9];
  const benchmarkSelection: any[] = [];
  for (const u of targetUnits) {
    const unitQs = allQuestions.filter((q) => q.unitNumber === u && q.questionText.length > 50 && q.options.length === 4);
    if (unitQs.length > 0) benchmarkSelection.push(unitQs[0]);
  }

  console.log(`🎯 Selected ${benchmarkSelection.length} benchmark questions for units [${targetUnits.join(', ')}].`);

  let cache: Record<string, number[]> = {};
  if (fs.existsSync(CACHE_PATH)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    } catch {}
  }

  const embeddingProvider = new GoogleEmbeddingProvider();
  const vectorDocs: VectorDocument[] = [];

  for (let i = 0; i < benchmarkSelection.length; i++) {
    const q = benchmarkSelection[i];
    console.log(`[${i + 1}/${benchmarkSelection.length}] Embedding Unit ${q.unitNumber} (Q${q.questionNumber}): ${q.questionText.slice(0, 60)}...`);

    let values = cache[q.questionId];
    if (!values || values.length !== 768) {
      const text = buildEmbedText(q);
      values = await embeddingProvider.generateEmbedding(text);
      cache[q.questionId] = values;
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
      await sleep(14000); // 14s pacing to stay safely under Vertex AI quota
    } else {
      console.log('    ⚡ Loaded from cache');
    }

    const vectorId = `vec_${q.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    vectorDocs.push({
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
    });
  }

  console.log(`\n🌲 Upserting ${vectorDocs.length} benchmark vectors into Qdrant (edtech_ai_rag)...`);
  await qdrantService.upsertVectors(vectorDocs, 'production');

  console.log('💾 Updating vectorIndexed flags in Firestore...');
  const flagBatch = db.batch();
  for (const v of vectorDocs) {
    const qId = (v.metadata as any).questionId;
    const ref = db.collection('pyq_questions').doc(qId);
    flagBatch.update(ref, {
      vectorIndexed: true,
      vectorIndexedAt: Date.now(),
      ingestionState: 'INDEXED',
    });
  }
  await flagBatch.commit();

  console.log('✅ Benchmark vectors successfully indexed into Qdrant!\n');
}

main().catch((err) => {
  console.error('Fatal benchmark indexing error:', err);
  process.exit(1);
});
