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

export interface TargetExpansionChunk {
  mockPaperId: string;
  testSeriesName: string;
  testType: 'SECTIONAL' | 'FULL_LENGTH';
  sourceName: string;
  subject: BPSCSubject;
  subtopic: string;
  count: number;
  isBiharSpecial: boolean;
  questionTypes: string[];
  guidelines: string;
}

export const EXPANSION_CHUNKS: TargetExpansionChunk[] = [
  // ─── PART 1: Top-up FLT-02 with missing 15 Current Affairs Qs (making it full 150 Qs) ───
  {
    mockPaperId: 'BPSC_FLT_02',
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: ForumIAS & Testbook Standard',
    subject: 'Current Affairs',
    subtopic: 'National & Bihar Schemes, Summits & Awards (2024-2025)',
    count: 15,
    isBiharSpecial: true,
    questionTypes: ['factual', 'statement_based'],
    guidelines:
      'Focus on PM MITRA textile park in West Champaran, Bihar Startup Policy 2022 amendments, PM-AASHA scheme, Bharat Ratna awarded to Karpoori Thakur and Dr. M.S. Swaminathan, Nobel Prizes 2024 (AI in Physics/Chemistry), COP29 climate finance new goal (NCQG), Paris Olympics 2024 medals, and Bihar Khelo India achievements.'
  },

  // ─── PART 2: Sectional Master Series: GMA & Quantitative Mastery (50 Qs) ───
  {
    mockPaperId: 'BPSC_SEC_GMA_01',
    testSeriesName: 'BPSC Sectional Master Series: General Mental Ability & DI Mastery',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: 10-Year BPSC CCE Quant & Logic Trend',
    subject: 'General Mental Ability',
    subtopic: 'Number Series, Coding-Decoding, Blood Relations & Syllogisms',
    count: 25,
    isBiharSpecial: false,
    questionTypes: ['factual', 'conceptual'],
    guidelines:
      'Classic BPSC patterns: alphanumeric series, missing number in matrix/circles, coding-decoding by positional shifts, blood relations puzzles, syllogisms (valid conclusions), clock angle between hands, calendar day determination for specific historical dates, and Venn diagrams.'
  },
  {
    mockPaperId: 'BPSC_SEC_GMA_01',
    testSeriesName: 'BPSC Sectional Master Series: General Mental Ability & DI Mastery',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: 10-Year BPSC CCE Quant & Logic Trend',
    subject: 'General Mental Ability',
    subtopic: 'Arithmetic, Percentage, Profit-Loss, Time-Speed-Distance & Probability',
    count: 25,
    isBiharSpecial: false,
    questionTypes: ['factual', 'conceptual'],
    guidelines:
      'Arithmetic word problems benchmarked to BPSC: Ratio & Proportion, mixtures and alligations, simple vs compound interest, work & wages (A, B, C working together), trains and relative speed, pipes & cisterns, permutations/combinations of letters, and probability of dice/cards.'
  },

  // ─── PART 3: Sectional Master Series: General Science Booster 02 (15 Qs to complete SEC_SCI to 50 Qs) ───
  {
    mockPaperId: 'BPSC_SEC_SCI_01',
    testSeriesName: 'BPSC Sectional Master Series: General Science Booster',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: ForumIAS & Testbook Science Standard',
    subject: 'General Science',
    subtopic: 'Space Exploration, Biotechnology & Everyday Electronics',
    count: 15,
    isBiharSpecial: false,
    questionTypes: ['factual', 'conceptual', 'statement_based'],
    guidelines:
      'ISRO missions (Aditya-L1 Lagrange points, Gaganyaan human spaceflight, Chandrayaan-3 rover Pragyan and lander Vikram), CRISPR-Cas9 gene editing, recombinant DNA technology, LED vs OLED displays, lithium-ion battery cathode materials, supercomputers in India (AIRAWAT, Param Siddhi), and green hydrogen production via electrolysis.'
  },

  // ─── PART 4: Full-Length Test 04 (BPSC_FLT_04: 150 Qs) ───
  // Focus: Deep Bihar Socio-Economic Survey 2024-25, State Budget, Polity & Modern History
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: BPSC Pathshala, Habitat IAS & Concept Wallah',
    subject: 'History',
    subtopic: 'Ancient Empires, Buddhist-Jain Heritage & Bihar Freedom Struggle',
    count: 20,
    isBiharSpecial: true,
    questionTypes: ['statement_based', 'factual', 'matching'],
    guidelines:
      'Brihadratha and Haryanka dynasties (Bimbisara, Ajatashatru capital shift), Buddhist Councils (patron kings, venues, presiding monks), Ashokan pillars in Bihar (Lauriya Nandangarh, Rampurva bull), Sasaram Tomb of Sher Shah Suri architecture, Battle of Buxar 1764 impact on Bihar Diwani, Chuar and Kol uprisings in Chota Nagpur, and Bihar Socialist Party 1931 (JP, Phulan Prasad Varma).'
  },
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook & ForumIAS',
    subject: 'History',
    subtopic: 'National Movement, Social Reforms & Governor-Generals',
    count: 15,
    isBiharSpecial: false,
    questionTypes: ['factual', 'statement_based', 'matching'],
    guidelines:
      'Socio-religious reform movements (Brahmo Samaj, Arya Samaj, Aligarh Movement, Satyashodhak Samaj), major Governor-Generals/Viceroys (Dalhousie doctrine of lapse, Ripon local self-government, Curzon partition of Bengal), Indian National Congress early sessions (1885 Bombay, 1906 Calcutta swaraj, 1907 Surat split, 1916 Lucknow pact), and Indian National Army (INA) trials.'
  },
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: BPSC Pathshala & Testbook',
    subject: 'General Science',
    subtopic: 'Physics & Applied Mechanics',
    count: 10,
    isBiharSpecial: false,
    questionTypes: ['conceptual', 'factual'],
    guidelines:
      'Newton gravitation, orbital speed of satellites, kinetic vs potential energy transformations, simple pendulum time period, sound waves (ultrasound, infrasound, echo depth sounding), Pascal law of hydraulic lift, and rainbow formation (dispersion + total internal reflection).'
  },
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook & ForumIAS',
    subject: 'General Science',
    subtopic: 'Chemistry & Environmental Science',
    count: 10,
    isBiharSpecial: false,
    questionTypes: ['factual', 'conceptual'],
    guidelines:
      'Periodic table trends (atomic radius, electronegativity, ionization energy), polymers (nylon, bakelite, teflon, PVC), carbon monoxide toxicity (carboxyhemoglobin), eutrophication in lakes, bio-magnification of pesticides (DDT), and renewable fuels (compressed biogas, ethanol blending E20).'
  },
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: ForumIAS & BPSC Concept Wallah',
    subject: 'General Science',
    subtopic: 'Cell Biology, Genetics, Human Physiology & Nutrition',
    count: 10,
    isBiharSpecial: false,
    questionTypes: ['statement_based', 'factual'],
    guidelines:
      'Prokaryotic vs eukaryotic cell organelles (mitochondria ATP, ribosomes, lysosomes), enzymes in digestion (pepsin, trypsin, amylase, lipase), vitamins deficiency syndromes (Vitamins A, B12, C, D, K), endocrinology (thyroid, pituitary, adrenal gland hormones), and human circulatory system (pulmonary artery vs vein).'
  },
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: BPSC Pathshala & Concept Wallah',
    subject: 'Geography',
    subtopic: 'Bihar Drainage, Soils, Agro-Climatic Zones & Forests',
    count: 15,
    isBiharSpecial: true,
    questionTypes: ['statement_based', 'factual', 'matching'],
    guidelines:
      'Ganga river entry in Bihar at Chausa (Buxar) and exit at Manihari (Katihar), north bank tributaries (Ghaghara, Gandak, Burhi Gandak, Bagmati, Kamla, Kosi, Mahananda), south bank tributaries (Karmanasa, Son, Punpun, Falgu, Kiul), Terai soil vs Piedmont swamp soil, Balther soil in southern plateau margin, and ISFR latest forest cover in Bihar.'
  },
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook & ForumIAS',
    subject: 'Geography',
    subtopic: 'Indian Physical Geography, Monsoons, Agriculture & Minerals',
    count: 15,
    isBiharSpecial: false,
    questionTypes: ['factual', 'conceptual', 'matching'],
    guidelines:
      'Southwest monsoon mechanism (ITCZ shift, Somali jet, El Nino / La Nina impact on Indian rains), cropping seasons (Kharif, Rabi, Zaid crops), major mineral belts (Chota Nagpur belt, Dharwar craton iron ore, Kudremukh, Singhbhum, Bailadila), and petroleum reserves (Bombay High, Digboi, Krishna-Godavari basin).'
  },
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: ForumIAS & BPSC Concept Wallah',
    subject: 'Indian Polity & Economy',
    subtopic: 'Constitutional Bodies, Federalism & Centre-State Relations',
    count: 15,
    isBiharSpecial: false,
    questionTypes: ['statement_based', 'factual'],
    guidelines:
      'Election Commission of India (Art 324, appointment panel), UPSC (Art 315-323), Finance Commission (Art 280 devolution formula), GST Council (Art 279A voting weights), Inter-State River Water Disputes Act 1956, Seventh Schedule union/state/concurrent lists, and Sarkaria & Punchhi Commission recommendations.'
  },
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: BPSC Pathshala & Concept Wallah',
    subject: 'Indian Polity & Economy',
    subtopic: 'Bihar Budget, Economic Survey & State Growth Indicators',
    count: 15,
    isBiharSpecial: true,
    questionTypes: ['statement_based', 'factual'],
    guidelines:
      'Bihar Economic Survey 2023-24 / 2024-25 data: GSDP growth rate, per capita GSDP, primary/secondary/tertiary sector shares, fiscal deficit percentage, Bihar Budget major allocations (Education, Rural Development, Health), Saat Nishchay Part 2 schemes (Har Khet Tak Sinchai Ka Pani, Yuva Shakti Bihar Ki Pragati), and Jeevika (BRLPS) achievements.'
  },
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook & ForumIAS',
    subject: 'Current Affairs',
    subtopic: 'National & Global Events, Indices, Summits & Sports (2024-2025)',
    count: 15,
    isBiharSpecial: false,
    questionTypes: ['factual', 'statement_based'],
    guidelines:
      'Global Peace Index, Human Development Index (HDI) India rank, Environmental Performance Index, Raisina Dialogue, BRICS expansion (new members), Commonwealth Games / Asian Games records, Ramsar Convention new wetlands in India, and national awards (Padma awards, Dadasaheb Phalke).'
  },
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: BPSC Concept Wallah & Habitat IAS',
    subject: 'Current Affairs',
    subtopic: 'Bihar Current Affairs, GI Tags, Infrastructure & Personalities',
    count: 10,
    isBiharSpecial: true,
    questionTypes: ['factual', 'statement_based'],
    guidelines:
      'GI Tags of Bihar (Marcha rice of West Champaran, Mithila Makhana, Shahi Litchi of Muzaffarpur, Bhagalpuri Zardalu mango, Katarni rice, Magahi Paan), Bihar first dry port at Bihta, Digha-Danapur elevated corridor, Simaria Dham development in Begusarai, and Bihar state sports medal winners.'
  },
  {
    mockPaperId: 'BPSC_FLT_04',
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 04)',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Standard 10-Question BPSC Math/Logic Pattern',
    subject: 'General Mental Ability',
    subtopic: 'BPSC Pattern 10 Math & Reasoning Problem Set',
    count: 10,
    isBiharSpecial: false,
    questionTypes: ['factual', 'conceptual'],
    guidelines:
      'Exact 10-Q BPSC Prelims math structure: 1 time & work, 1 simple/compound interest, 1 train distance speed, 1 mixture ratio, 1 series completion, 1 calendar day finding, 1 coding-decoding, 1 blood relation, 1 direction distance, 1 permutation of word.'
  }
];

