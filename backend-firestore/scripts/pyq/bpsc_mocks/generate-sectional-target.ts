import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { db } from '../../../src/config/firebase';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';
import { BPSCMockQuestion, BPSCSubject, BPSCQuestionType, BPSCDifficulty } from './bpscMock.types';

function generateHash(text: string, options: string[]): string {
  const norm = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const opts = options.map((o) => o.trim().toLowerCase().replace(/\s+/g, ' ')).sort().join('|');
  return crypto.createHash('sha256').update(`BPSC_MOCK::${norm}::${opts}`).digest('hex');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface TargetChunk {
  mockPaperId: string;
  testSeriesName: string;
  subject: BPSCSubject;
  subtopic: string;
  count: number;
  isBiharSpecial: boolean;
  guidelines: string;
}

const CHUNKS: TargetChunk[] = [
  // Polity Chunk 1 (15 Qs)
  {
    mockPaperId: 'BPSC_SEC_POLITY_01',
    testSeriesName: 'BPSC Sectional Master Series: Indian Polity & Governance',
    subject: 'Indian Polity & Economy',
    subtopic: 'Fundamental Rights & Writs Jurisprudence',
    count: 15,
    isBiharSpecial: false,
    guidelines: 'Article 14, 19, 21, 32, writs (Habeas Corpus, Mandamus, Quo-Warranto, Certiorari, Prohibition), martial law Art 34, armed forces Art 33.'
  },
  // Polity Chunk 2 (15 Qs)
  {
    mockPaperId: 'BPSC_SEC_POLITY_01',
    testSeriesName: 'BPSC Sectional Master Series: Indian Polity & Governance',
    subject: 'Indian Polity & Economy',
    subtopic: 'DPSP, Fundamental Duties & Basic Structure',
    count: 15,
    isBiharSpecial: false,
    guidelines: 'Socialist, Gandhian, Liberal intellectual principles in DPSP, 42nd Amendment additions, Article 51A duties, Kesavananda Bharati basic structure elements.'
  },
  // Polity Chunk 3 (20 Qs)
  {
    mockPaperId: 'BPSC_SEC_POLITY_01',
    testSeriesName: 'BPSC Sectional Master Series: Indian Polity & Governance',
    subject: 'Indian Polity & Economy',
    subtopic: 'Parliamentary Committees, Speaker & State Legislature',
    count: 20,
    isBiharSpecial: false,
    guidelines: 'PAC, Estimates Committee, Committee on Public Undertakings, Speaker casting vote, Money Bill certification, Governor ordinance power Art 213 vs President Art 123.'
  },
  // Geography Chunk 1 (15 Qs)
  {
    mockPaperId: 'BPSC_SEC_GEO_01',
    testSeriesName: 'BPSC Sectional Master Series: Comprehensive Geography Booster',
    subject: 'Geography',
    subtopic: 'Indian Physiography, Passes & Himalayan Glaciers',
    count: 15,
    isBiharSpecial: false,
    guidelines: 'Karakoram, Zaskar, Pir Panjal, major passes (Zoji La, Shipki La, Nathu La, Lipulekh, Palghat), Western Ghats vs Eastern Ghats, coastal plains.'
  },
  // Geography Chunk 2 (15 Qs)
  {
    mockPaperId: 'BPSC_SEC_GEO_01',
    testSeriesName: 'BPSC Sectional Master Series: Comprehensive Geography Booster',
    subject: 'Geography',
    subtopic: 'Indian Drainage, Multipurpose Projects & Soils',
    count: 15,
    isBiharSpecial: false,
    guidelines: 'Indus, Ganga, Brahmaputra systems, Peninsular west vs east flowing rivers (Narmada, Tapti, Godavari, Krishna, Cauvery), Bhakra, Hirakud, Nagarjuna Sagar, black soil characteristics.'
  },
  // Geography Chunk 3 (20 Qs)
  {
    mockPaperId: 'BPSC_SEC_GEO_01',
    testSeriesName: 'BPSC Sectional Master Series: Comprehensive Geography Booster',
    subject: 'Geography',
    subtopic: 'Bihar Regional Geography, Boundary Districts & Climate',
    count: 20,
    isBiharSpecial: true,
    guidelines: '7 Nepal border districts, 8 UP border districts, 8 Jharkhand border districts, 3 West Bengal border districts, Bihar average annual rainfall and monsoon retreat, forest cover rankings in Bihar (Kaimur, Jamui, Nawada).'
  }
];

async function generateChunk(ai: ReturnType<typeof createGoogleGenAIClient>, chunk: TargetChunk): Promise<BPSCMockQuestion[]> {
  const prompt = `You are a Senior Academic Specialist setting questions for BPSC Prelims.
Benchmarking: Testbook, ForumIAS, BPSC Pathshala, Habitat IAS.
Create exactly ${chunk.count} high-quality BPSC-style objective MCQs for:
Subject: ${chunk.subject}
Subtopic: ${chunk.subtopic}
Is Bihar Special: ${chunk.isBiharSpecial}
Guidelines: ${chunk.guidelines}

CRITICAL RULES:
1. Exactly 4 options: (A), (B), (C), (D).
2. Exactly one option correct.
3. Mix of EASY, MEDIUM, and HARD questions.
4. Concise 2-sentence explanation.
5. Return ONLY a valid JSON array:
[
  {
    "questionText": "...",
    "options": ["...", "...", "...", "..."],
    "correctAnswer": "A",
    "explanation": "...",
    "difficulty": "MEDIUM",
    "questionType": "factual"
  }
]`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`   Generating ${chunk.count} Qs for [${chunk.mockPaperId}: ${chunk.subtopic}] (Attempt ${attempt})...`);
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = res.text || '';
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array found');

      const raw = JSON.parse(match[0]);
      const now = Date.now();
      const list: BPSCMockQuestion[] = [];

      for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (!item.options || item.options.length !== 4) continue;
        const contentHash = generateHash(item.questionText, item.options);
        const hash8 = contentHash.slice(0, 8);
        const questionId = `mock:bpsc:${chunk.mockPaperId.toLowerCase()}:${chunk.subject.toLowerCase().replace(/[^a-z0-9]/g, '_')}:${hash8}`;

        const q: BPSCMockQuestion = {
          questionId,
          examId: 'BPSC_CCE',
          examStage: 'prelims',
          patternVersion: 'latest_4_options_one_third_neg',
          testType: 'SECTIONAL',
          testSeriesName: chunk.testSeriesName,
          mockPaperId: chunk.mockPaperId,
          corpusBucket: 'PRACTICE_MOCK',
          sourceTier: 'SYNTHETIC_ORIGINAL',
          sourceName: 'Benchmark Alignment: Testbook / ForumIAS / BPSC Pathshala',
          sourceType: 'ai_generated_mock',
          isAuthenticPYQ: false,
          isGenerated: true,
          subject: chunk.subject,
          subtopic: chunk.subtopic,
          isBiharSpecial: chunk.isBiharSpecial,
          questionType: (item.questionType || 'factual') as BPSCQuestionType,
          questionNumber: i + 1,
          questionText: item.questionText.trim(),
          options: [item.options[0].trim(), item.options[1].trim(), item.options[2].trim(), item.options[3].trim()],
          correctAnswer: item.correctAnswer as 'A' | 'B' | 'C' | 'D',
          explanation: item.explanation.trim(),
          difficulty: (item.difficulty || 'MEDIUM') as BPSCDifficulty,
          marks: 1,
          negativeMarks: 0.33,
          language: 'en',
          contentHash,
          createdAt: now,
          updatedAt: now,
        };
        list.push(q);
      }
      await sleep(2000);
      return list;
    } catch (err: any) {
      console.warn(`      ⚠️ Attempt ${attempt} failed: ${err.message}`);
      if (attempt === 3) throw err;
      await sleep(4000 * attempt);
    }
  }
  return [];
}

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🏛️  TARGET SECTIONAL GENERATION: POLITY (50 Qs) & GEOGRAPHY (50 Qs)');
  console.log(`   Mode: ${isExecute ? 'LIVE FIRESTORE WRITE' : 'DRY RUN'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const ai = createGoogleGenAIClient();
  const allQs: BPSCMockQuestion[] = [];

  for (const c of CHUNKS) {
    try {
      const res = await generateChunk(ai, c);
      console.log(`      ✅ Generated ${res.length} questions`);
      allQs.push(...res);
    } catch (e: any) {
      console.error(`      ❌ Failed chunk ${c.subtopic}:`, e.message);
    }
  }

  console.log(`\nTotal Target Questions Generated: ${allQs.length}`);
  if (!isExecute) {
    console.log('\n[DRY RUN] Pass --execute to commit to Firestore.');
    process.exit(0);
  }

  console.log('\nWriting to `bpsc_mock_questions`...');
  const col = db.collection('bpsc_mock_questions');
  const BATCH_SIZE = 50;
  for (let i = 0; i < allQs.length; i += BATCH_SIZE) {
    const chunk = allQs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const q of chunk) {
      batch.set(col.doc(q.questionId), q, { merge: true });
    }
    await batch.commit();
    console.log(`   Committed ${i + 1} to ${Math.min(i + BATCH_SIZE, allQs.length)} / ${allQs.length}`);
  }

  console.log('\n✅ Successfully committed target sectional questions to `bpsc_mock_questions`!');
  process.exit(0);
}

main().catch(console.error);
