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

interface GenerationModule {
  testSeriesName: string;
  mockPaperId: string;
  testType: 'SECTIONAL' | 'FULL_LENGTH';
  sourceName: string;
  subject: BPSCSubject;
  subtopic: string;
  count: number;
  isBiharSpecial: boolean;
  questionTypes: string[];
  guidelines: string;
}

const MODULES: GenerationModule[] = [
  // ─── SET 1: Full-Length Test 02 (Benchmark: Testbook & ForumIAS Style) ───
  {
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    mockPaperId: 'BPSC_FLT_02',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook / ForumIAS Style',
    subject: 'History',
    subtopic: 'Modern History, Tribal & Peasant Movements in Bihar',
    count: 20,
    isBiharSpecial: true,
    questionTypes: ['statement_based', 'factual', 'matching'],
    guidelines:
      'Focus on Santhal Hul (1855 - Sidhu, Kanhu, Chand, Bhairav), Munda Ulgulan (Birsa Munda), Tana Bhagat Movement, Bakasht Movement (Karyanand Sharma, Rahul Sankrityayan in Monghyr/Barahiya Tal), Bihar Provincial Kisan Sabha conferences, Individual Civil Disobedience in Bihar (Shrikrishna Sinha), and Quit India parallel governments (e.g. Sultanpur, Siwan, Saharsa).'
  },
  {
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    mockPaperId: 'BPSC_FLT_02',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook / ForumIAS Style',
    subject: 'History',
    subtopic: 'Ancient India, Janapadas, Religious Movements & Art',
    count: 15,
    isBiharSpecial: false,
    questionTypes: ['factual', 'conceptual', 'matching'],
    guidelines:
      'Sixteen Mahajanapadas (Magadha, Anga, Vatsa, Kosala, Vajji sangha), Lichchhavi republic at Vaishali, Buddhist Sangha rules and Vinaya/Sutta pitaka councils, Jain Tirthankaras (Rishabhdev, Parshvanath, Mahavira at Kundagram/Pavapuri), Mauryan rock edicts (Barabar caves, Rampurva, Lauriya Nandangarh), and Pala bronzes (Dhiman and Vitpala).'
  },
  {
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    mockPaperId: 'BPSC_FLT_02',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook / ForumIAS Style',
    subject: 'General Science',
    subtopic: 'Physics, Thermodynamics & Modern Technology',
    count: 10,
    isBiharSpecial: false,
    questionTypes: ['conceptual', 'factual'],
    guidelines:
      'Total internal reflection and optical fiber applications, latent heat and evaporation cooling, Doppler effect in astronomy and radar, nuclear fission vs fusion in sun/stars, semiconductor diodes and solar cells, Bernoulli principle, escape velocity, and electromagnets.'
  },
  {
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    mockPaperId: 'BPSC_FLT_02',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook / ForumIAS Style',
    subject: 'General Science',
    subtopic: 'Chemical Compounds, Electrochemistry & Metallurgy',
    count: 10,
    isBiharSpecial: false,
    guidelines:
      'Galvanization and corrosion prevention, electrolysis and Faraday laws, bleaching powder, baking soda, plaster of Paris, hard vs soft water, isotopes and carbon-14 dating, soap vs detergent mechanism, and heavy metals toxicity (arsenic, lead, mercury/Minamata disease).'
  },
  {
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    mockPaperId: 'BPSC_FLT_02',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook / ForumIAS Style',
    subject: 'General Science',
    subtopic: 'Biology, Botany, Human Nutrition & Health',
    count: 10,
    isBiharSpecial: false,
    guidelines:
      'Photosynthesis light and dark reactions, plant hormones (auxins, gibberellins, abscisic acid, ethylene), blood groups (ABO, Rh factor compatibility), vaccines (mRNA, inactivated, viral vector), bacterial vs viral human diseases (tuberculosis, cholera, dengue, hepatitis), and enzymes as biocatalysts.'
  },
  {
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    mockPaperId: 'BPSC_FLT_02',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: BPSC Concept Wallah / Habitat IAS Style',
    subject: 'Current Affairs',
    subtopic: 'International Affairs, Bilateral Ties & Defense Exercises',
    count: 15,
    isBiharSpecial: false,
    guidelines:
      'SCO and BRICS summits, G20 outcomes, India bilateral defense exercises (e.g. Malabar, Nomadic Elephant, Surya Kiran, Yudh Abhyas), UN climate COP summits, Global Innovation Index, Nobel laureates, and prominent international appointments.'
  },
  {
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    mockPaperId: 'BPSC_FLT_02',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: BPSC Concept Wallah / Habitat IAS Style',
    subject: 'Current Affairs',
    subtopic: 'Bihar Governance, Schemes & State Highlights',
    count: 15,
    isBiharSpecial: true,
    guidelines:
      'Mukhyamantri Balika Cycle Yojana impact, Smart Prepaid Meter installation in Bihar, ethanol production promotion policy in Bihar, Rajgir glass bridge and nature safari, Sita Temple at Punaura Dham (Sitamarhi), Mithila Makhana GI Tag & exports, and Bihar sports honours.'
  },
  {
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    mockPaperId: 'BPSC_FLT_02',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook / ForumIAS Style',
    subject: 'Indian Polity & Economy',
    subtopic: 'Constitutional Articles, Amendments & Governance Systems',
    count: 15,
    isBiharSpecial: false,
    guidelines:
      'Preamble phrasing, Article 32 vs 226 writs, Anti-defection law (10th Schedule), Inter-State Council (Art 263), Finance Commission terms of reference, Comptroller and Auditor General (CAG), Right to Information Act, and National Human Rights Commission.'
  },
  {
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    mockPaperId: 'BPSC_FLT_02',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: BPSC Pathshala / Concept Wallah Style',
    subject: 'Indian Polity & Economy',
    subtopic: 'Macroeconomics, Banking & Bihar Economic Survey',
    count: 10,
    isBiharSpecial: true,
    guidelines:
      'Latest Bihar Economic Survey highlights (tertiary sector contribution, urbanization percentage in Bihar ~15.3%, road density, per capita electricity consumption), Fiscal Deficit targets under FRBM, NITI Aayog Multidimensional Poverty Index (MPI) findings for Bihar, and priority sector lending.'
  },
  {
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    mockPaperId: 'BPSC_FLT_02',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Testbook / Habitat IAS Style',
    subject: 'Geography',
    subtopic: 'Physiography of India & Bihar Geomorphology',
    count: 20,
    isBiharSpecial: true,
    guidelines:
      'Three physical divisions of Bihar (Shiwalik range/Someshwar hills, Bihar plains, Southern plateau), Someshwar fort height, Gandak and Kosi alluvial cones, oxbow lakes (Kanwar Lake in Begusarai as Ramsar site), hot springs of Rajgir and Munger (Sita Kund, Lakshman Kund), and agro-climatic zones of Bihar (Zone I, II, IIIA, IIIB).'
  },
  {
    testSeriesName: 'BPSC Prelims Advanced Mock Test Series (Set 2)',
    mockPaperId: 'BPSC_FLT_02',
    testType: 'FULL_LENGTH',
    sourceName: 'Benchmark Alignment: Standard 10-Question BPSC Math/Logic Pattern',
    subject: 'General Mental Ability',
    subtopic: 'Logical Reasoning & Quantitative Problem Solving',
    count: 10,
    isBiharSpecial: false,
    guidelines:
      '5 Reasoning (direction sense test, calendar day calculation, letter-number alternating series, syllogisms, circular arrangement) and 5 Math (simple & compound interest difference formula, mixture and alligation, work and wages, train passing a platform, permutations/combinations of letters).'
  },

  // ─── SET 2: Sectional Master Test: Bihar Special Complete Mastery (50 Qs) ───
  {
    testSeriesName: 'BPSC Sectional Master Series: Bihar Special Deep Dive',
    mockPaperId: 'BPSC_SEC_BIHAR_01',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: BPSC Pathshala & BPSC Academy Specifics',
    subject: 'History',
    subtopic: 'Bihar Medieval History & Architecture',
    count: 15,
    isBiharSpecial: true,
    guidelines:
      'Invasions of Bakhtiyar Khilji (destruction of Odantapuri/Nalanda), Nanyadeva and Karnata dynasty of Mithila, Cheru dynasty of Bhojpur/Palamu, Daud Khan Karrani, Subahdar of Bihar during Mughal period (Man Singh at Rohtasgarh), and Patna Kalam painting school (features, colors, prominent artists like Sevak Ram, Hulas Lal).'
  },
  {
    testSeriesName: 'BPSC Sectional Master Series: Bihar Special Deep Dive',
    mockPaperId: 'BPSC_SEC_BIHAR_01',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: BPSC Pathshala & BPSC Academy Specifics',
    subject: 'Geography',
    subtopic: 'Bihar Mineral Wealth, Rivers & Irrigation Projects',
    count: 15,
    isBiharSpecial: true,
    guidelines:
      'Kosi High Dam project, Western Gandak canal, Badua reservoir, pyrites deposit at Amjhore (Rohtas), bauxite at Kharagpur hills (Munger), steatite/soapstone in Shankarapur (Munger), quartzite in Gaya/Jamui, and major districts bordering Nepal, UP, West Bengal, and Jharkhand.'
  },
  {
    testSeriesName: 'BPSC Sectional Master Series: Bihar Special Deep Dive',
    mockPaperId: 'BPSC_SEC_BIHAR_01',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: BPSC Pathshala & BPSC Academy Specifics',
    subject: 'Indian Polity & Economy',
    subtopic: 'Bihar Administration, Panchayats & Industrial Policy',
    count: 20,
    isBiharSpecial: true,
    guidelines:
      'Bihar Legislative Assembly seats (243) and Legislative Council seats (75), 50% reservation for women in Bihar Panchayati Raj (since 2006), Bihar Public Grievance Redressal Act 2015, Bihar Right to Public Services Act 2011, Bihar Industrial Area Development Authority (BIADA) industrial clusters, and mega food parks in Bihar.'
  },

  // ─── SET 3: Sectional Master Test: General Science & Tech Mastery (50 Qs) ───
  {
    testSeriesName: 'BPSC Sectional Master Series: General Science Booster',
    mockPaperId: 'BPSC_SEC_SCI_01',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: ForumIAS & Testbook Science Standard',
    subject: 'General Science',
    subtopic: 'Applied Physical Sciences & Instruments',
    count: 15,
    isBiharSpecial: false,
    guidelines:
      'Galvanometer vs Ammeter vs Voltmeter, Sonar vs Radar, pyrometer for high temperatures, lactometer, barometer mercury column behavior before rain/storm, surface tension phenomena (capillary action, spherical raindrops), viscosity, and Newton laws in rocket propulsion.'
  },
  {
    testSeriesName: 'BPSC Sectional Master Series: General Science Booster',
    mockPaperId: 'BPSC_SEC_SCI_01',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: ForumIAS & Testbook Science Standard',
    subject: 'General Science',
    subtopic: 'Chemical Reactions, Everyday Chemistry & Environmental Toxins',
    count: 15,
    isBiharSpecial: false,
    guidelines:
      'Chemical names of plaster of paris, gypsum, washing soda, caustic soda, dry ice, laughing gas, acid rain components (sulfur dioxide and nitrogen oxides), greenhouse effect gases, ozone depletion by CFCs/Montreal protocol, heavy water in nuclear reactors, and synthetic detergents vs soaps.'
  },
  {
    testSeriesName: 'BPSC Sectional Master Series: General Science Booster',
    mockPaperId: 'BPSC_SEC_SCI_01',
    testType: 'SECTIONAL',
    sourceName: 'Benchmark Alignment: ForumIAS & Testbook Science Standard',
    subject: 'General Science',
    subtopic: 'Human Diseases, Immune System & Genetics',
    count: 20,
    isBiharSpecial: false,
    guidelines:
      'Antibiotics and penicillin discovery, insulin secretion by beta cells of islets of Langerhans, hemoglobin and oxygen transport, DNA double helix structure, human genetic disorders (hemophilia, color blindness, Down syndrome), communicable vs non-communicable diseases, and WHO disease elimination targets (Kala-Azar elimination in Bihar).'
  }
];

