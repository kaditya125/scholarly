import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { PYQQuarantineReason, PYQOrigin } from '../../../src/types/pyq.types';

interface RemediationPlanItem {
  id: string;
  examId: string;
  year: number;
  disposition: 'RETAIN_ACTIVE' | 'QUARANTINE';
  origin: PYQOrigin;
  quarantineReason?: PYQQuarantineReason;
  vectorId?: string;
  isVectorIndexed: boolean;
}

async function runRemediation() {
  const isExecute = process.argv.includes('--execute');
  const isDryRun = !isExecute || process.argv.includes('--dry-run');

  console.log('================================================================');
  console.log(`🛡️  SADHYA PYQ CORPUS REMEDIATION & QUARANTINE PIPELINE`);
  console.log(`Mode: ${isExecute ? '🚨 EXECUTE (LIVE MUTATION)' : '🔍 DRY-RUN (READ-ONLY SIMULATION)'}`);
  console.log('================================================================\n');

  console.log('Fetching all questions from Firestore collection "pyq_questions"...');
  const snap = await db.collection('pyq_questions').get();
  const total = snap.size;
  console.log(`Fetched ${total} records.\n`);

  const plan: RemediationPlanItem[] = [];
  const countsByExam: Record<string, { total: number; retain: number; quarantine: number }> = {};
  const countsByReason: Record<string, number> = {};
  const quarantinedVectorIds: string[] = [];

  for (const doc of snap.docs) {
    const d = doc.data() as any;
    const qId = d.questionId || doc.id;
    const examId = d.examId || 'UNKNOWN_EXAM';
    const year = d.year || 0;
    const isIndexed = d.vectorIndexed === true || d.ingestionState === 'INDEXED';
    const vectorId = `vec_${qId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    if (!countsByExam[examId]) {
      countsByExam[examId] = { total: 0, retain: 0, quarantine: 0 };
    }
    countsByExam[examId].total++;

    // Decision Logic:
    // 1. JEE_MAIN is the authentic NTA/ExamGoal import (93 real JSON shifts)
    if (examId === 'JEE_MAIN') {
      plan.push({
        id: doc.id,
        examId,
        year,
        disposition: 'RETAIN_ACTIVE',
        origin: 'authentic_import',
        isVectorIndexed: isIndexed,
        vectorId: isIndexed ? vectorId : undefined,
      });
      countsByExam[examId].retain++;
      continue;
    }

    // 2. Unknown Exam orphan doc
    if (examId === 'UNKNOWN_EXAM') {
      const reason: PYQQuarantineReason = 'UNKNOWN_ORIGIN';
      plan.push({
        id: doc.id,
        examId,
        year,
        disposition: 'QUARANTINE',
        origin: 'unknown',
        quarantineReason: reason,
        isVectorIndexed: isIndexed,
        vectorId: isIndexed ? vectorId : undefined,
      });
      countsByExam[examId].quarantine++;
      countsByReason[reason] = (countsByReason[reason] || 0) + 1;
      if (isIndexed) quarantinedVectorIds.push(vectorId);
      continue;
    }

    // 3. NEET_UG, SSC_CGL, UPSC_CSE, BPSC_CCE: Template generated blueprints with constructed URLs
    if (['NEET_UG', 'SSC_CGL', 'UPSC_CSE', 'BPSC_CCE'].includes(examId)) {
      const reason: PYQQuarantineReason = 'TEMPLATE_GENERATED';
      plan.push({
        id: doc.id,
        examId,
        year,
        disposition: 'QUARANTINE',
        origin: 'template',
        quarantineReason: reason,
        isVectorIndexed: isIndexed,
        vectorId: isIndexed ? vectorId : undefined,
      });
      countsByExam[examId].quarantine++;
      countsByReason[reason] = (countsByReason[reason] || 0) + 1;
      if (isIndexed) quarantinedVectorIds.push(vectorId);
      continue;
    }

    // 4. JEE_ADVANCED, RRB_NTPC, IBPS_PO: Seeded with unverified official provenance
    const reason: PYQQuarantineReason = 'UNVERIFIED_OFFICIAL_SOURCE';
    plan.push({
      id: doc.id,
      examId,
      year,
      disposition: 'QUARANTINE',
      origin: 'authored',
      quarantineReason: reason,
      isVectorIndexed: isIndexed,
      vectorId: isIndexed ? vectorId : undefined,
    });
    countsByExam[examId].quarantine++;
    countsByReason[reason] = (countsByReason[reason] || 0) + 1;
    if (isIndexed) quarantinedVectorIds.push(vectorId);
  }

  // Display Summary Tables
  console.log('--- REMEDIATION DISPOSITION BY EXAM ---');
  console.table(
    Object.keys(countsByExam).map((ex) => ({
      Exam: ex,
      Total: countsByExam[ex].total,
      RetainedActive: countsByExam[ex].retain,
      Quarantined: countsByExam[ex].quarantine,
      Action: countsByExam[ex].retain > 0 ? 'KEEP ACTIVE' : 'QUARANTINE',
    }))
  );

  console.log('\n--- QUARANTINE BREAKDOWN BY REASON ---');
  console.table(countsByReason);

  const totalRetain = Object.values(countsByExam).reduce((acc, c) => acc + c.retain, 0);
  const totalQuarantine = Object.values(countsByExam).reduce((acc, c) => acc + c.quarantine, 0);

  console.log(`\nOverall Summary:`);
  console.log(`  Total Evaluated:              ${plan.length}`);
  console.log(`  Retained Active (Authentic):  ${totalRetain}`);
  console.log(`  Quarantined:                  ${totalQuarantine}`);
  console.log(`  Quarantined Pinecone Vectors: ${quarantinedVectorIds.length}`);

  // Save vector IDs to disk for Phase F
  const vectorListPath = path.resolve(__dirname, 'quarantined_vector_ids.json');
  fs.writeFileSync(vectorListPath, JSON.stringify(quarantinedVectorIds, null, 2), 'utf-8');
  console.log(`\nSaved ${quarantinedVectorIds.length} vector IDs to: ${vectorListPath}`);

  if (isDryRun) {
    console.log('\n================================================================');
    console.log('✅ DRY-RUN COMPLETED. ZERO RECORDS OR VECTORS WERE MUTATED.');
    console.log('To execute live quarantine in Firestore, run:');
    console.log('  npx tsx scripts/pyq/tools/remediate-corpus.ts --execute');
    console.log('================================================================\n');
    process.exit(0);
  }

  // EXECUTE LIVE REMEDIATION
  console.log('\n================================================================');
  console.log('🚨 EXECUTING LIVE FIRESTORE REMEDIATION & QUARANTINE');
  console.log('================================================================\n');

  // 1. Create a backup of all quarantined records
  console.log('Creating safety backup of records to be updated...');
  const quarantinedRecords = snap.docs
    .filter((doc) => {
      const p = plan.find((item) => item.id === doc.id);
      return p?.disposition === 'QUARANTINE';
    })
    .map((doc) => ({ id: doc.id, ...doc.data() }));

  const backupPath = path.resolve(__dirname, 'backup_before_quarantine.json');
  fs.writeFileSync(backupPath, JSON.stringify(quarantinedRecords, null, 2), 'utf-8');
  console.log(`Safety backup saved to: ${backupPath} (${quarantinedRecords.length} records)\n`);

  // 2. Batched updates for Quarantined docs
  const now = Date.now();
  const BATCH_SIZE = 400;
  let updatedCount = 0;

  for (let i = 0; i < plan.length; i += BATCH_SIZE) {
    const chunk = plan.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const item of chunk) {
      const docRef = db.collection('pyq_questions').doc(item.id);
      if (item.disposition === 'QUARANTINE') {
        batch.update(docRef, {
          ingestionState: 'QUARANTINED',
          origin: item.origin,
          quarantineReason: item.quarantineReason,
          quarantinedAt: now,
          quarantinedBy: 'remediation-pipeline-v1',
          vectorIndexed: false, // Flag as unindexed for retrieval safety
          updatedAt: now,
        });
      } else {
        // Mark authentic items explicitly as ACTIVE
        batch.update(docRef, {
          origin: item.origin,
          ingestionState: 'ACTIVE',
          updatedAt: now,
        });
      }
    }

    await batch.commit();
    updatedCount += chunk.length;
    process.stdout.write(`Processed ${updatedCount} / ${plan.length} documents...\r`);
  }

  console.log(`\n✅ Firestore updates complete! Total records updated: ${updatedCount}`);

  // 3. Log remediation event to pyq_audit_logs
  console.log('Writing comprehensive audit log to pyq_audit_logs...');
  const auditId = `audit_remediation_${Date.now()}`;
  await db.collection('pyq_audit_logs').doc(auditId).set({
    id: auditId,
    eventType: 'CORPUS_REMEDIATION_AND_QUARANTINE',
    examId: 'ALL',
    entityId: 'pyq_questions',
    performedBy: 'system_agent_remediation',
    timestamp: now,
    details: {
      totalRecords: plan.length,
      retainedActive: totalRetain,
      quarantined: totalQuarantine,
      countsByExam,
      countsByReason,
      quarantinedVectorIdsCount: quarantinedVectorIds.length,
      backupFile: backupPath,
    },
  });
  console.log(`Audit log written: ${auditId}`);

  console.log('\n================================================================');
  console.log('🎉 PHASE E EXECUTION COMPLETED SUCCESSFULLY.');
  console.log('Next step: Phase F (Pinecone vector reconciliation).');
  console.log('================================================================\n');

  process.exit(0);
}

runRemediation().catch((err) => {
  console.error('Remediation error:', err);
  process.exit(1);
});
