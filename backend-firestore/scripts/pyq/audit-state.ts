/**
 * Zero-Cost Production PYQ Subsystem Audit Script
 * Reads metadata counts directly from Firestore collections and inspects indexer lock.
 * Guaranteed 0 embedding calls.
 */

import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { env } from '../../src/config/env';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { readLock, PROBE_VECTOR } from '../phase4a/_embedding-guard';

async function audit() {
  console.log('======================================================');
  console.log('🔍 SADHYA PYQ PRODUCTION STATE AUDIT');
  console.log('======================================================');

  // 1. Indexer Lock Status
  const lock = readLock();
  console.log('\n🔒 INDEXER LOCK STATUS:');
  if (lock) {
    console.log(`  Status: ACTIVE (PID: ${lock.pid}, Label: "${lock.label}", Started: ${new Date(lock.startedAt).toISOString()})`);
    console.log(`  ⚠️  Active indexer running. Embedding calls must be paused or coordinated.`);
  } else {
    console.log('  Status: CLEAR (No active background indexer lock)');
  }

  // 2. Source Registry
  const sourceSnap = await db.collection('pyq_source_registry').get();
  const sources = sourceSnap.docs.map((d) => d.data());
  
  const sourcesByExam: Record<string, { total: number; official: number; secondary: number }> = {};
  for (const s of sources) {
    const exam = s.examId || 'UNKNOWN';
    if (!sourcesByExam[exam]) {
      sourcesByExam[exam] = { total: 0, official: 0, secondary: 0 };
    }
    sourcesByExam[exam].total++;
    if (s.sourceTier === 'TIER_A_OFFICIAL') sourcesByExam[exam].official++;
    else sourcesByExam[exam].secondary++;
  }

  console.log(`\n📚 SOURCE REGISTRY (Total Sources: ${sources.length}):`);
  for (const [exam, counts] of Object.entries(sourcesByExam)) {
    console.log(`  - ${exam.padEnd(16)}: ${counts.total.toString().padStart(3)} sources (Official: ${counts.official.toString().padStart(2)}, Secondary: ${counts.secondary.toString().padStart(2)})`);
  }

  // 3. Question Bank State
  const questionSnap = await db.collection('pyq_questions').get();
  const questions = questionSnap.docs.map((d) => d.data());

  const questionsByExam: Record<string, {
    total: number;
    extracted: number;
    verified: number;
    rightsApproved: number;
    indexed: number;
    quarantined: number;
    conflicting: number;
  }> = {};

  for (const q of questions) {
    const exam = q.examId || 'UNKNOWN';
    if (!questionsByExam[exam]) {
      questionsByExam[exam] = {
        total: 0,
        extracted: 0,
        verified: 0,
        rightsApproved: 0,
        indexed: 0,
        quarantined: 0,
        conflicting: 0,
      };
    }
    const stat = questionsByExam[exam];
    stat.total++;
    if (q.ingestionState === 'EXTRACTED') stat.extracted++;
    if (q.ingestionState === 'VERIFIED') stat.verified++;
    if (q.ingestionState === 'RIGHTS_APPROVED') stat.rightsApproved++;
    if (q.ingestionState === 'INDEXED' || q.vectorIndexed) stat.indexed++;
    if (q.ingestionState === 'QUARANTINED') stat.quarantined++;
    if (q.verificationStatus === 'CONFLICTING') stat.conflicting++;
  }

  console.log(`\n❓ CANONICAL QUESTION BANK (Total Questions in Firestore: ${questions.length}):`);
  if (questions.length === 0) {
    console.log('  (No canonical questions in repository yet)');
  } else {
    for (const [exam, stat] of Object.entries(questionsByExam)) {
      console.log(`  - ${exam.padEnd(16)}: Total: ${stat.total} | Rights Approved: ${stat.rightsApproved} | Indexed (DB): ${stat.indexed} | Quarantined: ${stat.quarantined} | Conflicts: ${stat.conflicting}`);
    }
  }

  // 4. Pinecone Vector Store Live Metadata Check (Zero Embedding Quota)
  console.log(`\n🌲 PINECONE VECTOR STORE STATE (Zero-Cost Metadata Probe):`);
  const pineconeCounts: Record<string, number> = {};
  for (const exam of Object.keys(sourcesByExam)) {
    try {
      const count = await pineconeService.queryVectors(
        PROBE_VECTOR as any,
        1000,
        { examId: exam, content_type: 'pyq' } as any,
        env.PINECONE_NAMESPACE
      );
      pineconeCounts[exam] = count?.length || 0;
      console.log(`  - ${exam.padEnd(16)}: ${pineconeCounts[exam]} vectors indexed with content_type='pyq'`);
    } catch (err: any) {
      console.log(`  - ${exam.padEnd(16)}: Error querying Pinecone: ${err?.message}`);
    }
  }

  // 4. Analytics and Audit Logs
  const [analyticsSnap, auditSnap] = await Promise.all([
    db.collection('pyq_analytics').get(),
    db.collection('pyq_audit_logs').get(),
  ]);

  console.log(`\n📊 PYQ ANALYTICS CACHES : ${analyticsSnap.size} exam reports cached`);
  console.log(`📝 AUDIT LOG TRAIL      : ${auditSnap.size} logged events`);

  console.log('\n======================================================');
}

audit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
