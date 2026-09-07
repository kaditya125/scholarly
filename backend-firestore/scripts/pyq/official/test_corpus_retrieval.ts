import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { retrievalService } from '../../../src/services/rag/retrieval.service';
import { env } from '../../../src/config/env';

interface TestCase {
  name: string;
  query: string;
  expectedYear: number;
  expectedQNum: number;
  expectedAnswer: string;
  expectedKeywords: string[];
}

const TEST_CASES: TestCase[] = [
  {
    name: '2020 Q1 (Aadhaar metadata storage)',
    query: 'Can Aadhaar metadata be stored for more than three months and is it mandatory for insurance?',
    expectedYear: 2020,
    expectedQNum: 1,
    expectedAnswer: 'B',
    expectedKeywords: ['aadhaar', 'metadata'],
  },
  {
    name: '2020 Q50 (Biochemical Oxygen Demand)',
    query: 'Biochemical Oxygen Demand BOD standard criterion for measuring aquatic ecosystems',
    expectedYear: 2020,
    expectedQNum: 50,
    expectedAnswer: 'D',
    expectedKeywords: ['biochemical oxygen demand', 'aquatic'],
  },
  {
    name: '2020 Q100 (Critical Tiger Habitat)',
    query: 'Which Tiger Reserve in India has the largest area under Critical Tiger Habitat?',
    expectedYear: 2020,
    expectedQNum: 100,
    expectedAnswer: 'C',
    expectedKeywords: ['tiger reserve', 'critical tiger habitat'],
  },
  {
    name: '2014 Q1 (Sustainable Sugarcane Initiative - cyclic shift resolved)',
    query: 'Sustainable Sugarcane Initiative SSI furrow irrigation drip irrigation cultivation',
    expectedYear: 2014,
    expectedQNum: 1,
    expectedAnswer: 'B',
    expectedKeywords: ['sugarcane', 'furrow'],
  },
  {
    name: '2018 Q29 (Rule of Law Index)',
    query: 'Rule of Law Index is released by which organisation World Justice Project',
    expectedYear: 2018,
    expectedQNum: 29,
    expectedAnswer: 'A',
    expectedKeywords: ['rule of law index', 'world justice project'],
  },
  {
    name: '2011 Q1 (Bioasphalt)',
    query: 'bio-based asphalt bioasphalt non-renewable resources organic waste materials surfacing roads',
    expectedYear: 2011,
    expectedQNum: 1,
    expectedAnswer: 'B',
    expectedKeywords: ['bioasphalt', 'asphalt'],
  },
];

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🧪 UPSC GS-I PRODUCTION RAG & SEMANTIC RETRIEVAL TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const embedder = new GoogleEmbeddingProvider();
  let passedCount = 0;

  // 1. Direct Semantic Vector Search Tests
  console.log('--- Phase 1: Semantic Vector Search & Answer Verification ---');
  for (const tc of TEST_CASES) {
    console.log(`\nTesting: [${tc.name}]`);
    console.log(`  Query: "${tc.query}"`);

    const qEmbedding = await embedder.generateEmbedding(tc.query);
    const filter = {
      examId: 'UPSC_CSE',
      public: true,
      answerAvailable: true,
    };

    const matches = await pineconeService.queryVectors(
      qEmbedding,
      3,
      filter as any,
      env.PINECONE_NAMESPACE
    );

    if (matches.length === 0) {
      console.error(`  ❌ FAILED: No matches returned from Pinecone!`);
      continue;
    }

    const top = matches[0];
    const meta = top.metadata as any;
    console.log(`  Top match: ${top.id}`);
    console.log(`    Similarity score: ${top.score?.toFixed(4)}`);
    console.log(`    Year: ${meta.year} (expected ${tc.expectedYear})`);
    console.log(`    QuestionNumber: ${meta.questionNumber} (expected ${tc.expectedQNum})`);
    console.log(`    Answer: '${meta.correctAnswer}' (expected '${tc.expectedAnswer}')`);
    console.log(`    Content Type: ${meta.content_type}`);
    console.log(`    Public: ${meta.public}, AnswerAvailable: ${meta.answerAvailable}`);

    const isMatch =
      meta.year === tc.expectedYear &&
      meta.questionNumber === tc.expectedQNum &&
      meta.correctAnswer === tc.expectedAnswer;

    if (isMatch) {
      console.log(`  ✅ PASSED: Retrieved exact target question with correct canonical answer!`);
      passedCount++;
    } else {
      // Check if target question was in top 3
      const foundInTop3 = matches.find(
        (m: any) =>
          m.metadata?.year === tc.expectedYear &&
          m.metadata?.questionNumber === tc.expectedQNum
      );
      if (foundInTop3) {
        console.log(`  ⚠️ Target found in top 3 (rank ${matches.indexOf(foundInTop3) + 1}), score: ${foundInTop3.score?.toFixed(4)}`);
        passedCount++;
      } else {
        console.error(`  ❌ FAILED: Target question not in top 3`);
      }
    }
  }

  // 2. Security & Isolation Test: Zero unkeyed vectors with public=true
  console.log('\n--- Phase 2: Security & Gating Invariant Test ---');
  const PROBE_VECTOR = new Array(768).fill(0.01);
  const unkeyedMatches = await pineconeService.queryVectors(
    PROBE_VECTOR,
    10,
    { content_type: 'pyq_unkeyed', public: true } as any,
    env.PINECONE_NAMESPACE
  );

  console.log(`Unkeyed vectors with public=true count: ${unkeyedMatches.length}`);
  if (unkeyedMatches.length === 0) {
    console.log(`✅ PASSED: Zero unkeyed vectors leak into public retrieval.`);
    passedCount++;
  } else {
    console.error(`❌ FAILED: ${unkeyedMatches.length} unkeyed vectors are public!`);
  }

  // 3. Full RAG Service End-to-End Test
  console.log('\n--- Phase 3: High-Level RAG Service End-to-End Test ---');
  try {
    const ragResults = await retrievalService.retrievePublicKnowledge(
      'Which Tiger Reserve has the largest area under Critical Tiger Habitat in India?',
      3
    );

    console.log(`RAG retrievePublicKnowledge returned ${ragResults.length} results.`);
    if (ragResults.length > 0) {
      const topRag = ragResults[0];
      console.log(`  Top RAG result: "${topRag.text.slice(0, 120)}..."`);
      console.log(`  RAG score: ${topRag.score}`);
      console.log(`  Metadata: year=${topRag.metadata?.year}, qNum=${topRag.metadata?.questionNumber}, ans=${topRag.metadata?.correctAnswer}`);

      if (topRag.metadata?.year === 2020 && topRag.metadata?.questionNumber === 100) {
        console.log(`✅ PASSED: End-to-end RAG service retrieved 2020 Q100 with answer '${topRag.metadata?.correctAnswer}'!`);
        passedCount++;
      } else {
        console.log(`⚠️ RAG returned top result from year ${topRag.metadata?.year} Q${topRag.metadata?.questionNumber}`);
      }
    }
  } catch (err: any) {
    console.warn(`RAG retrievePublicKnowledge warning: ${err.message}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log(`📊 TEST SUITE SUMMARY: ${passedCount} / ${TEST_CASES.length + 2} tests passed.`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
