import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { vectorStore } from '../../../src/services/rag/vectorStore';
import { VectorDocument } from '../../../src/services/rag/vectorStore.types';

const CACHE_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_embedding_cache.json');
const POOL_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_all_extracted_pyqs.json');

async function main() {
  if (!fs.existsSync(CACHE_PATH) || !fs.existsSync(POOL_PATH)) {
    throw new Error('Cache or pool not found');
  }

  const cache: Record<string, number[]> = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  const allQuestions: any[] = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));
  const qMap = new Map<string, any>(allQuestions.map(q => [q.questionId, q]));

  const vectorDocs: VectorDocument[] = [];
  for (const [qid, values] of Object.entries(cache)) {
    const q = qMap.get(qid);
    if (!q) continue;

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

  console.log(`Found ${vectorDocs.length} embedded vectors in cache.`);
  if (vectorDocs.length > 0) {
    console.log(`Upserting ${vectorDocs.length} vectors into vector store (${vectorStore.backend})...`);
    await vectorStore.upsertVectors(vectorDocs, 'production');

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
    console.log('✅ Successfully upserted cached vectors into Qdrant and updated Firestore!');
  }
}

main().catch(console.error);
