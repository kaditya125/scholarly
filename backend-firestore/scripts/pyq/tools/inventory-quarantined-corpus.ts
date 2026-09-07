import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';

interface QuarantinedInventoryReport {
  totalQuarantined: number;
  totalActiveJee: number;
  byExam: Record<string, {
    total: number;
    uniqueNormalizedTexts: number;
    duplicateGroupsCount: number;
    years: Record<number, number>;
    papers: Record<string, number>;
    subjects: Record<string, number>;
    quarantineReasons: Record<string, number>;
    origins: Record<string, number>;
    sourceTypes: Record<string, number>;
    verificationStatuses: Record<string, number>;
    overlapWithActiveJeeCount: number;
    multiPaperReplayCount: number;
  }>;
  duplicateHistogram: Record<string, number>;
  crossExamOverlap: Record<string, number>;
  sampleJeeOverlaps: Array<{
    quarantinedId: string;
    quarantinedExam: string;
    activeJeeId: string;
    textSnippet: string;
  }>;
  sampleMultiPaperReplays: Array<{
    examId: string;
    textSnippet: string;
    occurrencesCount: number;
    papersClaimed: string[];
    yearsClaimed: number[];
  }>;
}

const norm = (s: string): string => {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/\$+/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

async function buildQuarantineInventory() {
  console.log('================================================================');
  console.log('📦  SADHYA STEP 2: COMPREHENSIVE QUARANTINE INVENTORY AUDIT');
  console.log('================================================================\n');

  console.log('Fetching all documents from Firestore "pyq_questions"...');
  const snap = await db.collection('pyq_questions').get();
  console.log(`Total Firestore documents: ${snap.size}\n`);

  const quarantinedDocs: any[] = [];
  const activeJeeTexts = new Map<string, string>(); // normText -> id

  snap.forEach((doc) => {
    const d = { id: doc.id, ...(doc.data() as any) };
    const state = d.ingestionState;
    if (state === 'QUARANTINED') {
      quarantinedDocs.push(d);
    } else if (d.examId === 'JEE_MAIN' && (state === 'ACTIVE' || d.vectorIndexed === true)) {
      const n = norm(d.questionText);
      if (n) activeJeeTexts.set(n, d.questionId || doc.id);
    }
  });

  console.log(`Quarantined documents identified: ${quarantinedDocs.length}`);
  console.log(`Active JEE Main questions in reference index: ${activeJeeTexts.size}\n`);

  const byExam: QuarantinedInventoryReport['byExam'] = {};
  const globalQuarantinedTexts = new Map<string, any[]>();
  const sampleJeeOverlaps: any[] = [];

  for (const q of quarantinedDocs) {
    const ex = q.examId || 'UNKNOWN';
    const yr = q.year || 0;
    const paper = q.paper || q.shift || 'UNSPECIFIED_PAPER';
    const subj = q.subject || 'UNSPECIFIED_SUBJECT';
    const reason = q.quarantineReason || 'NO_REASON_SET';
    const origin = q.origin || 'unknown';
    const srcType = q.sourceType || 'UNSPECIFIED';
    const verStatus = q.verificationStatus || 'UNVERIFIED';
    const nText = norm(q.questionText);

    if (!byExam[ex]) {
      byExam[ex] = {
        total: 0,
        uniqueNormalizedTexts: 0,
        duplicateGroupsCount: 0,
        years: {},
        papers: {},
        subjects: {},
        quarantineReasons: {},
        origins: {},
        sourceTypes: {},
        verificationStatuses: {},
        overlapWithActiveJeeCount: 0,
        multiPaperReplayCount: 0,
      };
    }

    const rec = byExam[ex];
    rec.total++;
    rec.years[yr] = (rec.years[yr] || 0) + 1;
    rec.papers[paper] = (rec.papers[paper] || 0) + 1;
    rec.subjects[subj] = (rec.subjects[subj] || 0) + 1;
    rec.quarantineReasons[reason] = (rec.quarantineReasons[reason] || 0) + 1;
    rec.origins[origin] = (rec.origins[origin] || 0) + 1;
    rec.sourceTypes[srcType] = (rec.sourceTypes[srcType] || 0) + 1;
    rec.verificationStatuses[verStatus] = (rec.verificationStatuses[verStatus] || 0) + 1;

    // Check overlap with Active JEE Main
    if (nText && activeJeeTexts.has(nText)) {
      rec.overlapWithActiveJeeCount++;
      if (sampleJeeOverlaps.length < 10) {
        sampleJeeOverlaps.push({
          quarantinedId: q.questionId || q.id,
          quarantinedExam: ex,
          activeJeeId: activeJeeTexts.get(nText)!,
          textSnippet: nText.slice(0, 90),
        });
      }
    }

    // Global text grouping
    if (nText) {
      const g = globalQuarantinedTexts.get(nText) || [];
      g.push(q);
      globalQuarantinedTexts.set(nText, g);
    }
  }

  // Calculate unique texts and duplicate groups per exam
  const examTextMaps: Record<string, Map<string, any[]>> = {};
  for (const q of quarantinedDocs) {
    const ex = q.examId || 'UNKNOWN';
    const n = norm(q.questionText);
    if (!examTextMaps[ex]) examTextMaps[ex] = new Map();
    if (n) {
      const arr = examTextMaps[ex].get(n) || [];
      arr.push(q);
      examTextMaps[ex].set(n, arr);
    }
  }

  const sampleMultiPaperReplays: any[] = [];

  for (const [ex, map] of Object.entries(examTextMaps)) {
    byExam[ex].uniqueNormalizedTexts = map.size;
    let dupCount = 0;
    let multiPaperCount = 0;

    for (const [t, occs] of map.entries()) {
      if (occs.length > 1) {
        dupCount++;
        multiPaperCount += occs.length;

        if (sampleMultiPaperReplays.length < 12 && occs.length >= 4) {
          const papers = [...new Set(occs.map((o: any) => o.paper || o.shift || 'Unknown'))];
          const years = [...new Set(occs.map((o: any) => o.year))];
          sampleMultiPaperReplays.push({
            examId: ex,
            textSnippet: t.slice(0, 90),
            occurrencesCount: occs.length,
            papersClaimed: papers.slice(0, 4),
            yearsClaimed: years,
          });
        }
      }
    }
    byExam[ex].duplicateGroupsCount = dupCount;
    byExam[ex].multiPaperReplayCount = multiPaperCount;
  }

  // Duplicate histogram across quarantined corpus
  const dupHistogram: Record<string, number> = {
    '1x (Unique)': 0,
    '2x': 0,
    '3x-4x': 0,
    '5x-9x': 0,
    '10x+': 0,
  };

  for (const occs of globalQuarantinedTexts.values()) {
    const sz = occs.length;
    if (sz === 1) dupHistogram['1x (Unique)']++;
    else if (sz === 2) dupHistogram['2x']++;
    else if (sz <= 4) dupHistogram['3x-4x']++;
    else if (sz <= 9) dupHistogram['5x-9x']++;
    else dupHistogram['10x+']++;
  }

  const report: QuarantinedInventoryReport = {
    totalQuarantined: quarantinedDocs.length,
    totalActiveJee: activeJeeTexts.size,
    byExam,
    duplicateHistogram: dupHistogram,
    crossExamOverlap: {},
    sampleJeeOverlaps,
    sampleMultiPaperReplays,
  };

  const outPath = path.resolve(__dirname, 'quarantine_inventory_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`✅ Quarantine Inventory Report saved to: ${outPath}\n`);

  console.log('--- INVENTORY SUMMARY TABLE BY EXAM ---');
  console.table(
    Object.keys(byExam).map((ex) => ({
      Exam: ex,
      TotalQuarantined: byExam[ex].total,
      UniqueTexts: byExam[ex].uniqueNormalizedTexts,
      DupGroups: byExam[ex].duplicateGroupsCount,
      ReplayedDocs: byExam[ex].multiPaperReplayCount,
      JeeMainOverlap: byExam[ex].overlapWithActiveJeeCount,
      PrimaryReason: Object.keys(byExam[ex].quarantineReasons)[0],
    }))
  );

  console.log('\n--- DUPLICATE OCCURRENCE HISTOGRAM (QUARANTINED CORPUS) ---');
  console.table(dupHistogram);

  console.log(`\nSample Multi-Paper Template Replays: ${sampleMultiPaperReplays.length} captured.`);
  sampleMultiPaperReplays.slice(0, 5).forEach((r, idx) => {
    console.log(`[${idx + 1}] Exam: ${r.examId} | Replayed: ${r.occurrencesCount} times`);
    console.log(`    Years Claimed:  ${r.yearsClaimed.join(', ')}`);
    console.log(`    Papers Claimed: ${r.papersClaimed.join(' | ')}`);
    console.log(`    Snippet:        "${r.textSnippet}..."\n`);
  });

  process.exit(0);
}

buildQuarantineInventory().catch((err) => {
  console.error('Inventory error:', err);
  process.exit(1);
});
