import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { UGC_NET_PUBLIC_ADMIN_TAXONOMY } from './publicAdminSyllabusTaxonomy';

const POOL_PATH = path.resolve('dataset_staging/ugc_net_public_admin/ugc_net_public_admin_all_extracted_pyqs.json');
const OUT_ANALYTICS_PATH = path.resolve('dataset_staging/ugc_net_public_admin/ugc_net_public_admin_pattern_analytics.json');

async function main() {
  console.log('Computing Public Administration (Code 14) pattern analytics...');
  const questions: any[] = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));

  const unitStats: Record<string, { unitNumber: number; unitName: string; count: number; percentage: number }> = {};
  for (const u of UGC_NET_PUBLIC_ADMIN_TAXONOMY) {
    unitStats[u.unitCode] = {
      unitNumber: u.unitNumber,
      unitName: u.unitName,
      count: 0,
      percentage: 0
    };
  }

  const typologies: Record<string, number> = {
    conceptual: 0,
    assertion_reason: 0,
    matching: 0,
    chronological_sequence: 0,
    statement_evaluation: 0
  };

  for (const q of questions) {
    if (unitStats[q.unitCode]) {
      unitStats[q.unitCode].count++;
    }
    const t = q.text.toLowerCase();
    if (t.includes('assertion') && t.includes('reason')) {
      typologies.assertion_reason++;
    } else if (t.includes('match') || (t.includes('list - i') && t.includes('list - ii')) || (t.includes('list i') && t.includes('list ii'))) {
      typologies.matching++;
    } else if (t.includes('chronological') || t.includes('chronology') || t.includes('order of their')) {
      typologies.chronological_sequence++;
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
    subject: 'Public Administration',
    subjectCode: '14',
    totalAuthenticQuestions: questions.length,
    totalOfficialPapers: 34,
    taxonomyVersion: 'UGC_NET_PUBLIC_ADMIN_OFFICIAL_10_UNITS',
    unitDistribution: unitStats,
    questionTypologies: typologies,
    computedAt: Date.now()
  };

  fs.writeFileSync(OUT_ANALYTICS_PATH, JSON.stringify(analyticsDoc, null, 2), 'utf-8');
  await db.collection('pyq_analytics').doc('UGC_NET_PUBLIC_ADMIN_14').set(analyticsDoc, { merge: true });
  console.log('✅ Public Administration pattern analytics synced to Firestore: pyq_analytics/UGC_NET_PUBLIC_ADMIN_14');

  console.log('\n--- Unit Breakdown ---');
  for (const [code, stat] of Object.entries(unitStats)) {
    console.log(`  [Unit ${stat.unitNumber}] ${stat.unitName}: ${stat.count} (${stat.percentage}%)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
