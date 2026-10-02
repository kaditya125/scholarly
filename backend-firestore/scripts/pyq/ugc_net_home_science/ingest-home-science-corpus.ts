import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { PYQSourceEntry } from '../../../src/types/pyq.types';

const EXECUTE = process.argv.includes('--execute');
const STAGING_POOL_PATH = path.resolve('dataset_staging/ugc_net_home_science/ugc_net_home_science_all_extracted_pyqs.json');
const MANIFEST_PATH = path.resolve('dataset_staging/ugc_net_home_science/verified_home_science_manifest.json');

async function main() {
  console.log('--- Step 1: Ingesting Home Science Sources into pyq_source_registry ---');
  const rawManifest: any[] = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const uniqueManifestMap: Record<string, any> = {};
  for (const m of rawManifest) {
    if (!uniqueManifestMap[m.canonicalPaperId]) {
      uniqueManifestMap[m.canonicalPaperId] = m;
    }
  }
  const manifest = Object.values(uniqueManifestMap);
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
        subject: 'Home Science',
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
    console.log(`✅ Registered ${manifest.length} sources in pyq_source_registry.`);
  }

  console.log('--- Step 2: Batching pyq_questions for Home Science (14) ---');
  const BATCH_SIZE = 100;
  for (let i = 0; i < rawQuestions.length; i += BATCH_SIZE) {
    const chunk = rawQuestions.slice(i, i + BATCH_SIZE);
    if (EXECUTE) {
      const batch = db.batch();
      for (const q of chunk) {
        const cleanPaper = q.paper.replace(' ', '_').toLowerCase();
        const qId = `ugc_net_home_science_12_${q.year}_${q.session.toLowerCase()}_${cleanPaper}_q${String(q.questionNumber).padStart(2, '0')}`;
        const docRef = db.collection('pyq_questions').doc(qId);
        batch.set(docRef, {
          questionId: qId,
          canonicalQuestionId: q.canonicalQuestionId,
          examId: 'UGC_NET',
          examName: 'University Grants Commission National Eligibility Test',
          subject: 'Home Science',
          subjectCode: '12',
          year: q.year,
          session: q.session,
          paper: q.paper,
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

  console.log('✅ ALL PUBLIC ADMINISTRATION INGESTION COMPLETED SUCCESSFULLY.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
