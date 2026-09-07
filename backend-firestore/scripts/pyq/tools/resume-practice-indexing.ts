import 'dotenv/config';
import { db } from '../../../src/config/firebase';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import { env } from '../../../src/config/env';

async function resumeIndexing() {
  console.log('Querying unindexed PRACTICE_MOCK questions from Firestore...');
  const snap = await db.collection('pyq_questions')
    .where('corpusBucket', '==', 'PRACTICE_MOCK')
    .where('ingestionState', '==', 'ACTIVE')
    .get();

  const pendingDocs = snap.docs
    .filter(d => d.data().vectorIndexed !== true)
    .map(d => ({ id: d.id, ...d.data() } as any));

  console.log(`Found ${pendingDocs.length} pending PRACTICE_MOCK questions to index.`);

  if (pendingDocs.length === 0) {
    console.log('All practice questions are already indexed!');
    process.exit(0);
  }

  const embeddingProvider = new GoogleEmbeddingProvider();
  const namespace = env.PINECONE_NAMESPACE || 'production';
  const now = Date.now();
  const BATCH_SIZE = 25;
  let indexedCount = 0;

  for (let i = 0; i < pendingDocs.length; i += BATCH_SIZE) {
    const chunk = pendingDocs.slice(i, i + BATCH_SIZE);
    const vectors: any[] = [];

    for (const q of chunk) {
      const textToEmbed = [
        `Examination: ${q.examId} Practice & Concept Bank`,
        `Subject: ${q.subject}${q.topic ? ` > ${q.topic}` : ''}`,
        `Difficulty: ${q.difficulty || 'MEDIUM'}`,
        `Question: ${q.questionText || q.text || ''}`,
        q.options && q.options.length > 0 ? `Options: ${q.options.join('  ')}` : '',
        `Content Type: Practice & Concept Mock Question`
      ].filter(Boolean).join('\n');

      let embedding: number[] | null = null;
      let retries = 0;
      while (!embedding && retries < 5) {
        try {
          embedding = await embeddingProvider.generateEmbedding(textToEmbed);
        } catch (err: any) {
          retries++;
          const waitMs = retries * 3000;
          console.warn(`[Retry ${retries}/5] Rate limit for ${q.id}. Waiting ${waitMs}ms...`);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }

      if (embedding) {
        const vectorId = `vec_${q.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        vectors.push({
          id: vectorId,
          values: embedding,
          metadata: {
            content_type: 'pyq',
            corpusBucket: 'PRACTICE_MOCK',
            vectorKind: 'PRACTICE_QUESTION',
            public: true,
            owner: 'sadhya-exam-intel',
            examId: q.examId,
            subject: q.subject,
            topic: q.topic || '',
            questionId: q.id,
            difficulty: q.difficulty || 'MEDIUM',
            text: q.questionText || q.text || '',
            createdAt: q.createdAt || now,
          }
        });
      }

      // Gentle pause between each embedding call
      await new Promise(r => setTimeout(r, 600));
    }

    if (vectors.length > 0) {
      await pineconeService.upsertVectors(vectors, namespace);
      indexedCount += vectors.length;

      // Update Firestore
      const batch = db.batch();
      for (const v of vectors) {
        const qId = v.metadata.questionId;
        const ref = db.collection('pyq_questions').doc(qId);
        batch.update(ref, { vectorIndexed: true, vectorIndexedAt: Date.now() });
      }
      await batch.commit();

      process.stdout.write(`Indexed ${indexedCount} / ${pendingDocs.length} remaining vectors in Pinecone...\r`);
    }
  }

  console.log(`\n\n🎉 Finished indexing remaining practice vectors! Total added: ${indexedCount}`);
  process.exit(0);
}

resumeIndexing().catch(err => {
  console.error(err);
  process.exit(1);
});