export async function generateTargetChunk(
  ai: ReturnType<typeof createGoogleGenAIClient>,
  chunk: TargetExpansionChunk
): Promise<BPSCMockQuestion[]> {
  const prompt = `You are a Senior Academic Specialist crafting questions for the official BPSC Prelims Mock Examination.
Benchmarking: Testbook, ForumIAS, BPSC Pathshala, Habitat IAS, BPSC Concept Wallah.
Exam Pattern: BPSC 69th-71st latest pattern (Strictly 4 options: A, B, C, D; exactly 1 correct; -1/3 negative marking).

Create exactly ${chunk.count} original, high-quality BPSC-style MCQs for:
Subject: ${chunk.subject}
Subtopic: ${chunk.subtopic}
Is Bihar Special: ${chunk.isBiharSpecial}
Guidelines: ${chunk.guidelines}

CRITICAL QUALITY REQUIREMENTS:
1. Return strictly 4 options labeled "(A)", "(B)", "(C)", "(D)".
2. NO 5th option ("None of the above / More than one of the above" was abolished in BPSC 69th).
3. Exactly ONE option is unequivocally correct. Provide realistic, plausible distractors.
4. Provide a 2-3 sentence rigorous educational explanation with verifiable facts.
5. Set difficulty to EASY, MEDIUM, or HARD based on typical BPSC prelims distribution.
6. Set questionType to factual, conceptual, statement_based, matching, or assertion_reason.

Return ONLY a valid JSON array matching this exact schema:
[
  {
    "questionText": "...",
    "options": ["(A) ...", "(B) ...", "(C) ...", "(D) ..."],
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
      if (!match) throw new Error('No JSON array found in model response');

      const raw = JSON.parse(match[0]);
      const now = Date.now();
      const list: BPSCMockQuestion[] = [];

      for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (!item.options || item.options.length !== 4) continue;
        const contentHash = generateHash(item.questionText, item.options);
        const hash8 = contentHash.slice(0, 8);
        const subjSlug = chunk.subject.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const questionId = `mock:bpsc:${chunk.mockPaperId.toLowerCase()}:${subjSlug}:${hash8}`;

        const q: BPSCMockQuestion = {
          questionId,
          examId: 'BPSC_CCE',
          examStage: 'prelims',
          patternVersion: 'latest_4_options_one_third_neg',
          testType: chunk.testType,
          testSeriesName: chunk.testSeriesName,
          mockPaperId: chunk.mockPaperId,
          corpusBucket: 'PRACTICE_MOCK',
          sourceTier: 'SYNTHETIC_ORIGINAL',
          sourceName: chunk.sourceName,
          sourceType: 'ai_generated_mock',
          isAuthenticPYQ: false,
          isGenerated: true,
          subject: chunk.subject,
          subtopic: chunk.subtopic,
          isBiharSpecial: chunk.isBiharSpecial,
          questionType: (item.questionType || 'factual') as BPSCQuestionType,
          questionNumber: i + 1,
          questionText: item.questionText.trim(),
          options: [
            item.options[0].trim(),
            item.options[1].trim(),
            item.options[2].trim(),
            item.options[3].trim()
          ],
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
      await sleep(3500 * attempt);
    }
  }
  return [];
}

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🏛️  BPSC MOCK CORPUS EXPANSION: FLT-04 + GMA-01 + FLT-02 TOP-UP + SCI-01');
  console.log(`   Execution Mode: ${isExecute ? 'LIVE FIRESTORE WRITE' : 'DRY RUN'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const ai = createGoogleGenAIClient();
  const allQs: BPSCMockQuestion[] = [];

  for (let idx = 0; idx < EXPANSION_CHUNKS.length; idx++) {
    const chunk = EXPANSION_CHUNKS[idx];
    console.log(`[Chunk ${idx + 1}/${EXPANSION_CHUNKS.length}] ${chunk.mockPaperId} - ${chunk.subject} (${chunk.count} Qs)`);
    try {
      const questions = await generateTargetChunk(ai, chunk);
      console.log(`   ✅ Successfully synthesized ${questions.length} questions`);
      allQs.push(...questions);
    } catch (e: any) {
      console.error(`   ❌ Failed chunk ${chunk.subtopic}:`, e.message);
    }
  }

  console.log(`\n================================================================`);
  console.log(`Total New Mock Questions Synthesized: ${allQs.length}`);
  console.log(`================================================================\n`);

  // Staging save
  const stagingFile = 'd:/scholarly/dataset_staging/bpsc_mock_expansion_flt4_gma.json';
  fs.writeFileSync(stagingFile, JSON.stringify(allQs, null, 2), 'utf8');
  console.log(`💾 Saved staging cache to ${stagingFile}`);

  if (!isExecute) {
    console.log('\n[DRY RUN COMPLETE] To write directly to Firestore `bpsc_mock_questions`, pass --execute');
    process.exit(0);
  }

  console.log('\nCommitting to Firestore collection `bpsc_mock_questions`...');
  const col = db.collection('bpsc_mock_questions');
  const BATCH_SIZE = 50;
  for (let i = 0; i < allQs.length; i += BATCH_SIZE) {
    const batchList = allQs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const q of batchList) {
      batch.set(col.doc(q.questionId), q, { merge: true });
    }
    await batch.commit();
    console.log(`   Committed ${i + 1} to ${Math.min(i + BATCH_SIZE, allQs.length)} / ${allQs.length}`);
  }

  console.log('\n✅ Firestore ingestion complete! Collection `bpsc_mock_questions` updated.');
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}
