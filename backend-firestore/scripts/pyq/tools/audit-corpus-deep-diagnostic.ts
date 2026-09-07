import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { env } from '../../../src/config/env';

interface DiagnosticResult {
  totalRecords: number;
  recordsByExam: Record<string, number>;
  uniqueNormalizedTextsByExam: Record<string, number>;
  globalUniqueNormalizedTexts: number;
  duplicateGroupCountByExam: Record<string, number>;
  globalDuplicateGroupsCount: number;
  duplicateGroupSizeHistogram: Record<string, number>;
  provenanceDistribution: Record<string, number>;
  originDistribution: Record<string, number>;
  officialProvenanceUnverifiedCount: number;
  constructedUrlCount: number;
  constructedUrlsByExam: Record<string, number>;
  missingAnswersCount: number;
  missingAnswersByExam: Record<string, number>;
  missingSolutionsCount: number;
  missingSolutionsByExam: Record<string, number>;
  missingExplanationsCount: number;
  missingExplanationsByExam: Record<string, number>;
  missingExamYearPaperShiftCount: number;
  weakOrMissingTaxonomyCount: number;
  weakOrMissingTaxonomyByExam: Record<string, number>;
  pineconeStats: any;
  firestorePineconeConsistency: {
    firestoreMarkedIndexed: number;
    firestoreMarkedIndexedByExam: Record<string, number>;
    quarantinedCount: number;
    quarantinedByExam: Record<string, number>;
  };
  sampleConstructedUrls: string[];
  sampleDuplicateGroups: Array<{
    examId: string;
    textSnippet: string;
    occurrences: Array<{ id: string; year: number; paper?: string; shift?: string }>;
  }>;
}

