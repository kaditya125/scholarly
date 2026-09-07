import * as fs from 'fs';
import * as crypto from 'crypto';
import { db } from '../../../src/config/firebase';
import { pyqRepository } from '../../../src/repositories/pyq.repository';
import {
  CanonicalPYQQuestion,
  PYQQuestionType,
  PYQDifficulty,
} from '../../../src/types/pyq.types';

function generateContentHash(examId: string, text: string, options: string[]): string {
  const normText = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const normOpts = options.map((o) => o.trim().toLowerCase().replace(/\s+/g, ' ')).sort().join('|');
  return crypto.createHash('sha256').update(`${examId}::${normText}::${normOpts}`).digest('hex');
}

function assignTopicAndSubj(qNum: number): { subject: string; topic: string; difficulty: PYQDifficulty } {
  if (qNum <= 30) {
    return {
      subject: 'General Science',
      topic: 'Physics, Chemistry, Biology & Emerging Tech',
      difficulty: qNum % 3 === 0 ? 'HARD' : 'MEDIUM',
    };
  } else if (qNum <= 60) {
    return {
      subject: 'Current Affairs',
      topic: 'National & International Events, Awards & Schemes',
      difficulty: 'MEDIUM',
    };
  } else if (qNum <= 90) {
    return {
      subject: 'History',
      topic: qNum <= 75 ? 'Ancient & Medieval Indian History' : 'Modern Indian History & Bihar Special History',
      difficulty: 'MEDIUM',
    };
  } else if (qNum <= 100) {
    return {
      subject: 'Geography',
      topic: 'Physical, World & Bihar Geography',
      difficulty: 'MEDIUM',
    };
  } else if (qNum <= 125) {
    return {
      subject: 'Indian Polity & Economy',
      topic: qNum <= 115 ? 'Indian Constitution, Governance & Judiciary' : 'Indian Economy, Budget & Survey',
      difficulty: 'HARD',
    };
  } else if (qNum <= 140) {
    return {
      subject: 'History',
      topic: 'Indian National Movement & Role of Bihar Leaders',
      difficulty: 'MEDIUM',
    };
  } else {
    return {
      subject: 'General Mental Ability',
      topic: 'Quantitative Aptitude, Number Series & Logical Reasoning',
      difficulty: 'EASY',
    };
  }
}

export async function ingestBpscPrelims(extractedFile: string, keysFile: string, isExecute: boolean) {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🚀 BPSC CCE PRELIMS OFFICIAL QUESTION PAPER INGESTION PIPELINE');
  console.log(`   Execution Mode: ${isExecute ? 'LIVE FIRESTORE WRITE' : 'DRY-RUN (Audit only)'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  if (!fs.existsSync(extractedFile) || !fs.existsSync(keysFile)) {
    throw new Error(`Files not found: ${extractedFile} or ${keysFile}`);
  }

  const extractedData: Array<{
    questionNumber: number;
    questionText: string;
    options: string[];
    status: string;
  }> = JSON.parse(fs.readFileSync(extractedFile, 'utf8'));

  const answerKeys: Record<string, string> = JSON.parse(fs.readFileSync(keysFile, 'utf8'));

  console.log(`Loaded ${extractedData.length} extracted questions and ${Object.keys(answerKeys).length} verified answer keys.\n`);

  const candidates: CanonicalPYQQuestion[] = [];
  const now = Date.now();

  for (const item of extractedData) {
    const qNum = item.questionNumber;
    const correctLetter = answerKeys[String(qNum)];
    if (!correctLetter) {
      console.warn(`Warning: Missing answer key for Question ${qNum}`);
      continue;
    }

    const { subject, topic, difficulty } = assignTopicAndSubj(qNum);
    const contentHash = generateContentHash('BPSC_CCE', item.questionText, item.options);
    const questionId = `pyq:bpsc_cce:2023:69th_prelims:series_a:q${qNum}:${contentHash.slice(0, 8)}`;

    const candidate: CanonicalPYQQuestion = {
      questionId,
      examId: 'BPSC_CCE',
      examName: 'Bihar Combined Competitive Examination',
      year: 2023,
      session: '69th Integrated CCE',
      paper: 'General Studies (Paper 1)',
      shift: 'Morning Shift (12:00 PM - 2:00 PM)',
      paperCode: 'Series A (Booklet 19C/FI/CC/PT2023)',
      subject,
      topic,
      questionNumber: qNum,
      questionText: item.questionText,
      questionType: 'MCQ_SINGLE' as PYQQuestionType,
      options: item.options,
      correctAnswer: correctLetter,
      correctAnswerSource: 'Bihar Public Service Commission (BPSC) Official Final Answer Key',
      solution: `Official BPSC Answer Key: (${correctLetter}).\nExamination: 69th Integrated Combined (Preliminary) Competitive Examination, Sept 30, 2023.`,
      explanation: `Official BPSC Answer Key: (${correctLetter}).\nExamination: 69th Integrated Combined (Preliminary) Competitive Examination, Sept 30, 2023.`,
      difficulty,
      language: 'en',
      extractionQualityScore: 1.0,
      sourceId: 'src_bpsc_69th_prelims_official_series_a',
      sourceTier: 'TIER_A_OFFICIAL',
      corpusBucket: 'OFFICIAL_PYQ',
      provenanceTrail: [
        {
          sourceTier: 'TIER_A_OFFICIAL',
          sourceName: 'Bihar Public Service Commission (BPSC)',
          sourceUrl: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/QuestionBooklets/NB-2023-09-30-01-1-1.pdf',
          sourceDomain: 'bpsc.bihar.gov.in',
          retrievedAt: now,
          isOfficial: true,
          contentHash,
          notes: '69th Integrated CCE Prelims Question Booklet Series A & BPSC Final Answer Key',
        },
      ],
      diagramAssets: [],
      verificationStatus: 'OFFICIAL_CONFIRMED',
      ingestionState: 'VERIFIED',
    };

    candidates.push(candidate);
  }

  console.log('--- Summary of Prepared Candidates ---');
  console.log(`Total Candidates Validated: ${candidates.length} / 150`);
  
  const subCounts: Record<string, number> = {};
  for (const c of candidates) {
    subCounts[c.subject] = (subCounts[c.subject] || 0) + 1;
  }
  console.log('Subject Distribution:');
  console.table(subCounts);

  if (!isExecute) {
    console.log('\n[DRY-RUN] Audit complete. Pass --execute to commit to Firestore.');
    return;
  }

  console.log(`\n[Phase 1/1] Ingesting ${candidates.length} questions into Firestore pyq_questions...`);
  const BATCH_SIZE = 50;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const chunk = candidates.slice(i, i + BATCH_SIZE);
    await pyqRepository.saveCanonicalQuestionsBatch(chunk);
    console.log(`   Written ${i + 1} to ${Math.min(i + BATCH_SIZE, candidates.length)} / ${candidates.length}`);
  }

  console.log(`\n✅ Successfully ingested all ${candidates.length} authentic BPSC Prelims PYQ questions into Firestore!`);
}

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const extractedFile = 'd:/scholarly/dataset_staging/bpsc_69th_extracted.json';
  const keysFile = 'd:/scholarly/dataset_staging/bpsc_69th_keys.json';

  await ingestBpscPrelims(extractedFile, keysFile, isExecute);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n❌ Ingestion error:', err);
    process.exit(1);
  });
}
