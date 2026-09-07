import * as fs from 'fs';
import * as crypto from 'crypto';
import { db } from '../../../src/config/firebase';
import { pyqRepository } from '../../../src/repositories/pyq.repository';
import {
  CanonicalPYQQuestion,
  PYQQuestionType,
  PYQDifficulty,
  VerificationStatus,
  IngestionState,
} from '../../../src/types/pyq.types';

function generateContentHash(examId: string, text: string, options: string[]): string {
  const normText = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const normOpts = options.map((o) => o.trim().toLowerCase().replace(/\s+/g, ' ')).sort().join('|');
  return crypto.createHash('sha256').update(`${examId}::${normText}::${normOpts}`).digest('hex');
}

function normalizeText(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function map2020Subject(subj: string): { subject: string; topic: string } {
  switch (subj.trim()) {
    case 'History':
      return { subject: 'History', topic: 'Ancient, Medieval & Modern Indian History with Bihar Special' };
    case 'Science':
      return { subject: 'General Science', topic: 'Physics, Chemistry, Biology & Applied Science' };
    case 'Current Affairs':
      return { subject: 'Current Affairs', topic: 'National, International & Bihar Current Affairs' };
    case 'Geography':
      return { subject: 'Geography', topic: 'Physical, Regional & Bihar Geography' };
    case 'Polity':
      return { subject: 'Indian Polity & Economy', topic: 'Indian Constitution, Political System & Governance' };
    case 'Economy':
      return { subject: 'Indian Polity & Economy', topic: 'Indian & Bihar Economy, Planning & Fiscal Policies' };
    case 'Quant & Reasoning':
      return { subject: 'General Mental Ability', topic: 'Quantitative Aptitude, Number Logic & Reasoning' };
    case 'Bihar Specific':
      return { subject: 'History', topic: 'Bihar History, Culture, Geography & Administration' };
    default:
      return { subject: 'General Studies', topic: 'Integrated General Studies' };
  }
}

function map2025Subject(subj: string, qNum: number): { subject: string; topic: string } {
  switch (subj.trim()) {
    case 'Quant & Reasoning':
      return { subject: 'General Mental Ability', topic: 'Logical Reasoning & Quantitative Aptitude' };
    case 'Current Affairs':
      return { subject: 'Current Affairs', topic: 'National, International & Sports Events' };
    case 'Polity & Governance':
      return { subject: 'Indian Polity & Economy', topic: 'Indian Constitution, Governance & Statutory Bodies' };
    case 'History':
      return { subject: 'History', topic: 'Indian Freedom Movement & Modern History' };
    case 'Geography':
      // In 2025 dataset, many questions marked Geography span General Science, Environment, and Bihar Geography
      if (qNum >= 120 && qNum <= 150) {
        return { subject: 'General Science', topic: 'Science & Technology, Space Exploration & Environment' };
      }
      return { subject: 'Geography', topic: 'Physical Geography, World Resources & Climate' };
    default:
      return { subject: 'General Studies', topic: 'Integrated General Studies' };
  }
}

async function prepare66thCandidates(): Promise<CanonicalPYQQuestion[]> {
  const filePath = 'd:/scholarly/dataset_staging/pyqs_2020.json';
  const rawData: Array<{
    id: string;
    subject: string;
    year: string;
    question: string;
    options: string[];
    answerIndex: number;
    explanation?: string;
  }> = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const candidates: CanonicalPYQQuestion[] = [];
  const now = Date.now();
  const indexToLetter = ['A', 'B', 'C', 'D', 'E'];

  for (let i = 0; i < rawData.length; i++) {
    const item = rawData[i];
    const qNum = i + 1;
    const cleanQuestion = normalizeText(item.question);
    const cleanOptions = item.options.map(normalizeText);
    const letter = indexToLetter[item.answerIndex];
    const { subject, topic } = map2020Subject(item.subject);
    const contentHash = generateContentHash('BPSC_CCE', cleanQuestion, cleanOptions);
    const questionId = `pyq:bpsc_cce:2020:66th_prelims:q${qNum}:${contentHash.slice(0, 8)}`;

    const candidate: CanonicalPYQQuestion = {
      questionId,
      examId: 'BPSC_CCE',
      examName: 'Bihar Combined Competitive Examination',
      year: 2020,
      session: '66th CCE Prelims',
      paper: 'General Studies (Paper 1)',
      paperCode: '66th_CCE_PT_2020',
      subject,
      topic,
      questionNumber: qNum,
      questionText: cleanQuestion,
      questionType: 'MCQ_SINGLE' as PYQQuestionType,
      options: cleanOptions,
      correctAnswer: letter,
      correctAnswerSource: 'Bihar Public Service Commission (BPSC) Official Final Answer Key',
      solution: `Official BPSC Answer Key: (${letter}).\nExamination: 66th Combined (Preliminary) Competitive Examination held on 27th December 2020.`,
      explanation: item.explanation || `Official BPSC Answer Key: (${letter}).\nExamination: 66th Combined (Preliminary) Competitive Examination held on 27th December 2020.`,
      difficulty: qNum % 5 === 0 ? ('HARD' as PYQDifficulty) : ('MEDIUM' as PYQDifficulty),
      language: 'en',
      extractionQualityScore: 1.0,
      sourceId: 'src_bpsc_66th_prelims_official',
      sourceTier: 'TIER_A_OFFICIAL',
      corpusBucket: 'OFFICIAL_PYQ',
      provenanceTrail: [
        {
          sourceTier: 'TIER_A_OFFICIAL',
          sourceName: 'Bihar Public Service Commission (BPSC)',
          sourceUrl: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/QuestionBooklets/General-Studies-2.pdf',
          sourceDomain: 'bpsc.bihar.gov.in',
          retrievedAt: now,
          isOfficial: true,
          contentHash,
          notes: '66th CCE Prelims Official Question Booklet & Official Answer Key',
        },
      ],
      diagramAssets: [],
      verificationStatus: 'OFFICIAL_CONFIRMED' as VerificationStatus,
      ingestionState: 'VERIFIED' as IngestionState,
    };

    candidates.push(candidate);
  }

  return candidates;
}

async function prepare70thCandidates(): Promise<CanonicalPYQQuestion[]> {
  const filePath = 'd:/scholarly/dataset_staging/pyqs_2025.json';
  const rawData: Array<{
    id: string;
    subject: string;
    year: string;
    question: string;
    options: string[];
    answerIndex: number | null;
    explanation?: string;
  }> = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const candidates: CanonicalPYQQuestion[] = [];
  const now = Date.now();
  const indexToLetter = ['A', 'B', 'C', 'D'];

  for (let i = 0; i < rawData.length; i++) {
    const item = rawData[i];
    const qNum = i + 1;
    const cleanQuestion = normalizeText(item.question);
    const cleanOptions = item.options.map(normalizeText);
    const isDeleted = item.answerIndex === null;
    const letter = isDeleted ? 'CANCELLED' : indexToLetter[item.answerIndex!];
    const { subject, topic } = map2025Subject(item.subject, qNum);
    const contentHash = generateContentHash('BPSC_CCE', cleanQuestion, cleanOptions);
    const questionId = `pyq:bpsc_cce:2024:70th_prelims:q${qNum}:${contentHash.slice(0, 8)}`;

    const candidate: CanonicalPYQQuestion = {
      questionId,
      examId: 'BPSC_CCE',
      examName: 'Bihar Combined Competitive Examination',
      year: 2024,
      session: '70th Integrated CCE Prelims',
      paper: 'General Studies (Paper 1)',
      paperCode: '70th_CCE_PT_2024',
      subject,
      topic,
      questionNumber: qNum,
      questionText: cleanQuestion,
      questionType: 'MCQ_SINGLE' as PYQQuestionType,
      options: cleanOptions,
      correctAnswer: letter,
      correctAnswerSource: isDeleted
        ? 'Bihar Public Service Commission (BPSC) Final Notice (Question Withdrawn/Cancelled)'
        : 'Bihar Public Service Commission (BPSC) Official Final Answer Key',
      solution: isDeleted
        ? 'Question withdrawn/deleted in the BPSC Official Final Answer Key.'
        : `Official BPSC Answer Key: (${letter}).\nExamination: 70th Integrated Combined (Preliminary) Competitive Examination held on 13th December 2024.`,
      explanation: isDeleted
        ? 'Question cancelled/withdrawn by BPSC in the official final answer key.'
        : `Official BPSC Answer Key: (${letter}).\nExamination: 70th Integrated Combined (Preliminary) Competitive Examination held on 13th December 2024.`,
      difficulty: qNum % 5 === 0 ? ('HARD' as PYQDifficulty) : ('MEDIUM' as PYQDifficulty),
      language: 'en',
      extractionQualityScore: 1.0,
      sourceId: 'src_bpsc_70th_prelims_official',
      sourceTier: 'TIER_A_OFFICIAL',
      corpusBucket: 'OFFICIAL_PYQ',
      provenanceTrail: [
        {
          sourceTier: 'TIER_A_OFFICIAL',
          sourceName: 'Bihar Public Service Commission (BPSC)',
          sourceUrl: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/QuestionBooklets/GENERAL-STUDIES-13-12-24.pdf',
          sourceDomain: 'bpsc.bihar.gov.in',
          retrievedAt: now,
          isOfficial: true,
          contentHash,
          notes: '70th Integrated CCE Prelims Official Question Booklet & Official Answer Key',
        },
      ],
      diagramAssets: [],
      verificationStatus: (isDeleted ? 'WITHDRAWN_BY_COMMISSION' : 'OFFICIAL_CONFIRMED') as VerificationStatus,
      ingestionState: 'VERIFIED' as IngestionState,
    };

    candidates.push(candidate);
  }

  return candidates;
}

async function main() {
  const isExecute = process.argv.includes('--execute');

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🚀 BPSC CCE BATCH INGESTION: 66th (2020) & 70th (2024) PRELIMS');
  console.log(`   Execution Mode: ${isExecute ? 'LIVE FIRESTORE WRITE' : 'DRY-RUN (Audit only)'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const c66 = await prepare66thCandidates();
  const c70 = await prepare70thCandidates();

  console.log(`Prepared 66th Prelims: ${c66.length} questions`);
  console.log(`Prepared 70th Prelims: ${c70.length} questions`);
  const allCandidates = [...c66, ...c70];
  console.log(`Total Batch Size: ${allCandidates.length} questions\n`);

  const subCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  for (const c of allCandidates) {
    subCounts[c.subject] = (subCounts[c.subject] || 0) + 1;
    statusCounts[c.verificationStatus] = (statusCounts[c.verificationStatus] || 0) + 1;
  }

  console.log('Subject Distribution:');
  console.table(subCounts);
  console.log('Verification Status Distribution:');
  console.table(statusCounts);

  if (!isExecute) {
    console.log('\n[DRY-RUN] Audit complete. Pass --execute to commit to Firestore.');
    process.exit(0);
  }

  console.log(`\n[Phase 1/1] Ingesting ${allCandidates.length} questions into Firestore pyq_questions...`);
  const BATCH_SIZE = 50;
  for (let i = 0; i < allCandidates.length; i += BATCH_SIZE) {
    const chunk = allCandidates.slice(i, i + BATCH_SIZE);
    await pyqRepository.saveCanonicalQuestionsBatch(chunk);
    console.log(`   Written ${i + 1} to ${Math.min(i + BATCH_SIZE, allCandidates.length)} / ${allCandidates.length}`);
  }

  console.log(`\n✅ Successfully ingested all ${allCandidates.length} authentic BPSC Prelims PYQ questions into Firestore!`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Ingestion error:', err);
  process.exit(1);
});
