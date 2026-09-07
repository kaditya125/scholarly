import 'dotenv/config';
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

async function main() {
  console.log('Testing regional vertex clients for embedding...');
  for (const { loc, client } of vertexClients) {
    try {
      const res = await client.models.embedContent({
        model: 'gemini-embedding-001',
        contents: 'Test NEET question embedding text',
        config: { outputDimensionality: 768 },
      });
      const values = res.embeddings?.[0]?.values;
      console.log(`Region ${loc}: Success! Dim = ${values?.length}`);
      break;
    } catch (err: any) {
      console.log(`Region ${loc} failed:`, err.message);
    }
  }
}

main().catch(console.error);