const normText = (s: string): string => {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/\$+/g, '') // remove latex delimiters
    .replace(/[^\w\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
};

const isConstructedUrl = (url: string): boolean => {
  if (!url) return false;
  // Check for common generator template URL patterns
  const patterns = [
    /exams\.nta\.ac\.in\/NEET\/archive\/neet_ug_\d+_[a-z0-9]+\.pdf/i,
    /ssc\.nic\.in\/Portal\/QuestionPapers\/\d+_\d+_\d+\.pdf/i,
    /upsc\.gov\.in\/examinations\/previous-question-papers\/\d+\/upsc_cse_\d+_[a-z0-9_]+\.pdf/i,
    /bpsc\.bih\.nic\.in\/Advt\/bpsc_cce_\d+_[a-z0-9_]+\.pdf/i,
    /ibps\.in\/archive\/ibps_po_\d+_[a-z0-9_]+\.pdf/i,
    /rrbcdg\.gov\.in\/archive\/rrb_ntpc_\d+_[a-z0-9_]+\.pdf/i,
  ];
  return patterns.some((p) => p.test(url));
};

async function runAudit() {
  console.log('================================================================');
  console.log('🔍 SADHYA PYQ CORPUS PHASE A READ-ONLY DEEP DIAGNOSTIC AUDIT');
  console.log('================================================================\n');

  console.log('Fetching all records from Firestore collection "pyq_questions"...');
  const snap = await db.collection('pyq_questions').get();
  const total = snap.size;
  console.log(`Total Firestore records fetched: ${total}\n`);

  const recordsByExam: Record<string, number> = {};
  const textsByExam: Record<string, Map<string, any[]>> = {};
  const globalTexts = new Map<string, any[]>();
  const provenanceDist: Record<string, number> = {};
  const originDist: Record<string, number> = {};
  const constructedUrlsByExam: Record<string, number> = {};
  const missingAnswersByExam: Record<string, number> = {};
  const missingSolutionsByExam: Record<string, number> = {};
  const missingExplanationsByExam: Record<string, number> = {};
  const weakTaxonomyByExam: Record<string, number> = {};
  const firestoreMarkedIndexedByExam: Record<string, number> = {};
  const quarantinedByExam: Record<string, number> = {};

  let constructedUrlCount = 0;
  let officialUnverifiedCount = 0;
  let missingAnswersCount = 0;
  let missingSolutionsCount = 0;
  let missingExplanationsCount = 0;
  let missingMetaCount = 0;
  let weakTaxonomyCount = 0;
  let firestoreMarkedIndexed = 0;
  let quarantinedCount = 0;

  const sampleConstructedUrls: string[] = [];

  for (const doc of snap.docs) {
    const d = doc.data() as any;
    const qId = d.questionId || doc.id;
    const examId = d.examId || 'UNKNOWN_EXAM';
    const year = d.year;
    const paper = d.paper;
    const shift = d.shift;
    const qText = d.questionText || d.text || '';
    const nText = normText(qText);

    // Records by exam
    recordsByExam[examId] = (recordsByExam[examId] || 0) + 1;

    // Text grouping per exam
    if (!textsByExam[examId]) textsByExam[examId] = new Map();
    if (nText) {
      const examGroup = textsByExam[examId].get(nText) || [];
      examGroup.push({ id: qId, year, paper, shift, sourceUrl: d.sourceUrl });
      textsByExam[examId].set(nText, examGroup);

      const globGroup = globalTexts.get(nText) || [];
      globGroup.push({ id: qId, examId, year, paper, shift, sourceUrl: d.sourceUrl });
      globalTexts.set(nText, globGroup);
    }

    // Provenance / SourceType
    const srcType = d.sourceType || d.sourceTier || 'UNSPECIFIED';
    provenanceDist[srcType] = (provenanceDist[srcType] || 0) + 1;

    // Origin
    const origin = d.origin || (d.templateSource ? 'template' : 'unknown_legacy');
    originDist[origin] = (originDist[origin] || 0) + 1;

    // Official provenance with no verification
    if (srcType === 'TIER_A_OFFICIAL' || d.verificationStatus === 'OFFICIAL_CONFIRMED') {
      const isConstructed = isConstructedUrl(d.sourceUrl);
      if (isConstructed || !d.sourceUrl || d.sourceUrl.includes('example') || !d.verificationEvidence) {
        officialUnverifiedCount++;
      }
    }

    // Constructed URL check
    if (isConstructedUrl(d.sourceUrl)) {
      constructedUrlCount++;
      constructedUrlsByExam[examId] = (constructedUrlsByExam[examId] || 0) + 1;
      if (sampleConstructedUrls.length < 10 && !sampleConstructedUrls.includes(d.sourceUrl)) {
        sampleConstructedUrls.push(d.sourceUrl);
      }
    }

    // Missing answers
    if (!d.correctAnswer || String(d.correctAnswer).trim() === '') {
      missingAnswersCount++;
      missingAnswersByExam[examId] = (missingAnswersByExam[examId] || 0) + 1;
    }

    // Missing solutions
    if (!d.solution || String(d.solution).trim() === '') {
      missingSolutionsCount++;
      missingSolutionsByExam[examId] = (missingSolutionsByExam[examId] || 0) + 1;
    }

    // Missing explanations
    if (!d.explanation || String(d.explanation).trim() === '') {
      missingExplanationsCount++;
      missingExplanationsByExam[examId] = (missingExplanationsByExam[examId] || 0) + 1;
    }

    // Missing exam / year / paper / shift
    if (!d.examId || !d.year || (!d.paper && !d.shift)) {
      missingMetaCount++;
    }

    // Weak / missing taxonomy (no topic, no chapter, or no syllabusNodeId)
    const isTaxWeak = !d.syllabusNodeId || !d.topic || !d.chapter;
    if (isTaxWeak) {
      weakTaxonomyCount++;
      weakTaxonomyByExam[examId] = (weakTaxonomyByExam[examId] || 0) + 1;
    }

    // Vector Indexed in Firestore
    if (d.vectorIndexed === true || d.ingestionState === 'INDEXED') {
      firestoreMarkedIndexed++;
      firestoreMarkedIndexedByExam[examId] = (firestoreMarkedIndexedByExam[examId] || 0) + 1;
    }

    // Quarantined
    if (d.ingestionState === 'QUARANTINED') {
      quarantinedCount++;
      quarantinedByExam[examId] = (quarantinedByExam[examId] || 0) + 1;
    }
  }

  // Unique texts and duplicate groups by exam
  const uniqueTextsByExam: Record<string, number> = {};
  const duplicateGroupsByExam: Record<string, number> = {};
  const sampleDuplicateGroups: any[] = [];

  for (const [examId, textMap] of Object.entries(textsByExam)) {
    uniqueTextsByExam[examId] = textMap.size;
    let dupCount = 0;
    for (const [t, occurrences] of textMap.entries()) {
      if (occurrences.length > 1) {
        dupCount++;
        if (sampleDuplicateGroups.length < 15 && occurrences.length >= 3) {
          sampleDuplicateGroups.push({
            examId,
            textSnippet: t.slice(0, 100),
            occurrences: occurrences.slice(0, 5),
          });
        }
      }
    }
    duplicateGroupsByExam[examId] = dupCount;
  }

  // Global duplicate group histogram
  const dupSizeHistogram: Record<string, number> = {
    '2x': 0,
    '3x-4x': 0,
    '5x-9x': 0,
    '10x-19x': 0,
    '20x+': 0,
  };
  let globalDupGroupsCount = 0;

  for (const occurrences of globalTexts.values()) {
    const sz = occurrences.length;
    if (sz > 1) {
      globalDupGroupsCount++;
      if (sz === 2) dupSizeHistogram['2x']++;
      else if (sz <= 4) dupSizeHistogram['3x-4x']++;
      else if (sz <= 9) dupSizeHistogram['5x-9x']++;
      else if (sz <= 19) dupSizeHistogram['10x-19x']++;
      else dupSizeHistogram['20x+']++;
    }
  }

  // Pinecone Stats
  console.log('Querying Pinecone index statistics...');
  let pineconeStats: any = null;
  try {
    pineconeStats = await pineconeService.getIndexStats();
    console.log('Pinecone index stats fetched successfully.');
  } catch (err: any) {
    console.warn('Failed to query Pinecone stats:', err?.message || err);
    pineconeStats = { error: err?.message || String(err) };
  }

  const result: DiagnosticResult = {
    totalRecords: total,
    recordsByExam,
    uniqueNormalizedTextsByExam: uniqueTextsByExam,
    globalUniqueNormalizedTexts: globalTexts.size,
    duplicateGroupCountByExam: duplicateGroupsByExam,
    globalDuplicateGroupsCount: globalDupGroupsCount,
    duplicateGroupSizeHistogram: dupSizeHistogram,
    provenanceDistribution: provenanceDist,
    originDistribution: originDist,
    officialProvenanceUnverifiedCount: officialUnverifiedCount,
    constructedUrlCount,
    constructedUrlsByExam,
    missingAnswersCount,
    missingAnswersByExam,
    missingSolutionsCount,
    missingSolutionsByExam,
    missingExplanationsCount,
    missingExplanationsByExam,
    missingExamYearPaperShiftCount: missingMetaCount,
    weakOrMissingTaxonomyCount: weakTaxonomyCount,
    weakOrMissingTaxonomyByExam: weakTaxonomyByExam,
    pineconeStats,
    firestorePineconeConsistency: {
      firestoreMarkedIndexed,
      firestoreMarkedIndexedByExam,
      quarantinedCount,
      quarantinedByExam,
    },
    sampleConstructedUrls,
    sampleDuplicateGroups,
  };

  const outPath = path.resolve(__dirname, 'audit_baseline_results.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n✅ Audit results saved to: ${outPath}\n`);

  console.log('----------------------------------------------------------------');
  console.log('SUMMARY OF AUDIT FINDINGS:');
  console.log('----------------------------------------------------------------');
  console.log(`1.  Total Records:                          ${result.totalRecords}`);
  console.log(`2.  Global Unique Texts:                    ${result.globalUniqueNormalizedTexts}`);
  console.log(`3.  Global Duplicate Groups:                ${result.globalDuplicateGroupsCount}`);
  console.log(`4.  Constructed URLs:                       ${result.constructedUrlCount}`);
  console.log(`5.  Official Unverified Provenance:         ${result.officialProvenanceUnverifiedCount}`);
  console.log(`6.  Missing Answers:                        ${result.missingAnswersCount}`);
  console.log(`7.  Missing Solutions:                      ${result.missingSolutionsCount}`);
  console.log(`8.  Missing Explanations:                   ${result.missingExplanationsCount}`);
  console.log(`9.  Missing Exam/Year/Paper/Shift:          ${result.missingExamYearPaperShiftCount}`);
  console.log(`10. Weak Taxonomy (Missing SyllabusNode):   ${result.weakOrMissingTaxonomyCount}`);
  console.log(`11. Firestore Marked Indexed:               ${result.firestorePineconeConsistency.firestoreMarkedIndexed}`);
  console.log(`12. Currently Quarantined:                  ${result.firestorePineconeConsistency.quarantinedCount}`);
  console.log('\nRecords by Exam:');
  console.table(
    Object.keys(recordsByExam).map((ex) => ({
      Exam: ex,
      Total: recordsByExam[ex],
      UniqueTexts: uniqueTextsByExam[ex],
      DupGroups: duplicateGroupsByExam[ex],
      DupRate: `${(((recordsByExam[ex] - uniqueTextsByExam[ex]) / recordsByExam[ex]) * 100).toFixed(1)}%`,
      ConstructedURLs: constructedUrlsByExam[ex] || 0,
      MissingSol: missingSolutionsByExam[ex] || 0,
      WeakTax: weakTaxonomyByExam[ex] || 0,
      Indexed: firestoreMarkedIndexedByExam[ex] || 0,
    }))
  );

  console.log('\nDuplicate Group Size Distribution:');
  console.table(dupSizeHistogram);

  console.log('\nPinecone Statistics:');
  console.log(JSON.stringify(pineconeStats, null, 2));

  process.exit(0);
}

runAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
