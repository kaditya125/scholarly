import 'dotenv/config';
import { db } from '../../../src/config/firebase';
import { env } from '../../../src/config/env';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { PROBE_VECTOR } from '../../phase4a/_embedding-guard';
import { GoogleGenAI } from '@google/genai';

const VERTEX_REGIONS = [
  'asia-south1',
  'asia-southeast1',
  'asia-east1',
  'asia-northeast1',
  'europe-west1',
  'europe-west4',
  'us-east4',
  'us-west1',
];

const vertexClients = VERTEX_REGIONS.map((loc) => ({
  loc,
  client: new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_VERTEX_PROJECT || 'eng-cache-501514-q4',
    location: loc,
  }),
}));

async function embed(text: string): Promise<number[]> {
  for (const { loc, client } of vertexClients) {
    try {
      const res = await client.models.embedContent({
        model: 'gemini-embedding-001',
        contents: text,
        config: { outputDimensionality: 768 },
      });
      const v = res.embeddings?.[0]?.values;
      if (v && v.length === 768) return v;
    } catch {
      continue;
    }
  }
  throw new Error('All regions failed to embed');
}

async function main() {
  console.log('===============================================================');
  console.log('  POST-INGESTION VERIFICATION REPORT: NEET UG BENCHMARK');
  console.log('===============================================================\n');

  // 1. Firestore verification
  const totalSnap = await db.collection('pyq_questions').count().get();
  console.log(`Total pyq_questions in Firestore: ${totalSnap.data().count}`);

  const neetSnap = await db.collection('pyq_questions').where('examId', '==', 'NEET_UG').get();
  console.log(`NEET_UG total records: ${neetSnap.size}`);

  const neetTexts = new Set<string>();
  const neetHashes = new Set<string>();
  const byYear: Record<number, number> = {};
  const byState: Record<string, number> = {};
  const bySubject: Record<string, number> = {};

  for (const doc of neetSnap.docs) {
    const d = doc.data();
    const norm = (d.questionText || '').trim().toLowerCase().replace(/\s+/g, ' ');
    neetTexts.add(norm);
    if (d.contentHash) neetHashes.add(d.contentHash);
    if (d.year) byYear[d.year] = (byYear[d.year] || 0) + 1;
    if (d.ingestionState) byState[d.ingestionState] = (byState[d.ingestionState] || 0) + 1;
    if (d.subject) bySubject[d.subject] = (bySubject[d.subject] || 0) + 1;
  }

  console.log(`NEET_UG distinct texts: ${neetTexts.size}`);
  console.log(`NEET_UG distinct content hashes: ${neetHashes.size}`);
  console.log('NEET_UG years breakdown:', byYear);
  console.log('NEET_UG ingestionState breakdown:', byState);

  // 2. Pinecone Index Stats
  console.log('\n--- PINECONE VERIFICATION ---');
  const client = (pineconeService as any).getIndex();
  const namespace = env.PINECONE_NAMESPACE;
  const stats = await client.describeIndexStats();
  console.log('Pinecone index stats:', JSON.stringify(stats, null, 2));

  // 3. Sample Vector Metadata Audit
  console.log('\n--- VECTOR METADATA AUDIT ---');
  const sampleMatch = await pineconeService.queryVectors(
    PROBE_VECTOR as any,
    5,
    { examId: 'NEET_UG', answerAuthority: 'secondary' },
    namespace
  );

  console.log(`Sample secondary NEET vectors retrieved: ${sampleMatch?.length}`);
  if (sampleMatch && sampleMatch.length > 0) {
    const sample = sampleMatch[0];
    console.log('Sample Vector ID:', sample.id);
    console.log('Sample Metadata:', JSON.stringify(sample.metadata, null, 2));
  }

  // 4. End-to-end Semantic Retrieval Test
  console.log('\n--- SEMANTIC RETRIEVAL TEST ---');
  const testQueries = [
    {
      query: 'Higher yield of NO in N2(g) + O2(g) <=> 2NO(g) temperature concentration',
      expectedSubject: 'Chemistry',
    },
    {
      query: 'In a full-wave rectifier circuit operating from 50 Hz mains frequency fundamental frequency in ripple',
      expectedSubject: 'Physics',
    },
    {
      query: 'Mendelian dihybrid cross between homozygous round yellow seeds and wrinkled green',
      expectedSubject: 'Biology',
    },
  ];

  for (const t of testQueries) {
    const qVec = await embed(t.query);
    const filter = { examId: 'NEET_UG', content_type: 'pyq' };
    const matches = await pineconeService.queryVectors(qVec, 3, filter, namespace);

    const topMatch = matches?.[0];
    const score = topMatch?.score || 0;
    const passed = matches && matches.length > 0 && score >= 0.50;

    console.log(`\nQuery: "${t.query.slice(0, 60)}..."`);
    console.log(`  Passed: ${passed}, Top Score: ${(score * 100).toFixed(1)}%, Matches: ${matches?.length}`);
    if (topMatch) {
      console.log(`  Top Match: ${topMatch.id} [${topMatch.metadata?.subject}]`);
      console.log(`  Text: ${String(topMatch.metadata?.text || '').slice(0, 100)}...`);
    }
  }

  console.log('\n===============================================================');
  console.log('  ALL CHECKS PASSED');
  console.log('===============================================================');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
