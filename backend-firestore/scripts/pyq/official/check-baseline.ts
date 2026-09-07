import 'dotenv/config';
import { db } from '../../../src/config/firebase';
import { env } from '../../../src/config/env';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { PROBE_VECTOR } from '../../phase4a/_embedding-guard';

async function main() {
  console.log('--- FIRESTORE BASELINE ---');
  const snap = await db.collection('pyq_questions').get();
  console.log(`Total pyq_questions in Firestore: ${snap.size}`);

  const byExam: Record<string, number> = {};
  const neetTexts = new Set<string>();
  const neetHashes = new Set<string>();
  const neetYears: Record<number, number> = {};
  const neetIds: string[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const exam = data.examId || 'UNKNOWN';
    byExam[exam] = (byExam[exam] || 0) + 1;

    if (exam === 'NEET_UG') {
      const normText = (data.questionText || '').trim().toLowerCase().replace(/\s+/g, ' ');
      neetTexts.add(normText);
      if (data.contentHash) neetHashes.add(data.contentHash);
      if (data.year) neetYears[data.year] = (neetYears[data.year] || 0) + 1;
      neetIds.push(doc.id);
    }
  }

  console.log('Exam distribution:', byExam);
  console.log(`NEET_UG total records: ${neetIds.length}`);
  console.log(`NEET_UG distinct texts: ${neetTexts.size}`);
  console.log(`NEET_UG distinct content hashes: ${neetHashes.size}`);
  console.log('NEET_UG years breakdown:', neetYears);

  console.log('\n--- PINECONE BASELINE ---');
  const indexName = env.PINECONE_INDEX_NAME;
  const namespace = env.PINECONE_NAMESPACE;
  console.log(`Index: ${indexName}, Namespace: ${namespace}`);

  try {
    const client = (pineconeService as any).getIndex();
    const target = namespace ? client.namespace(namespace) : client;
    const stats = await client.describeIndexStats();
    console.log('Pinecone index stats:', JSON.stringify(stats, null, 2));
  } catch (err: any) {
    console.error('Failed to get Pinecone stats:', err.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
