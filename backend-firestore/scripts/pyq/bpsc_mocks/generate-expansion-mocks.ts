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

interface GenerationModule {
  testSeriesName: string;
  mockPaperId: string;
  testType: 'SECTIONAL' | 'FULL_LENGTH';
  sourceName: string;
  subject: BPSCSubject;
  subtopic: string;
  count: number;
  isBiharSpecial: boolean;
  guidelines: string;
}

const EXPANSION_MODULES: GenerationModule[] = [
  // ─── FULL-LENGTH TEST 03: Comprehensive Modern + Conceptual Benchmark ───
  // (References: ForumIAS BPSC Pre Simulator & Concept Wallah)
  {
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 03)',
    mockPaperId: 'BPSC_FLT_03',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: ForumIAS & BPSC Concept Wallah',
    subject: 'History',
    subtopic: 'Modern National Movement & Revolutionary Activities in Bihar',
    count: 20,
    isBiharSpecial: true,
    guidelines:
      'Include: Swadeshi Movement impact in Bihar, Deoghar Conspiracy case, Patna Yuvak Sangh (Manindra Narayan Ray), Bihar Socialist Party (1931 - Ganga Sharan Singh, Rambriksh Benipuri), Subhas Chandra Bose visit to Bihar, 1937 Cabinet formation in Bihar under Mohammad Yunus and Shrikrishna Sinha, and Women freedom fighters of Bihar (Prabhavati Devi, Sharda Kumari, Rampyari Devi).'
  },
  {
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 03)',
    mockPaperId: 'BPSC_FLT_03',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: ForumIAS & BPSC Concept Wallah',
    subject: 'History',
    subtopic: 'Ancient Empires, Foreign Travellers & Epigraphy',
    count: 15,
    isBiharSpecial: false,
    guidelines:
      'Include: Megasthenes account of Pataliputra municipal administration (6 boards of 5 members), Fa-Hien and Hiuen Tsang accounts, Arthashastra saptanga theory, Harshavardhana Kannauj assembly, Gupta numismatics, Chola administration village assemblies (Uttaramerur), and Sangam literature.'
  },
  {
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 03)',
    mockPaperId: 'BPSC_FLT_03',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook Science Benchmark',
    subject: 'General Science',
    subtopic: 'Physics: Mechanics, Electricity & Magnetic Effects',
    count: 10,
    isBiharSpecial: false,
    guidelines:
      'Include: Transformer step-up and step-down principle, Ohm law and resistance in series/parallel, Fleming left-hand and right-hand rules, electromagnetic induction, optical illusions (mirage, looming), simple pendulum time period factors, and buoyancy/Archimedes principle.'
  },
  {
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 03)',
    mockPaperId: 'BPSC_FLT_03',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook Science Benchmark',
    subject: 'General Science',
    subtopic: 'Chemistry: Environmental Chemistry, Fuels & Non-metals',
    count: 10,
    isBiharSpecial: false,
    guidelines:
      'Include: Calorific value of fuels (hydrogen vs CNG vs petrol), allotropes of phosphorus (white vs red phosphorus in matches), fullerenes, smog (classical vs photochemical smog), artificial rain using silver iodide, carbon monoxide poisoning mechanism, and hard water softening methods (zeolite/permutit process).'
  },
  {
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 03)',
    mockPaperId: 'BPSC_FLT_03',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook Science Benchmark',
    subject: 'General Science',
    subtopic: 'Biology: Human Systems, Pathogens & Biotechnology',
    count: 10,
    isBiharSpecial: false,
    guidelines:
      'Include: Nephron structure and urine formation, pituitary gland master role and hormones, artificial kidney/hemodialysis, bacterial diseases (typhoid - Widal test, tetanus, pertussis), vector-borne diseases (malaria life cycle in Anopheles), CRISPR-Cas9 basics, and stem cells.'
  },
  {
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 03)',
    mockPaperId: 'BPSC_FLT_03',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Habitat IAS & Current Trends',
    subject: 'Current Affairs',
    subtopic: 'National & Global Indices, Environment & Summits',
    count: 15,
    isBiharSpecial: false,
    guidelines:
      'Include: World Press Freedom Index, Human Development Index (HDI) components, Ramsar Wetland sites in India, Tiger Census updates (Project Tiger 50 years), Mission LiFE, Chandrayaan-3 and Aditya-L1 instruments, and international treaties ratified by India.'
  },
  {
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 03)',
    mockPaperId: 'BPSC_FLT_03',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: BPSC Pathshala Bihar Special Standard',
    subject: 'Current Affairs',
    subtopic: 'Bihar State Policies, Industrial Projects & Welfare Schemes',
    count: 15,
    isBiharSpecial: true,
    guidelines:
      'Include: Mukhyamantri Udyami Yojana (benefits for SC/ST/EBC/Women), Bihar Biofuel Promotion Policy, Har Ghar Gangajal project (Rajgir, Gaya, Nawada, Bodh Gaya pipeline), Ramayana Circuit sites in Bihar, and Bihar state disaster mitigation initiatives (Lightning alert app - INDRAVAJRA).'
  },
  {
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 03)',
    mockPaperId: 'BPSC_FLT_03',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: ForumIAS & Testbook Polity Benchmark',
    subject: 'Indian Polity & Economy',
    subtopic: 'Constitutional Bodies, Judiciary & Federal Relations',
    count: 15,
    isBiharSpecial: false,
    guidelines:
      'Include: Finance Commission recommendations formula, Union Public Service Commission constitutional powers, Special provisions for states (Article 371 series), collegium system for judicial appointments, National Emergency impacts on fundamental rights (Article 358 vs 359), and basic structure doctrine cases (Kesavananda Bharati, Minerva Mills).'
  },
  {
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 03)',
    mockPaperId: 'BPSC_FLT_03',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: BPSC Pathshala & Economic Survey',
    subject: 'Indian Polity & Economy',
    subtopic: 'Fiscal Policies, Inflation & Bihar Economic Parameters',
    count: 10,
    isBiharSpecial: true,
    guidelines:
      'Include: Bihar Economic Survey sectoral growth rates (Primary, Secondary, Tertiary), revenue surplus vs fiscal deficit in Bihar Budget, per capita income disparity among Bihar districts (Patna vs Sheohar), Mukhyamantri Gram Sampark Yojana, and rural electrification in Bihar.'
  },
  {
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 03)',
    mockPaperId: 'BPSC_FLT_03',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Habitat IAS & Testbook Geography',
    subject: 'Geography',
    subtopic: 'Indian & Bihar Rivers, Drainage Systems & National Parks',
    count: 20,
    isBiharSpecial: true,
    guidelines:
      'Include: Valmiki National Park in West Champaran, Bhimbandh Wildlife Sanctuary in Munger, Kaimur Wildlife Sanctuary, rivers originating in Himalayas vs peninsular rivers entering Bihar, average annual rainfall of Bihar (~1000-1200 mm, maximum in Kishanganj), and flood control in North Bihar.'
  },
  {
    testSeriesName: 'BPSC Target 71st/72nd Prelims Simulator (FLT 03)',
    mockPaperId: 'BPSC_FLT_03',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: 10-Q BPSC General Mental Ability Pattern',
    subject: 'General Mental Ability',
    subtopic: 'Aptitude, Counting Figures & Logical Analysis',
    count: 10,
    isBiharSpecial: false,
    guidelines:
      'Include: 5 Reasoning (counting triangles in complex figures, seating arrangement around a square/circle, letter pattern series, analogy words, statement-assumption) and 5 Math (pipe & cistern emptying/filling rates, boat and stream upstream/downstream, geometric progression, ratio and proportion in partnership business).'
  },

  // ─── SECTIONAL SPECIAL 01: Complete Indian Polity & Constitution Booster (50 Qs) ───
  {
    testSeriesName: 'BPSC Sectional Master Series: Indian Polity & Governance',
    mockPaperId: 'BPSC_SEC_POLITY_01',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: ForumIAS & BPSC Academy Standard',
    subject: 'Indian Polity & Economy',
    subtopic: 'Fundamental Rights, DPSP & Fundamental Duties',
    count: 25,
    isBiharSpecial: false,
    guidelines:
      'Include: Article 19 freedoms and reasonable restrictions, Article 21 expansive interpretation (privacy, clean environment, right to travel abroad), Uniform Civil Code (Art 44), separation of judiciary (Art 50), 86th Amendment and Article 21A/51A(k), Swaran Singh committee recommendations, and unenumerated rights.'
  },
  {
    testSeriesName: 'BPSC Sectional Master Series: Indian Polity & Governance',
    mockPaperId: 'BPSC_SEC_POLITY_01',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: ForumIAS & BPSC Academy Standard',
    subject: 'Indian Polity & Economy',
    subtopic: 'Parliamentary Procedures, Motions & State Legislature',
    count: 25,
    isBiharSpecial: false,
    guidelines:
      'Include: Money Bill vs Financial Bill (Article 110 vs 117), Calling Attention Motion vs Adjournment Motion, Guillotine in budget voting, Public Accounts Committee (PAC) composition and functions, Estimates Committee, Council of Ministers collective responsibility (Article 75(3)), and Legislative Council creation/abolition procedure (Article 169).'
  },

  // ─── SECTIONAL SPECIAL 02: Indian & Bihar Geography Mastery (50 Qs) ───
  {
    testSeriesName: 'BPSC Sectional Master Series: Comprehensive Geography Booster',
    mockPaperId: 'BPSC_SEC_GEO_01',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: Testbook & BPSC Concept Wallah',
    subject: 'Geography',
    subtopic: 'Indian Physical Geography, Monsoons & Agriculture',
    count: 25,
    isBiharSpecial: false,
    guidelines:
      'Include: Southwest monsoon branches (Arabian Sea vs Bay of Bengal), Western Disturbances in winter crops, El Niño and La Niña impacts on Indian agriculture, soil types of India (Alluvial, Black/Regur, Red & Yellow, Laterite), major multipurpose dam projects (Bhakra Nangal, Hirakud, Sardar Sarovar), and major crop seasons (Kharif, Rabi, Zaid).'
  },
  {
    testSeriesName: 'BPSC Sectional Master Series: Comprehensive Geography Booster',
    mockPaperId: 'BPSC_SEC_GEO_01',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: BPSC Pathshala & Bihar State Geography',
    subject: 'Geography',
    subtopic: 'Bihar Districts, Soils, Forest Density & Hydro-geography',
    count: 25,
    isBiharSpecial: true,
    guidelines:
      'Include: Districts bordering Nepal (7 districts: West Champaran, East Champaran, Sitamarhi, Madhubani, Supaul, Araria, Kishanganj), districts bordering UP (8 districts), districts bordering Jharkhand (8 districts), forest cover percentages according to latest ISFR (Kaimur highest percentage, Sheikhpura lowest), Barakar and Punpun river origins, and Bihar flood zones.'
  }
];

