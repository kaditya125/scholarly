import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import JSZip from 'jszip';
import { db } from '../../src/config/firebase';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { PracticeBankQuestion } from '../../src/types/practiceBank.types';
import { practiceBankRepository } from '../../src/repositories/practiceBank.repository';

// PRNG: Mulberry32 for deterministic, repeatable option shuffling
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function shuffleOptions(
  options: string[],
  raw1IndexedAnswer: number,
  seedKey: string
): { shuffledOptions: string[]; shuffledCorrectAnswerIndex: number } {
  const seed = crypto.createHash('sha256').update(seedKey).digest().readUInt32LE(0);
  const rng = mulberry32(seed);
  const original0Index = raw1IndexedAnswer - 1;

  const indices = [0, 1, 2, 3];
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = indices[i];
    indices[i] = indices[j];
    indices[j] = temp;
  }

  const shuffledOptions = indices.map((idx) => options[idx]);
  const shuffledCorrectAnswerIndex = indices.indexOf(original0Index);
  return { shuffledOptions, shuffledCorrectAnswerIndex };
}

async function parseXlsx(filePath: string): Promise<Record<string, string>[]> {
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);

  // 1. Shared strings
  const sstFile = zip.file('xl/sharedStrings.xml');
  if (!sstFile) throw new Error('No xl/sharedStrings.xml found in archive');
  const sstXml = await sstFile.async('text');

  const sharedStrings: string[] = [];
  const siRegex = /<si>(.*?)<\/si>/gs;
  let match: RegExpExecArray | null;
  while ((match = siRegex.exec(sstXml)) !== null) {
    const siContent = match[1];
    const tRegex = /<t[^>]*>(.*?)<\/t>/gs;
    let str = '';
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(siContent)) !== null) {
      str += tMatch[1];
    }
    str = str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    sharedStrings.push(str);
  }

  // 2. Worksheet sheet1.xml
  const sheetFile = zip.file('xl/worksheets/sheet1.xml');
  if (!sheetFile) throw new Error('No xl/worksheets/sheet1.xml found in archive');
  const sheetXml = await sheetFile.async('text');

  const rowRegex = /<row[^>]*>(.*?)<\/row>/gs;
  const rows: Record<string, string>[] = [];
  let rMatch: RegExpExecArray | null;
  while ((rMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowContent = rMatch[1];
    const cellRegex = /<c\s+r="([A-Z]+)\d+"(?:\s+t="([^"]+)")?[^>]*>(?:<v>(.*?)<\/v>)?<\/c>/gs;
    let cMatch: RegExpExecArray | null;
    const rowObj: Record<string, string> = {};
    while ((cMatch = cellRegex.exec(rowContent)) !== null) {
      const col = cMatch[1];
      const type = cMatch[2];
      const val = cMatch[3];
      if (val !== undefined) {
        rowObj[col] = type === 's' ? sharedStrings[parseInt(val, 10)] : val;
      } else {
        rowObj[col] = '';
      }
    }
    rows.push(rowObj);
  }

  // Skip header row
  return rows.slice(1);
}

