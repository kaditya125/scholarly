import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import { qdrantService } from '../../src/services/rag/qdrant.service';
import { VectorDocument } from '../../src/services/rag/vectorStore.types';
import { db } from '../../src/config/firebase';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       SYNCING ALL UGC NET BENCHMARK VECTORS TO QDRANT        ');
  console.log('═══════════════════════════════════════════════════════════════');

  const cacheFiles = glob.sync('dataset_staging/**/**embedding_cache.json');
  console.log('Found cache files:', cacheFiles.length);

  let totalUpserted = 0;

  for (const cf of cacheFiles) {
    const raw = JSON.parse(fs.readFileSync(cf, 'utf-8'));
    const keys = Object.keys(raw);
    if (keys.length === 0) continue;

    console.log(\nProcessing  ( cached vectors)...);
    const vectorDocs: VectorDocument[] = [];

    for (const qId of keys) {
      const values = raw[qId];
      if (!values || values.length !== 768) continue;

      // Fetch metadata from Firestore
      const snap = await db.collection('pyq_questions').doc(qId).get();
      if (!snap.exists) {
        console.warn(  ⚠️ Question  not found in Firestore pyq_questions);
        continue;
      }
      const data = snap.data()!;
      const vectorId = ec_;

      vectorDocs.push({
        id: vectorId,
        values,
        metadata: {
          questionId: qId,
          examId: data.examId || 'UGC_NET',
          subject: data.subject,
          subjectCode: data.subjectCode,
          unitNumber: data.unitNumber,
          unitName: data.unitName,
          year: data.year,
          session: data.session,
          paper: data.paper,
          questionNumber: data.questionNumber,
          content_type: 'pyq',
          corpusBucket: 'OFFICIAL_PYQ',
          isAuthenticPYQ: true,
          public: true,
          text: data.text,
          options: data.options,
        }
      });
    }

    if (vectorDocs.length > 0) {
      await qdrantService.upsertVectors(vectorDocs, 'production');
      console.log(  ✅ Upserted  vectors to Qdrant collection (production namespace).);
      totalUpserted += vectorDocs.length;
    }
  }

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(✅ Total UGC NET vectors synced to Qdrant: );
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