async function generateModuleWithRetry(
  ai: ReturnType<typeof createGoogleGenAIClient>,
  module: GenerationModule,
  retries = 3
): Promise<BPSCMockQuestion[]> {
  const prompt = `You are a Premier Academic Specialist preparing authentic questions for the BPSC Prelims Mock Examination.
Benchmarked against standard exam content from Testbook, ForumIAS, BPSC Pathshala, and Habitat IAS.

Generate exactly ${module.count} original, high-quality BPSC-style objective MCQs for:
Subject: ${module.subject}
Subtopic: ${module.subtopic}
Is Bihar Special: ${module.isBiharSpecial}
Reference Benchmark: ${module.sourceName}

Guidelines to strictly follow:
${module.guidelines}

STRICT BPSC RULES:
1. Every question MUST have exactly 4 options: (A), (B), (C), (D).
2. Exactly ONE option must be factually correct.
3. Distractors must be plausible, realistic terms.
4. Difficulty must be distributed: include EASY, MEDIUM, and HARD questions.
5. Provide a 2-3 sentence educational explanation for why the answer is correct.
6. Output ONLY a valid JSON array matching this exact schema:

[
  {
    "questionText": "...",
    "options": ["...", "...", "...", "..."],
    "correctAnswer": "A", // "A", "B", "C", or "D"
    "explanation": "...",
    "difficulty": "MEDIUM", // "EASY", "MEDIUM", or "HARD"
    "questionType": "factual" // "factual", "conceptual", "statement_based", or "matching"
  }
]`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`   Generating ${module.count} questions for [${module.mockPaperId}: ${module.subtopic}] (Attempt ${attempt}/${retries})...`);
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = res.text || '';
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array found in response');

      const raw = JSON.parse(match[0]);
      const now = Date.now();
      const list: BPSCMockQuestion[] = [];

      for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (!item.options || item.options.length !== 4) continue;
        const contentHash = generateHash(item.questionText, item.options);
        const hash8 = contentHash.slice(0, 8);
        const questionId = `mock:bpsc:${module.mockPaperId.toLowerCase()}:${module.subject.toLowerCase().replace(/[^a-z0-9]/g, '_')}:${hash8}`;

        const q: BPSCMockQuestion = {
          questionId,
          examId: 'BPSC_CCE',
          examStage: 'prelims',
          patternVersion: 'latest_4_options_one_third_neg',
          testType: module.testType,
          testSeriesName: module.testSeriesName,
          mockPaperId: module.mockPaperId,
          corpusBucket: 'PRACTICE_MOCK',
          sourceTier: 'SYNTHETIC_ORIGINAL',
          sourceName: module.sourceName,
          sourceType: 'ai_generated_mock',
          isAuthenticPYQ: false, // HARD INVARIANT
          isGenerated: true,
          subject: module.subject,
          subtopic: module.subtopic,
          isBiharSpecial: module.isBiharSpecial,
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

      await sleep(2000); // 2s pacing between calls
      return list;
    } catch (err: any) {
      console.warn(`      ⚠️ Attempt ${attempt} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await sleep(5000 * attempt); // exponential backoff
    }
  }
  return [];
}

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🚀 EXPANDED MULTI-SET BPSC MOCK GENERATION: FLT-03 + SECTIONAL MASTERS');
  console.log(`   Execution Mode: ${isExecute ? 'LIVE FIRESTORE WRITE' : 'DRY RUN'}`);
  console.log('   Target Collection: `bpsc_mock_questions` (Isolated Layer 2)');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const ai = createGoogleGenAIClient();
  const allGenerated: BPSCMockQuestion[] = [];

  for (let i = 0; i < EXPANSION_MODULES.length; i++) {
    const mod = EXPANSION_MODULES[i];
    try {
      console.log(`[Batch ${i + 1}/${EXPANSION_MODULES.length}] ${mod.mockPaperId} - ${mod.subject}`);
      const qs = await generateModuleWithRetry(ai, mod);
      console.log(`      ✅ Generated ${qs.length} questions`);
      allGenerated.push(...qs);
    } catch (err: any) {
      console.error(`      ❌ Error in ${mod.subtopic}:`, err.message);
    }
  }

  console.log(`\n🎉 Total New Mock Questions Generated: ${allGenerated.length}`);

  const papers: Record<string, number> = {};
  const subjects: Record<string, number> = {};
  const diffs: Record<string, number> = {};
  let biharTotal = 0;

  for (const q of allGenerated) {
    const p = q.mockPaperId || 'UNKNOWN';
    papers[p] = (papers[p] || 0) + 1;
    subjects[q.subject] = (subjects[q.subject] || 0) + 1;
    diffs[q.difficulty] = (diffs[q.difficulty] || 0) + 1;
    if (q.isBiharSpecial) biharTotal++;
  }

  console.log('\nBreakdown by Mock Paper / Sectional Series:');
  console.table(papers);
  console.log('\nSubject Distribution:');
  console.table(subjects);
  console.log('\nDifficulty Distribution:');
  console.table(diffs);
  console.log(`Bihar Special Coverage: ${biharTotal} / ${allGenerated.length} (${Math.round((biharTotal / allGenerated.length) * 100)}%)`);

  // Staging save
  const stagingPath = 'd:/scholarly/dataset_staging/bpsc_mock_expansion_flt3_sectionals.json';
  fs.writeFileSync(stagingPath, JSON.stringify(allGenerated, null, 2), 'utf8');
  console.log(`\n💾 Saved local staging copy to ${stagingPath}`);

  if (!isExecute) {
    console.log('\n[DRY-RUN] Pass --execute to commit to Firestore.');
    process.exit(0);
  }

  console.log('\n[Phase 1/1] Ingesting into isolated collection `bpsc_mock_questions`...');
  const mockCol = db.collection('bpsc_mock_questions');
  const BATCH_SIZE = 50;
  for (let i = 0; i < allGenerated.length; i += BATCH_SIZE) {
    const chunk = allGenerated.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const q of chunk) {
      batch.set(mockCol.doc(q.questionId), q, { merge: true });
    }
    await batch.commit();
    console.log(`   Committed ${i + 1} to ${Math.min(i + BATCH_SIZE, allGenerated.length)} / ${allGenerated.length}`);
  }

  console.log('\n✅ Successfully committed all new mock questions to `bpsc_mock_questions`!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
