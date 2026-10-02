import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { UGC_NET_PAPER1_TAXONOMY } from './paper1SyllabusTaxonomy';

const SAVE_FIRESTORE = process.argv.includes('--save-firestore');
const POOL_PATH = path.resolve('dataset_staging/ugc_net_paper1/ugc_net_paper1_all_extracted_pyqs.json');
const OUT_ANALYTICS_PATH = path.resolve('dataset_staging/ugc_net_paper1/ugc_net_paper1_pattern_analytics.json');

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Sadhya — UGC NET Paper I (General Paper Code 00) Analytics Engine');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!fs.existsSync(POOL_PATH)) {
    throw new Error(`Pool file not found: ${POOL_PATH}`);
  }

  const questions: any[] = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));
  console.log(`Analyzing ${questions.length} authentic Paper I questions...\n`);

  // Unit breakdown
  const unitStats: Record<string, { unitNumber: number; unitName: string; count: number; percentage: number }> = {};
  for (const u of UGC_NET_PAPER1_TAXONOMY) {
    unitStats[u.unitCode] = {
      unitNumber: u.unitNumber,
      unitName: u.unitName,
      count: 0,
      percentage: 0
    };
  }

  // Typology breakdown
  const typologies: Record<string, number> = {
    conceptual: 0,
    assertion_reason: 0,
    matching: 0,
    data_analysis: 0,
    numerical: 0,
    statement_evaluation: 0
  };

  for (const q of questions) {
    if (unitStats[q.unitCode]) {
      unitStats[q.unitCode].count++;
    }
    const t = q.text.toLowerCase();
    if (t.includes('assertion') && t.includes('reason')) {
      typologies.assertion_reason++;
    } else if (t.includes('match') || (t.includes('set - i') && t.includes('set - ii')) || (t.includes('list - i') && t.includes('list - ii'))) {
      typologies.matching++;
    } else if (t.includes('table') || t.includes('percentage') || t.includes('chart') || t.includes('ratio')) {
      typologies.data_analysis++;
    } else if (/\d+\s*[\+\-\*\/]/.test(t) || t.includes('sum of') || t.includes('series')) {
      typologies.numerical++;
    } else if (t.includes('which of the following statement') || t.includes('statements is/are correct')) {
      typologies.statement_evaluation++;
    } else {
      typologies.conceptual++;
    }
  }

  for (const k in unitStats) {
    unitStats[k].percentage = Number(((unitStats[k].count / questions.length) * 100).toFixed(2));
  }

  const analyticsDoc = {
    examId: 'UGC_NET',
    subject: 'General Paper on Teaching & Research Aptitude',
    subjectCode: '00',
    totalAuthenticQuestions: questions.length,
    totalExaminationSessions: 13,
    taxonomyVersion: 'UGC_NET_PAPER1_OFFICIAL_10_UNITS',
    unitDistribution: unitStats,
    questionTypologies: typologies,
    examStructure: {
      standardQuestions: 50,
      marksPerQuestion: 2,
      totalMarks: 100,
      negativeMarking: false,
      questionsPerUnit: 5
    },
    computedAt: Date.now()
  };

  fs.writeFileSync(OUT_ANALYTICS_PATH, JSON.stringify(analyticsDoc, null, 2), 'utf-8');
  console.log(`Saved pattern analytics to: ${OUT_ANALYTICS_PATH}`);

  if (SAVE_FIRESTORE) {
    console.log('Writing to Firestore collection pyq_analytics / doc UGC_NET_PAPER1...');
    await db.collection('pyq_analytics').doc('UGC_NET_PAPER1').set(analyticsDoc, { merge: true });
    console.log('✅ Firestore sync complete!');
  }

  console.log('\n--- Summary Report ---');
  console.log(`Total questions analyzed: ${questions.length}`);
  for (const [code, stat] of Object.entries(unitStats)) {
    console.log(`  [Unit ${stat.unitNumber}] ${stat.unitName}: ${stat.count} (${stat.percentage}%)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
