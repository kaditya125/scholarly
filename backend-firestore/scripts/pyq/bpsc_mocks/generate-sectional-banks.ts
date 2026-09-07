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

interface GenerationSpec {
  subject: BPSCSubject;
  subtopic: string;
  count: number;
  isBiharSpecial: boolean;
  guidelines: string;
}

const SPECS: GenerationSpec[] = [
  // 1. History & Bihar Special (35 Qs for FLT)
  {
    subject: 'History',
    subtopic: 'Modern History & Bihar Freedom Movement',
    count: 20,
    isBiharSpecial: true,
    guidelines:
      'Focus on Champaran Satyagraha, 1857 Revolt in Bihar (Babu Kunwar Singh, Amar Singh, Nishan Singh), Quit India Movement 1942 in Bihar (Secret Azad Dasta of Jayaprakash Narayan), Kisan Sabha (Swami Sahajanand Saraswati), Patna Secretariat firing, Bihar Provincial Congress.',
  },
  {
    subject: 'History',
    subtopic: 'Ancient & Medieval Indian History with Bihar Heritage',
    count: 15,
    isBiharSpecial: false,
    guidelines:
      'Focus on Mauryan administration & Ashokan pillar edicts, Gupta period, Nalanda and Vikramshila Mahaviharas, Buddhism councils (Rajgriha, Vaishali, Pataliputra), Sher Shah Suri administration and Sasaram architecture, Pala rulers.',
  },

  // 2. General Science (30 Qs for FLT)
  {
    subject: 'General Science',
    subtopic: 'Physics & Physical Phenomena',
    count: 10,
    isBiharSpecial: false,
    guidelines:
      'Everyday physics, optics (lenses, reflection, dispersion), electromagnetic spectrum, thermodynamics, acoustics, gravitation, electrical circuits, SI units, and modern scientific instruments.',
  },
  {
    subject: 'General Science',
    subtopic: 'Chemistry & Applied Chemical Sciences',
    count: 10,
    isBiharSpecial: false,
    guidelines:
      'Acids, bases and salts, pH values of common substances, polymers and synthetic fibers, ores and metallurgy, allotropes of carbon, noble gases, greenhouse gases, common chemical compounds and their commercial names.',
  },
  {
    subject: 'General Science',
    subtopic: 'Biology, Human Physiology & Health',
    count: 10,
    isBiharSpecial: false,
    guidelines:
      'Cell organelles and functions, human digestive, respiratory and circulatory systems, hormones and endocrine glands, vitamins and deficiency diseases, communicable diseases, genetics, and biotechnology.',
  },

  // 3. Current Affairs & Bihar Initiatives (30 Qs for FLT)
  {
    subject: 'Current Affairs',
    subtopic: 'National & International Summits, Awards, Defense & Science',
    count: 15,
    isBiharSpecial: false,
    guidelines:
      'Key multilateral summits, major international geopolitical developments, space missions (ISRO & NASA), prestigious awards (Nobel, Ramon Magsaysay, Bharat Ratna), military exercises, and GI tags.',
  },
  {
    subject: 'Current Affairs',
    subtopic: 'Bihar State Government Schemes & Current Developments',
    count: 15,
    isBiharSpecial: true,
    guidelines:
      'Saat Nishchay-2 initiatives (Har Ghar Nal Ka Jal, Yuva Shakti, etc.), Jal-Jeevan-Hariyali mission, state awards and personalities, sport achievements of Bihar athletes, eco-tourism projects, and major infrastructure links in Bihar.',
  },

  // 4. Indian Polity & Economy (25 Qs for FLT)
  {
    subject: 'Indian Polity & Economy',
    subtopic: 'Indian Constitution, Governance & Federalism',
    count: 15,
    isBiharSpecial: false,
    guidelines:
      'Preamble, Fundamental Rights & DPSP, Emergency provisions, President and Governor constitutional powers, Supreme Court and High Courts, Panchayati Raj (73rd and 74th Amendments), Election Commission and Statutory Commissions.',
  },
  {
    subject: 'Indian Polity & Economy',
    subtopic: 'Indian Economy & Bihar Budget / Economic Survey',
    count: 10,
    isBiharSpecial: true,
    guidelines:
      'Key findings of Bihar Economic Survey (GSDP growth rate, per capita income, primary vs secondary sector shares), state budget fiscal deficit targets, GST, inflation indices (CPI/WPI), RBI monetary policy tools, and central devolution to Bihar.',
  },

  // 5. Geography (20 Qs for FLT)
  {
    subject: 'Geography',
    subtopic: 'Physical, Regional & Bihar Geography',
    count: 20,
    isBiharSpecial: true,
    guidelines:
      'Ganga river and its northern/southern tributaries (Gandak, Kosi, Son, Punpun), soil types of Bihar (Terai, Bal-sundari, Karail-Kewal), climate zones of Bihar, mineral resources of Bihar (limestone in Rohtas, pyrites in Amjhore, mica in Nawada/Gaya), forest cover (ISFR data for Bihar), and major national parks/wildlife sanctuaries.',
  },

  // 6. General Mental Ability (10 Qs for FLT)
  {
    subject: 'General Mental Ability',
    subtopic: 'Logical Reasoning & Quantitative Aptitude',
    count: 10,
    isBiharSpecial: false,
    guidelines:
      'Standard BPSC 10-question pattern: 5 Logical Reasoning (coding-decoding, blood relations, odd-one-out, rank ordering, seating) and 5 Quantitative Aptitude (time & work, speed-distance-time, clocks and angles, percentage & profit-loss, number series).',
  },
];

