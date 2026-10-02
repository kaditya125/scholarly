import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { vectorStore } from '../../../src/services/rag/vectorStore';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import { VectorDocument } from '../../../src/services/rag/vectorStore.types';

const POOL_PATH = path.resolve('dataset_staging/ugc_net_geography/ugc_net_geography_all_extracted_pyqs.json');
const CACHE_PATH = path.resolve('dataset_staging/ugc_net_geography/geography_embedding_cache.json');

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildEmbedText(q: any): string {
  return `Examination: UGC NET (Subject Code: 80)
Subject: Geography
Unit ${q.unitNumber}: ${q.unitName}
Year: ${q.year} | Session: ${q.session} | Paper: ${q.paper}
Question ${q.questionNumber}: ${q.text}
Options: (A) ${q.options[0]} (B) ${q.options[1]} (C) ${q.options[2]} (D) ${q.options[3]}
Content Type: Official Previous Year Question (PYQ)`;
}

async function main() {
  console.log('Selecting Geography benchmark questions (Units 1..5)...');
  const allQuestions: any[] = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));

  const benchmarkSelection: any[] = [];
  for (let u = 1; u <= 5; u++) {
    const unitQs = allQuestions.filter(q => q.unitNumber === u && q.text.length > 50 && q.options.length === 4);
    if (unitQs.length > 0) benchmarkSelection.push(unitQs[0]);
  }

  console.log(`🎯 Selected ${benchmarkSelection.length} benchmark questions for units [1..5].`);

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
    const cleanPaper = q.paper.replace(' ', '_').toLowerCase();
    const qId = `ugc_net_geography_80_${q.year}_${q.session.toLowerCase()}_${cleanPaper}_q${String(q.questionNumber).padStart(2, '0')}`;
    console.log(`[${i + 1}/${benchmarkSelection.length}] Embedding Unit ${q.unitNumber} (${q.unitName})...`);

    let values = cache[qId];
    if (!values || values.length !== 768) {
      const text = buildEmbedText(q);
      let attempts = 0;
      while (attempts < 5) {
        try {
          values = await embeddingProvider.generateEmbedding(text);
          break;
        } catch (err: any) {
          attempts++;
          console.warn(`    ⚠️ Rate limit / quota encountered. Waiting 25s before retry (attempt ${attempts}/5)...`);
          await sleep(25000);
        }
      }
      cache[qId] = values;
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
      if (i < benchmarkSelection.length - 1) {
        await sleep(15000); // 15s pacing for Vertex AI quota
      }
    } else {
      console.log('    ⚡ Loaded from cache');
    }

    const vectorId = `vec_${qId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    vectorDocs.push({
      id: vectorId,
      values,
      metadata: {
        questionId: qId,
        examId: 'UGC_NET',
        subject: 'Geography',
        subjectCode: '80',
        unitNumber: q.unitNumber,
        unitName: q.unitName,
        year: q.year,
        session: q.session,
        paper: q.paper,
        questionNumber: q.questionNumber,
        content_type: 'pyq',
        corpusBucket: 'OFFICIAL_PYQ',
        isAuthenticPYQ: true,
        public: true,
        text: q.text,
        options: q.options,
      }
    });
  }

  console.log(`Upserting ${vectorDocs.length} vectors to vectorStore (${vectorStore.backend})...`);
  await vectorStore.upsertVectors(vectorDocs, 'production');

  console.log('Updating Firestore vectorIndexed flags...');
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
  console.log('✅ Geography benchmark vectors indexed successfully!\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
