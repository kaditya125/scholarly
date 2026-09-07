import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { pyqRestorationEngine, RestorationEvaluation } from '../../../src/services/pyq/pyqRestorationEngine.service';
import { PYQRestorationState } from '../../../src/types/pyq.types';

interface PipelineSummary {
  totalQuarantinedEvaluated: number;
  byRestorationState: Record<PYQRestorationState, number>;
  byExam: Record<string, Record<PYQRestorationState, number>>;
  restoredToActiveCount: number;
  remainedQuarantinedCount: number;
}

async function runRestorationPipeline() {
  const isExecute = process.argv.includes('--execute');
  const isDryRun = !isExecute || process.argv.includes('--dry-run');

  console.log('================================================================');
  console.log('🛡️  SADHYA QUARANTINED-PYQ RESTORATION & VERIFICATION PIPELINE');
  console.log(`Mode: ${isExecute ? '🚨 EXECUTE (LIVE MUTATION)' : '🔍 DRY-RUN (READ-ONLY SIMULATION)'}`);
  console.log('================================================================\n');

  console.log('Querying all quarantined questions from Firestore "pyq_questions"...');
  const snap = await db.collection('pyq_questions')
    .where('ingestionState', '==', 'QUARANTINED')
    .get();

  const total = snap.size;
  console.log(`Total quarantined questions retrieved: ${total}\n`);

  // Build occurrences frequency map for cross-paper replay detection
  const textOccurrences = new Map<string, any[]>();
  snap.docs.forEach((d) => {
    const data = d.data();
    const t = String(data.questionText || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (t) {
      const arr = textOccurrences.get(t) || [];
      arr.push(data);
      textOccurrences.set(t, arr);
    }
  });

  const evaluations: RestorationEvaluation[] = [];
  const stateCounts: Record<PYQRestorationState, number> = {
    VERIFIED_AUTHENTIC: 0,
    CORROBORATED_EXTERNAL: 0,
    UNVERIFIED: 0,
    CONFLICTING: 0,
    SYNTHETIC_TEMPLATE: 0,
  };
  const byExamCounts: Record<string, Record<PYQRestorationState, number>> = {};

  for (const doc of snap.docs) {
    const q = doc.data() as any;
    const ex = q.examId || 'UNKNOWN';
    const t = String(q.questionText || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const replayOccs = textOccurrences.get(t) || [];
    const isMultiReplay = replayOccs.length > 1;

    const evaluation = pyqRestorationEngine.evaluate(q, {
      isMultiPaperReplay: isMultiReplay,
      replayOccurrencesCount: replayOccs.length,
      hasAuthenticArtifactFile: false, // Quarantined items currently lack verifiable local artifact files
    });

    evaluations.push(evaluation);
    stateCounts[evaluation.restorationState]++;

    if (!byExamCounts[ex]) {
      byExamCounts[ex] = {
        VERIFIED_AUTHENTIC: 0,
        CORROBORATED_EXTERNAL: 0,
        UNVERIFIED: 0,
        CONFLICTING: 0,
        SYNTHETIC_TEMPLATE: 0,
      };
    }
    byExamCounts[ex][evaluation.restorationState]++;
  }

  // Display Evaluation Results
  console.log('--- RESTORATION EVALUATION BREAKDOWN BY EXAM ---');
  console.table(
    Object.keys(byExamCounts).map((ex) => ({
      Exam: ex,
      VerifiedAuthentic: byExamCounts[ex].VERIFIED_AUTHENTIC,
      CorroboratedExternal: byExamCounts[ex].CORROBORATED_EXTERNAL,
      SyntheticTemplate: byExamCounts[ex].SYNTHETIC_TEMPLATE,
      Unverified: byExamCounts[ex].UNVERIFIED,
      Conflicting: byExamCounts[ex].CONFLICTING,
      EligibleForActive: byExamCounts[ex].VERIFIED_AUTHENTIC,
    }))
  );

  console.log('\n--- OVERALL RESTORATION STATE TOTALS ---');
  console.table(stateCounts);

  const eligibleForActive = evaluations.filter((e) => e.isEligibleForActive);
  const remainingQuarantined = evaluations.filter((e) => !e.isEligibleForActive);

  console.log(`\nCorpus Restoration Disposition:`);
  console.log(`  Total Quarantined Evaluated:  ${evaluations.length}`);
  console.log(`  Eligible to Restore to Active: ${eligibleForActive.length}`);
  console.log(`  Must Remain Quarantined:      ${remainingQuarantined.length}`);

  const reportOutPath = path.resolve(__dirname, 'restoration_pipeline_report.json');
  const summary: PipelineSummary = {
    totalQuarantinedEvaluated: evaluations.length,
    byRestorationState: stateCounts,
    byExam: byExamCounts,
    restoredToActiveCount: eligibleForActive.length,
    remainedQuarantinedCount: remainingQuarantined.length,
  };
  fs.writeFileSync(reportOutPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`\nDetailed report saved to: ${reportOutPath}`);

  if (isDryRun) {
    console.log('\n================================================================');
    console.log('🔍 DRY-RUN COMPLETED. ZERO RECORDS MUTATED.');
    console.log(`Strict Principle Enforced: "provenance accuracy > quantity."`);
    console.log(`0 unverified or template records promoted to TIER_A_OFFICIAL.`);
    console.log('To execute tagging in Firestore, run:');
    console.log('  npx tsx scripts/pyq/tools/run-restoration-pipeline.ts --execute');
    console.log('================================================================\n');
    process.exit(0);
  }

  // EXECUTE LIVE TAGGING / RESTORATION
  console.log('\n================================================================');
  console.log('🚨 EXECUTING LIVE FIRESTORE RESTORATION STATE UPDATES');
  console.log('================================================================\n');

  const now = Date.now();
  const BATCH_SIZE = 400;
  let updatedCount = 0;

  for (let i = 0; i < evaluations.length; i += BATCH_SIZE) {
    const chunk = evaluations.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const item of chunk) {
      const docRef = db.collection('pyq_questions').doc(item.questionId);
      if (item.isEligibleForActive) {
        batch.update(docRef, {
          restorationState: item.restorationState,
          ingestionState: 'ACTIVE',
          vectorIndexed: true,
          updatedAt: now,
        });
      } else {
        batch.update(docRef, {
          restorationState: item.restorationState,
          ingestionState: 'QUARANTINED',
          updatedAt: now,
        });
      }
    }

    await batch.commit();
    updatedCount += chunk.length;
    process.stdout.write(`Updated ${updatedCount} / ${evaluations.length} records...\r`);
  }

  console.log(`\n\n✅ Firestore records successfully tagged with restorationState!`);

  // Log to audit collection
  const auditId = `audit_restoration_evaluation_${now}`;
  await db.collection('pyq_audit_logs').doc(auditId).set({
    id: auditId,
    eventType: 'QUARANTINE_RESTORATION_EVALUATION',
    examId: 'ALL',
    entityId: 'pyq_questions',
    performedBy: 'restoration_pipeline_v1',
    timestamp: now,
    details: {
      totalEvaluated: evaluations.length,
      byRestorationState: stateCounts,
      byExam: byExamCounts,
      restoredToActive: eligibleForActive.length,
      remainedQuarantined: remainingQuarantined.length,
    },
  });
  console.log(`Audit log written: ${auditId}`);

  console.log('\n================================================================');
  console.log('🎉 RESTORATION PIPELINE COMPLETED.');
  console.log('================================================================\n');

  process.exit(0);
}

runRestorationPipeline().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