async function generateBatch(
  ai: ReturnType<typeof createGoogleGenAIClient>,
  spec: GenerationSpec
): Promise<BPSCMockQuestion[]> {
  const prompt = `You are a Senior Academic Specialist designing the official BPSC Prelims Mock Examination.
Create exactly ${spec.count} original, high-quality, authentic BPSC-style objective questions for:
Subject: ${spec.subject}
Subtopic: ${spec.subtopic}
Is Bihar Special: ${spec.isBiharSpecial}

Guidelines to strictly follow:
${spec.guidelines}

CRITICAL RULES:
1. Every question MUST have STRICTLY 4 options: (A), (B), (C), (D). NO 5th option.
2. Only ONE option must be unambiguously factually correct.
3. Distractors must be plausible, historically/scientifically accurate terms, avoiding obvious nonsense.
4. Do NOT duplicate or copy exact authentic PYQ text. Create fresh questions testing the authentic concepts.
5. Provide a clear, educational, 2-3 sentence explanation explaining why the correct answer is right.
6. Output ONLY a valid JSON array matching this exact schema:

[
  {
    "questionText": "Question stem in clear English...",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correctAnswer": "A", // Strictly "A", "B", "C", or "D"
    "explanation": "Detailed explanation...",
    "difficulty": "MEDIUM", // "EASY", "MEDIUM", or "HARD"
    "questionType": "factual" // "factual", "conceptual", "statement_based", or "matching"
  }
]`;

  console.log(`   Generating ${spec.count} questions for [${spec.subject}: ${spec.subtopic}]...`);
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const text = res.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(`Failed to parse JSON response for ${spec.subject}`);
  }

  const raw = JSON.parse(match[0]);
  const now = Date.now();
  const questions: BPSCMockQuestion[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item.options || item.options.length !== 4) continue;
    const contentHash = generateHash(item.questionText, item.options);
    const hash8 = contentHash.slice(0, 8);
    const questionId = `mock:bpsc:${spec.subject.toLowerCase().replace(/[^a-z0-9]/g, '_')}:${hash8}`;

    const q: BPSCMockQuestion = {
      questionId,
      examId: 'BPSC_CCE',
      examStage: 'prelims',
      patternVersion: 'latest_4_options_one_third_neg',
      testType: 'SECTIONAL',
      testSeriesName: 'Sadhya BPSC 71st/72nd Target Series',
      corpusBucket: 'PRACTICE_MOCK',
      sourceTier: 'SYNTHETIC_ORIGINAL',
      sourceName: 'Sadhya Academic Engine (BPSC Pattern Aligned)',
      sourceType: 'ai_generated_mock',
      isAuthenticPYQ: false, // GUARANTEED FALSE
      isGenerated: true,
      subject: spec.subject,
      subtopic: spec.subtopic,
      isBiharSpecial: spec.isBiharSpecial,
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
    questions.push(q);
  }

  return questions;
}

async function main() {
  const isExecute = process.argv.includes('--execute');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🏛️  BPSC LATEST-PATTERN MOCK CORPUS GENERATION & ISOLATION PIPELINE');
  console.log(`   Execution Mode: ${isExecute ? 'LIVE FIRESTORE WRITE' : 'DRY RUN'}`);
  console.log('   Target Collection: `bpsc_mock_questions` (100% Isolated from `pyq_questions`)');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const ai = createGoogleGenAIClient();
  const allMockQuestions: BPSCMockQuestion[] = [];

  for (const spec of SPECS) {
    try {
      const qs = await generateBatch(ai, spec);
      console.log(`      ✅ Generated ${qs.length} valid questions for ${spec.subtopic}`);
      allMockQuestions.push(...qs);
    } catch (err: any) {
      console.error(`      ❌ Error in ${spec.subtopic}:`, err.message);
    }
  }

  console.log(`\nTotal Original Mock Questions Generated: ${allMockQuestions.length}`);

  // Subject and Difficulty Audit
  const subjCounts: Record<string, number> = {};
  const diffCounts: Record<string, number> = {};
  const biharCount = allMockQuestions.filter((q) => q.isBiharSpecial).length;

  for (const q of allMockQuestions) {
    subjCounts[q.subject] = (subjCounts[q.subject] || 0) + 1;
    diffCounts[q.difficulty] = (diffCounts[q.difficulty] || 0) + 1;
  }

  console.log('\nSubject Distribution:');
  console.table(subjCounts);
  console.log('Difficulty Distribution:');
  console.table(diffCounts);
  console.log(`Bihar Special Questions: ${biharCount} (${Math.round((biharCount / allMockQuestions.length) * 100)}%)`);

  // Save local staging copy
  const stagingPath = 'd:/scholarly/dataset_staging/bpsc_mock_questions_pool.json';
  fs.writeFileSync(stagingPath, JSON.stringify(allMockQuestions, null, 2), 'utf8');
  console.log(`\n💾 Saved staging copy to ${stagingPath}`);

  if (!isExecute) {
    console.log('\n[DRY-RUN] Pass --execute to commit to Firestore collection `bpsc_mock_questions`.');
    process.exit(0);
  }

  console.log('\n[Phase 1/1] Committing to isolated Firestore collection `bpsc_mock_questions`...');
  const mockCol = db.collection('bpsc_mock_questions');
  const BATCH_SIZE = 50;
  for (let i = 0; i < allMockQuestions.length; i += BATCH_SIZE) {
    const chunk = allMockQuestions.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const q of chunk) {
      batch.set(mockCol.doc(q.questionId), q, { merge: true });
    }
    await batch.commit();
    console.log(`   Saved ${i + 1} to ${Math.min(i + BATCH_SIZE, allMockQuestions.length)} / ${allMockQuestions.length}`);
  }

  console.log('\n✅ Successfully ingested all original BPSC mock questions into isolated collection `bpsc_mock_questions`!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal pipeline error:', err);
  process.exit(1);
});
