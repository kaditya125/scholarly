import { db } from '../../../src/config/firebase';
import { pineconeService } from '../../../src/services/rag/pinecone.service';
import { env } from '../../../src/config/env';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('📊 GLOBAL SADHYA QUESTION CORPUS AUDIT (ALL EXAMS)');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  console.log('Streaming all documents from Firestore collection "pyq_questions"...');
  
  // Stream to avoid loading all memory at once
  const stream = db.collection('pyq_questions').stream();

  let totalDocs = 0;
  const examCounts: Record<string, {
    total: number;
    verified: number;
    active: number;
    indexed: number;
    quarantined: number;
    archivedDuplicate: number;
    draft: number;
    vectorIndexed: number;
    hasAnswer: number;
  }> = {};

  const stateCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};

  for await (const doc of stream) {
    totalDocs++;
    const data = doc.data();
    const rawExam = data.examId || data.examName || 'UNKNOWN_EXAM';
    const exam = String(rawExam).toUpperCase();

    if (!examCounts[exam]) {
      examCounts[exam] = {
        total: 0,
        verified: 0,
        active: 0,
        indexed: 0,
        quarantined: 0,
        archivedDuplicate: 0,
        draft: 0,
        vectorIndexed: 0,
        hasAnswer: 0
      };
    }

    examCounts[exam].total++;
    const state = String(data.ingestionState || 'UNKNOWN');
    stateCounts[state] = (stateCounts[state] || 0) + 1;

    const status = String(data.verificationStatus || 'UNKNOWN');
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    if (state === 'VERIFIED') examCounts[exam].verified++;
    else if (state === 'ACTIVE') examCounts[exam].active++;
    else if (state === 'INDEXED') examCounts[exam].indexed++;
    else if (state === 'QUARANTINED') examCounts[exam].quarantined++;
    else if (state === 'ARCHIVED_DUPLICATE') examCounts[exam].archivedDuplicate++;
    else examCounts[exam].draft++;

    if (data.vectorIndexed === true) examCounts[exam].vectorIndexed++;
    if (data.correctAnswer && String(data.correctAnswer).trim().length > 0) {
      examCounts[exam].hasAnswer++;
    }
  }

  console.log(`\n✅ Finished reading ${totalDocs} total documents from Firestore.\n`);

  console.log('--- Breakdown by Exam ---');
  console.table(examCounts);

  console.log('--- Breakdown by Ingestion State ---');
  console.table(stateCounts);

  console.log('--- Breakdown by Verification Status ---');
  console.table(statusCounts);

  // Pinecone Stats
  console.log('\n--- Pinecone Index Statistics ---');
  try {
    const stats = await (pineconeService as any).getIndex().describeIndexStats();
    console.log('Index fullness:', stats.indexFullness);
    console.log('Total vector count across all namespaces:', stats.totalRecordCount);
    console.log('Namespaces:');
    for (const [ns, info] of Object.entries(stats.namespaces || {})) {
      console.log(`  - "${ns}": ${(info as any)?.recordCount} vectors`);
    }
  } catch (err: any) {
    console.warn('Pinecone stats warning:', err.message);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