async function runIngestion() {
  const isExecute = process.argv.includes('--execute');
  const isDryRun = !isExecute;

  console.log('================================================================');
  console.log('📚 URTEN COMMUNITY GK QUIZ BANK INGESTION');
  console.log(`Mode: ${isExecute ? '🚨 EXECUTE (LIVE MUTATION)' : '🔍 DRY-RUN (READ-ONLY SIMULATION)'}`);
  console.log('================================================================\n');

  // File path & SHA-256 calculation
  const xlsxPath = path.resolve(__dirname, 'data/exam_questions_full.xlsx');
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`XLSX source file not found at: ${xlsxPath}`);
  }

  const fileBytes = fs.readFileSync(xlsxPath);
  const sourceFileSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
  console.log(`Source File:        ${xlsxPath}`);
  console.log(`File Size:          ${fileBytes.length} bytes`);
  console.log(`Source SHA-256:     ${sourceFileSha256}`);
  console.log(`Source URL:         https://github.com/Urten/indian_govt_exam`);
  console.log(`License Status:     NO LICENCE (Community open repository, internal practice only)\n`);

  // Parse XLSX via JSZip OpenXML parser
  console.log('Parsing XLSX rows via JSZip OpenXML parser...');
  const dataRows = await parseXlsx(xlsxPath);
  console.log(`Parsed ${dataRows.length} data rows from workbook.\n`);

  // Validate strict expectations: 1,645 rows, 1,645 distinct questions, 0 duplicates, 0 missing
  if (dataRows.length !== 1645) {
    throw new Error(`Expected exactly 1645 rows, got ${dataRows.length}`);
  }

  const questions: PracticeBankQuestion[] = [];
  const seenIds = new Set<string>();
  const seenNormalizedTexts = new Set<string>();
  const rawAnswerDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const shuffledAnswerDist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const categoryCounts: Record<string, number> = {};
  const reviewFlagCounts: Record<string, number> = {
    off_syllabus: 0,
    time_sensitive: 0,
    none: 0,
  };

  const now = Date.now();

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const text = (r.A || '').trim();
    const opt1 = (r.B || '').trim();
    const opt2 = (r.C || '').trim();
    const opt3 = (r.D || '').trim();
    const opt4 = (r.E || '').trim();
    const category = (r.F || '').toLowerCase().trim();
    const rawAnswer = r.G ? parseInt(r.G.trim(), 10) : 0;

    if (!text || !opt1 || !opt2 || !opt3 || !opt4 || !category || rawAnswer < 1 || rawAnswer > 4) {
      throw new Error(`Row ${i + 2} has missing or invalid required fields: ${JSON.stringify(r)}`);
    }

    const norm = normalizeText(text);
    if (seenNormalizedTexts.has(norm)) {
      throw new Error(`Duplicate question detected at row ${i + 2}: "${text}"`);
    }
    seenNormalizedTexts.add(norm);

    // Deterministic ID: sha256(normalised text).slice(0, 16)
    const id = crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16);
    if (seenIds.has(id)) {
      throw new Error(`Hash collision for ID ${id} at row ${i + 2}`);
    }
    seenIds.add(id);

    rawAnswerDist[rawAnswer] = (rawAnswerDist[rawAnswer] || 0) + 1;
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;

    // Review flags
    const reviewFlags: string[] = [];
    if (category === 'entertainment' || category === 'sports') {
      reviewFlags.push('off_syllabus');
      reviewFlagCounts.off_syllabus++;
    } else if (category === 'current_affairs') {
      reviewFlags.push('time_sensitive');
      reviewFlagCounts.time_sensitive++;
    } else {
      reviewFlagCounts.none++;
    }

    // Seeded option shuffle
    const rawOptions = [opt1, opt2, opt3, opt4];
    const { shuffledOptions, shuffledCorrectAnswerIndex } = shuffleOptions(rawOptions, rawAnswer, norm);
    shuffledAnswerDist[shuffledCorrectAnswerIndex] = (shuffledAnswerDist[shuffledCorrectAnswerIndex] || 0) + 1;

    // Build document strictly conforming to specification
    const doc: PracticeBankQuestion = {
      id,
      text,
      options: shuffledOptions,
      correctAnswerIndex: shuffledCorrectAnswerIndex,
      category,
      origin: 'community_quiz_bank',
      sourceUrl: 'https://github.com/Urten/indian_govt_exam',
      sourceFileSha256,
      ingestedAt: now,
      reviewFlags,
    };

    questions.push(doc);
  }

  // Check expected category distribution
  console.log('--- CATEGORY BREAKDOWN ---');
  console.table(categoryCounts);

  console.log('\n--- PRE-SHUFFLE ANSWER SKEW (1-indexed) ---');
  Object.entries(rawAnswerDist).forEach(([opt, count]) => {
    console.log(`  Option ${opt}: ${count.toString().padStart(4)} (${((count / 1645) * 100).toFixed(1)}%)`);
  });

  console.log('\n--- POST-SHUFFLE BALANCED ANSWER DISTRIBUTION (0-indexed) ---');
  Object.entries(shuffledAnswerDist).forEach(([idx, count]) => {
    console.log(`  Index ${idx}:  ${count.toString().padStart(4)} (${((count / 1645) * 100).toFixed(1)}%)`);
  });

  console.log('\n--- REVIEW FLAGS SUMMARY ---');
  console.table(reviewFlagCounts);

  // Measure and assert baseline counts before mutation
  console.log('\n--- ASSERTING BASELINE COUNTS ---');
  const practiceCountBefore = await practiceBankRepository.count();
  const pyqSnapBefore = await db.collection('pyq_questions').count().get();
  const pyqCountBefore = pyqSnapBefore.data().count;
  const qbSnapBefore = await db.collection('question_bank').count().get();
  const qbCountBefore = qbSnapBefore.data().count;

  const pineconeStatsBefore = await pineconeService.getIndexStats();
  const pineconeCountBefore = pineconeStatsBefore.namespaces?.find((n: any) => n.name === 'production')?.vectorCount || 0;

  console.log(`practice_bank before:      ${practiceCountBefore}`);
  console.log(`pyq_questions before:      ${pyqCountBefore}`);
  console.log(`question_bank before:      ${qbCountBefore}`);
  console.log(`Pinecone production before:${pineconeCountBefore}`);

  if (isDryRun) {
    console.log('\n================================================================');
    console.log('🔍 DRY-RUN COMPLETE. Validated 1645 questions.');
    console.log('Zero records were written. To execute live ingestion, run with: --execute');
    console.log('================================================================');
    process.exit(0);
  }

  // EXECUTE LIVE INGESTION
  console.log('\n================================================================');
  console.log('🚨 EXECUTING LIVE INGESTION INTO "practice_bank"');
  console.log('================================================================\n');

  await practiceBankRepository.saveBatch(questions);
  console.log(`✅ Saved ${questions.length} questions to collection "practice_bank".\n`);

  // Verify and assert after mutation
  console.log('--- POST-INGESTION VERIFICATION & STRICT ASSERTIONS ---');
  const practiceCountAfter = await practiceBankRepository.count();
  const pyqSnapAfter = await db.collection('pyq_questions').count().get();
  const pyqCountAfter = pyqSnapAfter.data().count;
  const qbSnapAfter = await db.collection('question_bank').count().get();
  const qbCountAfter = qbSnapAfter.data().count;

  const pineconeStatsAfter = await pineconeService.getIndexStats();
  const pineconeCountAfter = pineconeStatsAfter.namespaces?.find((n: any) => n.name === 'production')?.vectorCount || 0;

  console.log(`practice_bank:       ${practiceCountBefore} -> ${practiceCountAfter} (Expected: 1645)`);
  console.log(`pyq_questions:       ${pyqCountBefore} -> ${pyqCountAfter} (Assert UNCHANGED)`);
  console.log(`question_bank:       ${qbCountBefore} -> ${qbCountAfter} (Assert UNCHANGED)`);
  console.log(`Pinecone production: ${pineconeCountBefore} -> ${pineconeCountAfter} (Assert UNCHANGED)\n`);

  if (practiceCountAfter !== 1645) {
    throw new Error(`Assertion failed: practice_bank has ${practiceCountAfter} documents, expected 1645`);
  }
  if (pyqCountAfter !== pyqCountBefore) {
    throw new Error(`CRITICAL INVARIANT VIOLATION: pyq_questions changed from ${pyqCountBefore} to ${pyqCountAfter}!`);
  }
  if (qbCountAfter !== 0) {
    throw new Error(`CRITICAL INVARIANT VIOLATION: question_bank changed from ${qbCountBefore} to ${qbCountAfter}!`);
  }
  if (pineconeCountAfter !== pineconeCountBefore) {
    throw new Error(`CRITICAL INVARIANT VIOLATION: Pinecone production changed from ${pineconeCountBefore} to ${pineconeCountAfter}!`);
  }

  console.log('✅ ALL INVARIANTS AND ASSERTIONS STRICTLY SATISFIED!');
  console.log('================================================================');
  console.log('🎉 INGESTION COMPLETE.');
  console.log('================================================================');
  process.exit(0);
}

runIngestion().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
