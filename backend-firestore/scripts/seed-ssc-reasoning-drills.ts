/**
 * seed-ssc-reasoning-drills.ts
 *
 * Ingests pristine, classified reasoning questions from S. Chand and Rakesh Yadav
 * into question_bank, and creates dedicated topic-wise practice drills for:
 * SSC Scientific Assistant (IMD) / SSC Junior Engineer (Paper-I: General Intelligence & Reasoning 14.2.1)
 */

import { db } from '../src/config/firebase';
import { MockTest, Question } from '../src/types/tests.types';

function cleanText(s?: string): string {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log('🚀 Starting S. Chand & Rakesh Yadav Reasoning Corpus Ingestion for SSC JE/IMD...');

  // 1. Query classified reasoning questions from book_questions
  const snap = await db.collection('book_questions')
    .where('status', '==', 'CLASSIFIED')
    .where('subject', '==', 'REASONING')
    .get();

  console.log(`Fetched ${snap.size} total CLASSIFIED reasoning candidates from book_questions.`);

  const topicMapping: Record<string, string> = {
    'analogy': 'Analogy & Similarities',
    'analogy and similarity': 'Analogy & Similarities',
    'classification': 'Classification & Odd One Out',
    'coding decoding': 'Coding-Decoding',
    'coding-decoding': 'Coding-Decoding',
    'series': 'Number & Alphabet Series',
    'series completion': 'Number & Alphabet Series',
    'number series': 'Number & Alphabet Series',
    'blood relation': 'Blood Relations',
    'blood relations': 'Blood Relations',
    'direction': 'Direction Sense & Spatial Orientation',
    'direction sense test': 'Direction Sense & Spatial Orientation',
    'syllogism': 'Syllogism & Deductive Logic',
    'logic': 'Syllogism & Deductive Logic',
    'statement arguments and assumptions': 'Syllogism & Deductive Logic',
    'statement - conclusions': 'Syllogism & Deductive Logic',
    'mathematical operations': 'Arithmetical Reasoning & Operations',
    'symbols & notations': 'Arithmetical Reasoning & Operations',
    'arithmetical problem': 'Arithmetical Reasoning & Operations',
    'arithmetical reasoning': 'Arithmetical Reasoning & Operations',
    'logical venn diagrams': 'Venn Diagrams & Set Relations',
    'puzzle test': 'Puzzles & Seating Arrangements',
    'ranking & sitting arrangement': 'Puzzles & Seating Arrangements',
    'alphabet test': 'Alphabet & Word Formation',
    'word formation': 'Alphabet & Word Formation',
    'decision making': 'Decision Making & Problem Solving',
  };

  const validQuestionsByTopic: Record<string, Question[]> = {};

  snap.docs.forEach((doc) => {
    const data = doc.data();
    const rawTopic = (data.topicName || data.chapterName || '').trim().toLowerCase();
    const canonicalTopic = topicMapping[rawTopic];
    if (!canonicalTopic) return;

    const stem = cleanText(data.stem || data.sharedDirections || '');
    if (!stem || stem.length < 5) return;
    if (/non-verbal question \d+ \(figures\)/i.test(stem)) return; // Skip figure-only placeholder text

    const options = (data.options || []).map((o: any) => cleanText(String(o)));
    if (options.length !== 4 || options.some((o: string) => !o || o.length === 0)) return;

    const answerIdx = typeof data.answerIndex === 'number' && data.answerIndex >= 0 && data.answerIndex < 4
      ? data.answerIndex
      : 0;

    const sourceBook = data.bookId === 'ry_ssc_reasoning'
      ? 'Rakesh Yadav SSC Reasoning'
      : 'S. Chand Verbal & Non-Verbal Reasoning';

    const q: Question = {
      id: `rq_${doc.id}`,
      examId: 'SSC_IMD_PAPER1',
      subject: 'General Intelligence and Reasoning',
      topic: canonicalTopic,
      section: canonicalTopic,
      difficulty: data.difficulty === 'HARD' ? 'Hard' : data.difficulty === 'EASY' ? 'Easy' : 'Medium',
      text: stem,
      options,
      correctAnswerIndex: answerIdx,
      explanation: cleanText(data.solution || (data.solutionStrategy && data.solutionStrategy.join(' ')) || `Correct option is (${String.fromCharCode(65 + answerIdx)}): ${options[answerIdx]}`),
      marks: 1,
      negativeMarks: 0.25,
      sourcePaper: sourceBook,
      sourceYear: 2026,
      questionOrigin: 'AUTHENTIC_PYQ',
    };

    if (!validQuestionsByTopic[canonicalTopic]) validQuestionsByTopic[canonicalTopic] = [];
    validQuestionsByTopic[canonicalTopic].push(q);
  });

  console.log('\nValidated clean questions by topic:');
  Object.entries(validQuestionsByTopic).forEach(([k, v]) => console.log(`  ${k}: ${v.length} questions`));

  // Batch persist into question_bank
  const allValidQuestions = Object.values(validQuestionsByTopic).flat();
  console.log(`\nPersisting ${allValidQuestions.length} reasoning questions into question_bank...`);

  const BATCH_SIZE = 400;
  for (let i = 0; i < allValidQuestions.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = allValidQuestions.slice(i, i + BATCH_SIZE);
    for (const q of chunk) {
      batch.set(db.collection('question_bank').doc(q.id), q, { merge: true });
    }
    await batch.commit();
  }
  console.log('✅ Successfully persisted into question_bank.');

  // Create dedicated topic drills
  const drills: Array<{
    id: string;
    title: string;
    topicKey: string;
    count: number;
    duration: number;
    badge: string;
    description: string;
  }> = [
    {
      id: 'ssc_imd_reasoning_analogy_30q',
      title: 'Analogies & Similarities Practice Drill (30 Qs)',
      topicKey: 'Analogy & Similarities',
      count: 30,
      duration: 20,
      badge: 'ANALOGY DRILL',
      description: '30 high-yield questions on Word, Number and Letter Analogies from S. Chand & Rakesh Yadav corpus.',
    },
    {
      id: 'ssc_imd_reasoning_classification_30q',
      title: 'Classification & Odd-One-Out Drill (30 Qs)',
      topicKey: 'Classification & Odd One Out',
      count: 30,
      duration: 20,
      badge: 'CLASSIFICATION',
      description: '30 questions on semantic categorization, word classification and number odd-one-out.',
    },
    {
      id: 'ssc_imd_reasoning_series_30q',
      title: 'Number & Alphabet Series Speed Drill (30 Qs)',
      topicKey: 'Number & Alphabet Series',
      count: 30,
      duration: 20,
      badge: 'SERIES DRILL',
      description: '30 questions covering arithmetic progressions, geometric differences and alphabet sequence patterns.',
    },
    {
      id: 'ssc_imd_reasoning_coding_30q',
      title: 'Coding & Decoding Practice Drill (30 Qs)',
      topicKey: 'Coding-Decoding',
      count: 30,
      duration: 20,
      badge: 'CODING DRILL',
      description: '30 questions covering letter shifting, number substitutions and deciphering coded messages.',
    },
    {
      id: 'ssc_imd_reasoning_blood_relations_30q',
      title: 'Blood Relations & Family Tree Drill (30 Qs)',
      topicKey: 'Blood Relations',
      count: 30,
      duration: 20,
      badge: 'RELATIONS DRILL',
      description: '30 questions on family relationship chains, coded relations and genealogical tree deduction.',
    },
    {
      id: 'ssc_imd_reasoning_syllogism_30q',
      title: 'Syllogisms & Deductive Logic Drill (30 Qs)',
      topicKey: 'Syllogism & Deductive Logic',
      count: 30,
      duration: 20,
      badge: 'SYLLOGISM DRILL',
      description: '30 questions on 2-statement and 3-statement syllogistic deductions, statements and conclusions.',
    },
    {
      id: 'ssc_imd_reasoning_direction_30q',
      title: 'Direction Sense & Spatial Orientation Drill (30 Qs)',
      topicKey: 'Direction Sense & Spatial Orientation',
      count: 30,
      duration: 20,
      badge: 'DIRECTION DRILL',
      description: '30 questions on displacement, cardinal directions, turns, angles and shadow puzzles.',
    },
    {
      id: 'ssc_imd_reasoning_arithmetic_30q',
      title: 'Arithmetical Reasoning & Operations Drill (30 Qs)',
      topicKey: 'Arithmetical Reasoning & Operations',
      count: 30,
      duration: 20,
      badge: 'ARITHMETIC DRILL',
      description: '30 questions on mathematical operators interchange, BODMAS evaluation and arithmetic word problems.',
    },
    {
      id: 'ssc_imd_reasoning_venn_diagrams_30q',
      title: 'Venn Diagrams & Set Relations Drill (30 Qs)',
      topicKey: 'Venn Diagrams & Set Relations',
      count: 30,
      duration: 20,
      badge: 'VENN DRILL',
      description: '30 questions identifying overlapping geometric representations of class categories.',
    },
    {
      id: 'ssc_imd_reasoning_puzzles_30q',
      title: 'Puzzles & Seating Arrangements Drill (30 Qs)',
      topicKey: 'Puzzles & Seating Arrangements',
      count: 30,
      duration: 20,
      badge: 'PUZZLES DRILL',
      description: '30 questions on linear rows, circular arrangements, comparison rankings and scheduling puzzles.',
    },
  ];

  const testsToSave: MockTest[] = [];

  for (const d of drills) {
    const qs = (validQuestionsByTopic[d.topicKey] || []).slice(0, d.count);
    if (qs.length === 0) continue;

    testsToSave.push({
      id: d.id,
      title: d.title,
      type: 'sectional',
      category: 'SSC',
      subject: 'General Intelligence and Reasoning',
      difficulty: 'Medium',
      isLive: true,
      questionIds: qs.map((q) => q.id),
      sections: [
        {
          name: d.topicKey,
          questionIds: qs.map((q) => q.id),
          totalQuestions: qs.length,
          marks: qs.length,
        },
      ],
      totalQuestions: qs.length,
      totalMarks: qs.length,
      durationMinutes: d.duration,
      positiveMarks: 1,
      negativeMarks: 0.25,
      isFree: true,
      accessType: 'free',
      promotionalBadge: d.badge,
      promotionalNote: d.description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // Grand 50-Question Reasoning Master Sprint (5 Qs from each of the 10 topics)
  const sprintQs: Question[] = [];
  drills.forEach((d) => {
    const qs = (validQuestionsByTopic[d.topicKey] || []).slice(30, 35);
    sprintQs.push(...qs);
  });

  testsToSave.push({
    id: 'ssc_imd_reasoning_master_sprint_50q',
    title: 'SSC Reasoning 50-Question Master Sprint (Official Pattern)',
    type: 'sectional',
    category: 'SSC',
    subject: 'General Intelligence and Reasoning',
    difficulty: 'Medium',
    isLive: true,
    questionIds: sprintQs.map((q) => q.id),
    sections: [
      {
        name: 'General Intelligence & Reasoning (14.2.1)',
        questionIds: sprintQs.map((q) => q.id),
        totalQuestions: sprintQs.length,
        marks: sprintQs.length,
      },
    ],
    totalQuestions: sprintQs.length,
    totalMarks: sprintQs.length,
    durationMinutes: 35,
    positiveMarks: 1,
    negativeMarks: 0.25,
    isFree: true,
    accessType: 'free',
    promotionalBadge: '50-Q SPRINT',
    promotionalNote: 'Full 50-question Paper-I section pattern drawn from S. Chand and Rakesh Yadav reference bank.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  for (const t of testsToSave) {
    await db.collection('mock_tests').doc(t.id).set(t, { merge: true });
    console.log(`✅ Saved Mock Test: ${t.id} - "${t.title}" (${t.totalQuestions} Qs)`);
  }

  console.log('\n🎉 ALL REASONING TOPIC DRILLS SUCCESSFULLY SEEDED INTO FIRESTORE!\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during reasoning seeding:', err);
  process.exit(1);
});