async function generateModule(
  ai: ReturnType<typeof createGoogleGenAIClient>,
  module: GenerationModule
): Promise<BPSCMockQuestion[]> {
  const prompt = `You are a Senior Academic Specialist crafting questions for the official BPSC Prelims Mock Examination.
We are modeling questions referencing leading institutions (Testbook, ForumIAS, BPSC Pathshala, Habitat IAS, BPSC Concept Wallah) and authentic BPSC 70th/71st trends.

Create exactly ${module.count} original, high-quality BPSC-style MCQs for:
Subject: ${module.subject}
Subtopic: ${module.subtopic}
Is Bihar Special: ${module.isBiharSpecial}
Reference Standard: ${module.sourceName}

Guidelines to strictly follow:
${module.guidelines}

CRITICAL RULES:
1. Every question MUST have STRICTLY 4 options: (A), (B), (C), (D).
2. Exactly ONE option must be unambiguously correct.
3. Distractors must be realistic, academic, plausible terms.
4. Do NOT duplicate authentic past questions. Formulate novel questions on the same core concepts.
5. Provide a 2-3 sentence educational explanation detailing why the answer is correct.
6. Output ONLY a valid JSON array:

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

  console.log(`   Generating ${module.count} questions for [${module.mockPaperId}: ${module.subtopic}]...`);
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const text = res.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(`No JSON array found in response for ${module.subtopic}`);
  }

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

  return list;
}

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🏛️  LARGE-SCALE BPSC MOCK CORPUS GENERATION (FLT-02 + SECTIONAL BOOSTERS)');
  console.log(`   Execution Mode: ${isExecute ? 'LIVE FIRESTORE WRITE' : 'DRY RUN'}`);
  console.log('   Target Collection: `bpsc_mock_questions` (Isolated Layer 2)');
  console.log('   Reference Sources: Testbook, ForumIAS, BPSC Pathshala, Concept Wallah, Habitat');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const ai = createGoogleGenAIClient();
  const allGenerated: BPSCMockQuestion[] = [];

  for (let m = 0; m < MODULES.length; m++) {
    const mod = MODULES[m];
    try {
      console.log(`[Module ${m + 1}/${MODULES.length}] ${mod.mockPaperId} - ${mod.subject}`);
      const qs = await generateModule(ai, mod);
      console.log(`      ✅ Generated ${qs.length} questions`);
      allGenerated.push(...qs);
    } catch (err: any) {
      console.error(`      ❌ Error in ${mod.subtopic}:`, err.message);
    }
  }

  console.log(`\n🎉 Total Additional Mock Questions Generated: ${allGenerated.length}`);

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
  console.log(`Bihar Special Questions: ${biharTotal} / ${allGenerated.length} (${Math.round((biharTotal / allGenerated.length) * 100)}%)`);

  // Staging save
  const stagingPath = 'd:/scholarly/dataset_staging/bpsc_mock_expansion_pool.json';
  fs.writeFileSync(stagingPath, JSON.stringify(allGenerated, null, 2), 'utf8');
  console.log(`\n💾 Saved local staging file: ${stagingPath}`);

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
  console.error('Pipeline failed:', err);
  process.exit(1);
});
