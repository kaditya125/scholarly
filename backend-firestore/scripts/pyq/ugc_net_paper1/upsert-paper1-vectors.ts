import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { vectorStore } from '../../../src/services/rag/vectorStore';
import { VectorDocument } from '../../../src/services/rag/vectorStore.types';

const POOL_PATH = path.resolve('dataset_staging/ugc_net_paper1/ugc_net_paper1_all_extracted_pyqs.json');
const CACHE_PATH = path.resolve('dataset_staging/ugc_net_paper1/ugc_net_paper1_embedding_cache.json');

async function main() {
  const cache: Record<string, number[]> = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  const allQuestions: any[] = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));

  const vectorDocs: VectorDocument[] = [];
  for (const [qId, values] of Object.entries(cache)) {
    const q = allQuestions.find(x => `ugc_net_p1_${x.year}_${x.session.toLowerCase()}_q${String(x.questionNumber).padStart(2, '0')}` === qId);
    if (!q) continue;

    vectorDocs.push({
      id: `vec_${qId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      values,
      metadata: {
        questionId: qId,
        examId: 'UGC_NET',
        subject: 'General Paper on Teaching & Research Aptitude',
        subjectCode: '00',
        unitNumber: q.unitNumber,
        unitName: q.unitName,
        year: q.year,
        session: q.session,
        paper: 'Paper I',
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
  console.log('✅ Successfully upserted to vectorStore!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
