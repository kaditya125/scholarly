import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';

const normText = (s: string): string => {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

async function auditQuarantinedDuplicates() {
  console.log('================================================================');
  console.log('🔍 FORENSIC AUDIT: QUARANTINED QUESTIONS DUPLICATE ANALYSIS');
  console.log('================================================================\n');

  console.log('Fetching all quarantined questions from Firestore "pyq_questions"...');
  const snap = await db.collection('pyq_questions')
    .where('ingestionState', '==', 'QUARANTINED')
    .get();

  const totalQuarantined = snap.size;
  console.log(`Total quarantined documents fetched: ${totalQuarantined}\n`);

  const questions: any[] = [];
  snap.forEach(d => {
    const data = d.data();
    questions.push({
      id: d.id,
      examId: data.examId || 'UNKNOWN',
      year: data.year,
      paper: data.paper || data.shift,
      text: data.questionText || data.text || '',
      options: data.options || [],
      norm: normText(data.questionText || data.text || ''),
      origin: data.origin,
      restorationState: data.restorationState,
    });
  });

  // 1. Intra-exam duplicate analysis
  const examStats: Record<string, {
    total: number;
    uniqueTexts: number;
    duplicateGroups: number;
    duplicateRecords: number;
    redundantCopies: number;
    duplicateRate: string;
  }> = {};

  const byExamMap: Record<string, Map<string, any[]>> = {};

  for (const q of questions) {
    if (!byExamMap[q.examId]) {
      byExamMap[q.examId] = new Map();
    }
    const map = byExamMap[q.examId];
    if (!map.has(q.norm)) {
      map.set(q.norm, []);
    }
    map.get(q.norm)!.push(q);
  }

  for (const [examId, map] of Object.entries(byExamMap)) {
    let dupGroups = 0;
    let dupRecords = 0;
    let redundantCopies = 0;

    for (const [norm, list] of map.entries()) {
      if (list.length > 1) {
        dupGroups++;
        dupRecords += list.length;
        redundantCopies += (list.length - 1);
      }
    }

    const total = questions.filter(q => q.examId === examId).length;
    const unique = map.size;
    const rate = total > 0 ? ((redundantCopies / total) * 100).toFixed(2) + '%' : '0.00%';

    examStats[examId] = {
      total,
      uniqueTexts: unique,
      duplicateGroups: dupGroups,
      duplicateRecords: dupRecords,
      redundantCopies,
      duplicateRate: rate,
    };
  }

  // 2. Global across all quarantined questions
  const globalMap = new Map<string, any[]>();
  for (const q of questions) {
    if (!globalMap.has(q.norm)) {
      globalMap.set(q.norm, []);
    }
    globalMap.get(q.norm)!.push(q);
  }

  const globalUnique = globalMap.size;
  let globalDupGroups = 0;
  let globalDupRecords = 0;
  let globalRedundantCopies = 0;

  const groupSizeHist: Record<string, number> = {
    '2x': 0,
    '3x-5x': 0,
    '6x-10x': 0,
    '11x-20x': 0,
    '21x-50x': 0,
    '50x+': 0,
  };

  const topDuplicateQuestions: any[] = [];

  for (const [norm, list] of globalMap.entries()) {
    if (list.length > 1) {
      globalDupGroups++;
      globalDupRecords += list.length;
      globalRedundantCopies += (list.length - 1);

      const count = list.length;
      if (count === 2) groupSizeHist['2x']++;
      else if (count <= 5) groupSizeHist['3x-5x']++;
      else if (count <= 10) groupSizeHist['6x-10x']++;
      else if (count <= 20) groupSizeHist['11x-20x']++;
      else if (count <= 50) groupSizeHist['21x-50x']++;
      else groupSizeHist['50x+']++;

      topDuplicateQuestions.push({
        snippet: list[0].text.slice(0, 100),
        count: list.length,
        exams: Array.from(new Set(list.map(i => i.examId))),
        years: Array.from(new Set(list.map(i => i.year))).sort(),
        sampleIds: list.slice(0, 3).map(i => i.id),
      });
    }
  }

  topDuplicateQuestions.sort((a, b) => b.count - a.count);

  console.log('--- GLOBAL QUARANTINED DUPLICATE TOTALS ---');
  console.log(`Total Quarantined Records:         ${totalQuarantined}`);
  console.log(`Distinct Unique Question Texts:    ${globalUnique}`);
  console.log(`Questions in Duplicate Groups:     ${globalDupRecords} records`);
  console.log(`Unique Duplicate Groups:           ${globalDupGroups} groups`);
  console.log(`Redundant/Excess Question Copies:  ${globalRedundantCopies} duplicates`);
  console.log(`Global Duplication Rate:           ${((globalRedundantCopies / totalQuarantined) * 100).toFixed(2)}%\n`);

  console.log('--- DUPLICATION BREAKDOWN BY EXAM ---');
  console.table(examStats);

  console.log('\n--- DUPLICATE OCCURRENCE FREQUENCY HISTOGRAM ---');
  console.table(groupSizeHist);

  console.log('\n--- TOP 5 HIGHEST DUPLICATED QUESTIONS ACROSS PAPERS ---');
  topDuplicateQuestions.slice(0, 5).forEach((item, idx) => {
    console.log(`[${idx + 1}] Repeated ${item.count} times across ${item.exams.join(', ')} (Years: ${item.years.join(', ')})`);
    console.log(`    Text: "${item.snippet}..."`);
    console.log(`    Sample IDs: ${item.sampleIds.join(', ')}\n`);
  });

  process.exit(0);
}

auditQuarantinedDuplicates().catch(err => {
  console.error(err);
  process.exit(1);
});
