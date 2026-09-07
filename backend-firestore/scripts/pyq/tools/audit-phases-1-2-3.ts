import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { db } from '../../../src/config/firebase';
import { pineconeService } from '../../../src/services/rag/pinecone.service';

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

async function runPhasesAudit() {
  console.log('================================================================');
  console.log('FORENSIC AUDIT: PHASES 1, 2, 3, 4 & 5');
  console.log('================================================================\n');

  // PHASE 1
  console.log('--- PHASE 1: Forensic Investigation of +3 Records Discrepancy ---');
  const allDocsSnap = await db.collection('pyq_questions').get();
  console.log(`Total records in pyq_questions: ${allDocsSnap.size}`);

  const unknownRecords: any[] = [];
  allDocsSnap.docs.forEach(d => {
    const data = d.data();
    if (!data.examId || data.examId === 'UNKNOWN_EXAM' || data.examId === 'UNKNOWN') {
      unknownRecords.push({ id: d.id, ...data });
    }
  });

  console.log(`Found ${unknownRecords.length} records without a standard examId.`);
  unknownRecords.forEach((r, idx) => {
    console.log(`[${idx + 1}] ID: ${r.id}`);
    console.log(`    Keys: ${Object.keys(r).join(', ')}`);
    console.log(`    retrievalTestedAt: ${r.retrievalTestedAt} (${r.retrievalTestedAt ? new Date(r.retrievalTestedAt).toISOString() : 'N/A'})`);
    console.log(`    ingestionState: ${r.ingestionState || 'UNDEFINED'}`);
  });

  // PHASE 2
  console.log('\n--- PHASE 2: Pinecone & Firestore Vector Reconciliation ---');
  const stats = await pineconeService.getIndexStats();
  console.log('Pinecone Stats:', JSON.stringify(stats, null, 2));

  let firestoreJeeIndexed = 0;
  let firestoreQuarantinedIndexed = 0;
  let firestoreOtherIndexed = 0;

  const jeeDocIds: string[] = [];

  allDocsSnap.docs.forEach(d => {
    const data = d.data();
    const isIndexed = data.vectorIndexed === true;
    if (data.examId === 'JEE_MAIN') {
      jeeDocIds.push(d.id);
      if (isIndexed) firestoreJeeIndexed++;
    } else if (data.ingestionState === 'QUARANTINED') {
      if (isIndexed) firestoreQuarantinedIndexed++;
    } else if (isIndexed) {
      firestoreOtherIndexed++;
    }
  });

  console.log(`Firestore Marked Indexed:`);
  console.log(`  - Active JEE_MAIN:        ${firestoreJeeIndexed}`);
  console.log(`  - Quarantined Records:    ${firestoreQuarantinedIndexed}`);
  console.log(`  - Other Records:          ${firestoreOtherIndexed}`);

  // Sample vector check in Pinecone
  const sampleJeeVectors = jeeDocIds.slice(0, 10).map(id => `vec_${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
  const fetchedJee = await pineconeService.fetchVectors(sampleJeeVectors, 'production');
  console.log(`Sample 10 JEE vectors fetched -> Found: ${Object.keys(fetchedJee).length}`);

  const quarantinedVectorFile = path.resolve(__dirname, 'quarantined_vector_ids.json');
  if (fs.existsSync(quarantinedVectorFile)) {
    const quarantinedIds: string[] = JSON.parse(fs.readFileSync(quarantinedVectorFile, 'utf-8'));
    const sampleQuarantined = quarantinedIds.slice(0, 20);
    const fetchedQuarantined = await pineconeService.fetchVectors(sampleQuarantined, 'production');
    console.log(`Sample 20 purged Quarantined vectors fetched -> Found: ${Object.keys(fetchedQuarantined).length} (Must be 0)`);
  }

  // PHASE 3
  console.log('\n--- PHASE 3: Verification of 11,035 JEE Main Shift Files & Duplicate Rate ---');
  const shiftsDir = path.resolve(__dirname, '../corpus/authentic/shifts');
  const shiftFiles = fs.readdirSync(shiftsDir).filter(f => f.endsWith('.json'));
  console.log(`Total shift JSON files in ${shiftsDir}: ${shiftFiles.length}`);

  let totalQuestionsInShifts = 0;
  const questionTextMap = new Map<string, Array<{ file: string; id: string; year: number }>>();

  for (const file of shiftFiles) {
    const filePath = path.join(shiftsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const qs = parsed.questions || [];
    totalQuestionsInShifts += qs.length;

    for (const q of qs) {
      const norm = normText(q.questionText || '');
      if (!questionTextMap.has(norm)) {
        questionTextMap.set(norm, []);
      }
      questionTextMap.get(norm)!.push({ file, id: q.sourceQuestionId, year: q.year });
    }
  }

  const uniqueNormTextsInShifts = questionTextMap.size;
  let shiftDuplicateGroups = 0;
  for (const [norm, occurrences] of questionTextMap.entries()) {
    if (occurrences.length > 1) {
      shiftDuplicateGroups++;
    }
  }

  const shiftDuplicateRate = ((totalQuestionsInShifts - uniqueNormTextsInShifts) / totalQuestionsInShifts) * 100;

  console.log(`Shift Files Question Statistics:`);
  console.log(`  Total Shift Files:                ${shiftFiles.length}`);
  console.log(`  Total Questions in Files:         ${totalQuestionsInShifts}`);
  console.log(`  Unique Normalized Questions:      ${uniqueNormTextsInShifts}`);
  console.log(`  Duplicate Groups:                 ${shiftDuplicateGroups}`);
  console.log(`  Total Repeated Occurrences:       ${totalQuestionsInShifts - uniqueNormTextsInShifts}`);
  console.log(`  Calculated Shift Duplicate Rate:  ${shiftDuplicateRate.toFixed(4)}%`);
  console.log(`  Firestore JEE_MAIN Count:         ${jeeDocIds.length}`);

  const sampleDocs = allDocsSnap.docs
    .filter(d => d.data().examId === 'JEE_MAIN')
    .slice(0, 500);

  let matchedWithShifts = 0;
  let missingInShifts = 0;
  for (const doc of sampleDocs) {
    const d = doc.data();
    const norm = normText(d.questionText || d.text || '');
    if (questionTextMap.has(norm)) {
      matchedWithShifts++;
    } else {
      missingInShifts++;
    }
  }
  console.log(`Sample of 500 Firestore JEE records tested against shift files:`);
  console.log(`  Matched in Authentic Shift JSONs: ${matchedWithShifts} / 500 (${((matchedWithShifts / 500) * 100).toFixed(1)}%)`);
  console.log(`  Not Matched in Shift JSONs:       ${missingInShifts} / 500`);

  process.exit(0);
}

runPhasesAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
