import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { PYQSourceEntry } from '../../../src/types/pyq.types';

const EXECUTE = process.argv.includes('--execute');
const STAGING_POOL_PATH = path.resolve('dataset_staging/ugc_net_paper1/ugc_net_paper1_all_extracted_pyqs.json');
const MANIFEST_PATH = path.resolve('dataset_staging/ugc_net_paper1/verified_paper1_manifest.json');

async function main() {
  console.log('--- Step 1: Batching pyq_source_registry ---');
  const manifest: any[] = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const rawQuestions: any[] = JSON.parse(fs.readFileSync(STAGING_POOL_PATH, 'utf-8'));

  if (EXECUTE) {
    const batch = db.batch();
    for (const p of manifest) {
      const sourceId = `src_${p.canonicalPaperId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const docRef = db.collection('pyq_source_registry').doc(sourceId);
      const sourceEntry: PYQSourceEntry = {
        sourceId,
        examId: 'UGC_NET',
        examName: 'University Grants Commission National Eligibility Test',
        year: p.year,
        session: p.session,
        paper: p.paper,
        subject: 'General Paper on Teaching & Research Aptitude',
        language: 'en',
        authority: p.authority || 'University Grants Commission (UGC) / CBSE',
        sourceTier: 'TIER_A_OFFICIAL',
        sourceName: p.sourceName,
        sourceUrl: p.sourceUrl,
        sourceDomain: 'ugcnetonline.in',
        documentType: 'QUESTION_PAPER',
        availabilityStatus: 'AVAILABLE',
        retrievalStatus: 'VERIFIED',
        rightsStatus: 'PUBLIC_DOMAIN_OR_CLEAR',
        artifactPath: p.localPath,
        documentHash: p.documentHash,
        documentSize: p.documentSize,
        mimeType: 'application/pdf',
        hasAnswerKey: false,
        hasSolutions: false,
        discoveredAt: p.retrievedAt,
        lastCheckedAt: Date.now(),
      };
      batch.set(docRef, sourceEntry, { merge: true });
    }
    await batch.commit();
    console.log(`✅ Registered ${manifest.length} sources.`);
  }

  console.log('--- Step 2: Batching pyq_questions ---');
  const BATCH_SIZE = 100;
  for (let i = 0; i < rawQuestions.length; i += BATCH_SIZE) {
    const chunk = rawQuestions.slice(i, i + BATCH_SIZE);
    if (EXECUTE) {
      const batch = db.batch();
      for (const q of chunk) {
        const qId = `ugc_net_p1_${q.year}_${q.session.toLowerCase()}_q${String(q.questionNumber).padStart(2, '0')}`;
        const docRef = db.collection('pyq_questions').doc(qId);
        batch.set(docRef, {
          questionId: qId,
          canonicalQuestionId: q.canonicalQuestionId,
          examId: 'UGC_NET',
          examName: 'University Grants Commission National Eligibility Test',
          subject: 'General Paper on Teaching & Research Aptitude',
          subjectCode: '00',
          year: q.year,
          session: q.session,
          paper: 'Paper I',
          unitNumber: q.unitNumber,
          unitCode: q.unitCode,
          unitName: q.unitName,
          text: q.text,
          options: q.options,
          correctOption: q.correctOption,
          marks: q.marks,
          negativeMarks: q.negativeMarks,
          isAuthenticPYQ: true,
          corpusBucket: 'OFFICIAL_PYQ',
          sourceTier: 'TIER_A_OFFICIAL',
          sourceName: q.sourceName,
          sourcePaperId: q.sourcePaperId,
          documentHash: q.documentHash,
          ingestedAt: q.ingestedAt,
          status: 'ACTIVE'
        }, { merge: true });
      }
      await batch.commit();
    }
    console.log(`  💾 Ingested ${Math.min(i + BATCH_SIZE, rawQuestions.length)}/${rawQuestions.length} questions`);
  }

  console.log('✅ ALL INGESTION COMPLETED SUCCESSFULLY.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
