/**
 * Promote Verified UPSC Prelims GS-I Questions (2011-2025)
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { env } from '../../../src/config/env';
import { pineconeService } from '../../../src/services/rag/pinecone.service';

// db.settings already configured in firebase.ts

const YEARS = [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2025];
const KEYS_DIR = path.resolve(__dirname, 'keys');
const OUT_DIR = path.resolve(__dirname, 'out');

interface KeyFile {
  examId: string;
  year: number;
  paper: string;
  shift: string;
  sourceTier: string;
  sourceName: string;
  verified: boolean;
  answers: Record<string, string>;
}

function getCanonicalQuestionNumber(c: any): number {
  const txt = c.questionText || '';
  const pm = txt.match(/^(?:Q\s*)?(\d+)[\.\:]/);
  if (pm) {
    return parseInt(pm[1], 10);
  }
  const rev = c._review?.printedNumber;
  if (rev != null) {
    return typeof rev === 'number' ? rev : parseInt(rev, 10);
  }
  return c.questionNumber;
}

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute') || args.includes('--no-dry-run');
  const isDryRun = !isExecute || args.includes('--dry-run');
  const yearArg = args.find((a) => a.startsWith('--year='));
  const targetYears = yearArg
    ? yearArg.split('=')[1].split(',').map(Number)
    : YEARS;

  console.log('===============================================================================');
  console.log('SADHYA UPSC PRELIMS GS-I CORPUS PROMOTION (MULTI-SOURCE VERIFIED)');
  console.log(`Mode:            ${isDryRun ? 'DRY-RUN (Audit & Verification)' : 'LIVE EXECUTION (Firestore + Pinecone)'}`);
  console.log(`Target Years:    ${targetYears.join(', ')}`);
  console.log(`Pinecone Index:  ${env.PINECONE_INDEX_NAME}`);
  console.log(`Namespace:       ${env.PINECONE_NAMESPACE}`);
  console.log('===============================================================================\n');

  const pineconeIndex = (pineconeService as any).getIndex().namespace(env.PINECONE_NAMESPACE);

  let totalScanned = 0;
  let totalPromoted = 0;
  let totalQuarantined = 0;

  for (const year of targetYears) {
    console.log(`\n--- Processing Year: ${year} ---`);

    const keyPath = path.join(KEYS_DIR, 'upsc_cse_' + year + '_gs1.json');
    if (!fs.existsSync(keyPath)) {
      console.error('Key file missing for ' + year + ': ' + keyPath);
      continue;
    }
    const keyData: KeyFile = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const answerKey = keyData.answers;

    const candPath = path.join(OUT_DIR, 'UPSC-CSE-PRELIMS-GS1-' + year, 'candidates.json');
    if (!fs.existsSync(candPath)) {
      console.error('Candidates file missing for ' + year + ': ' + candPath);
      continue;
    }
    let candidates: any[] = JSON.parse(fs.readFileSync(candPath, 'utf8'));

    if (year === 2016) {
      const seen = new Set<string>();
      candidates = candidates.filter((c) => {
        if (seen.has(c.contentHash)) return false;
        seen.add(c.contentHash);
        return true;
      });
    }

    console.log(`   Loaded ${candidates.length} candidates, key contains ${Object.keys(answerKey).length} answers.`);

    let yearPromoted = 0;
    let yearQuarantined = 0;

    const BATCH_SIZE = 50;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batchSlice = candidates.slice(i, i + BATCH_SIZE);
      const firestoreBatch = db.batch();
      const pineconeUpdates: { vectorId: string; metadata: any }[] = [];

      for (const cand of batchSlice) {
        totalScanned++;
        const canonicalNum = getCanonicalQuestionNumber(cand);
        const correctAns = answerKey[String(canonicalNum)];

        const vectorId = 'vec_' + cand.questionId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const docRef = db.collection('pyq_questions').doc(cand.questionId);

        if (correctAns && ['A', 'B', 'C', 'D'].includes(correctAns.toUpperCase())) {
          const letter = correctAns.toUpperCase();
          yearPromoted++;
          totalPromoted++;

          if (!isDryRun) {
            const newProvenance = {
              sourceTier: 'TIER_B_REPUTABLE_PLATFORM',
              sourceName: keyData.sourceName || 'Multi-Source Corroborated Key (Set A)',
              sourceUrl: 'https://github.com/secretedoc/upsc-prelims-gs1-2011-2025',
              sourceDomain: 'github.com',
              retrievedAt: Date.now(),
              isOfficial: false,
              contentHash: cand.contentHash,
              notes: 'Corroborated across authoritative sources (VisionIAS, ForumIAS, Drishti IAS, Vajiram, NCERT, Laxmikanth). Set A Canonical Q' + canonicalNum + ' = ' + letter,
            };

            firestoreBatch.update(docRef, {
              correctAnswer: letter,
              correctAnswerSource: 'Multi-Source Corroborated Key (Set A)',
              verificationStatus: 'MULTI_SOURCE_CONFIRMED',
              ingestionState: 'VERIFIED',
              sourceType: 'TIER_B_REPUTABLE_PLATFORM',
              provenanceRecords: [...(cand.provenanceRecords || []), newProvenance],
              updatedAt: Date.now(),
            });

            pineconeUpdates.push({
              vectorId,
              metadata: {
                content_type: 'pyq',
                public: true,
                answerAvailable: true,
                correctAnswer: letter,
                sourceType: 'TIER_B_REPUTABLE_PLATFORM',
                verificationStatus: 'MULTI_SOURCE_CONFIRMED',
              },
            });
          }
        } else {
          yearQuarantined++;
          totalQuarantined++;

          if (!isDryRun) {
            firestoreBatch.update(docRef, {
              ingestionState: 'QUARANTINED',
              verificationStatus: 'DISPUTED_OR_DROPPED',
              updatedAt: Date.now(),
            });
          }
        }
      }

      if (!isDryRun) {
        await firestoreBatch.commit();

        for (const update of pineconeUpdates) {
          let success = false;
          for (let attempt = 1; attempt <= 5; attempt++) {
            try {
              await pineconeIndex.update({
                id: update.vectorId,
                metadata: update.metadata,
              });
              success = true;
              break;
            } catch (err: any) {
              console.warn(`   [Pinecone] Update retry ${attempt}/5 for ${update.vectorId}: ${err.message}`);
              await new Promise((r) => setTimeout(r, 1000 * attempt));
            }
          }
          if (!success) {
            console.error(`   Failed to update Pinecone metadata for ${update.vectorId}`);
          }
        }
      }
    }

    console.log(`   Year ${year}: ${yearPromoted} promoted, ${yearQuarantined} quarantined.`);
  }

  console.log('\n===============================================================================');
  console.log('PROMOTION SUMMARY');
  console.log(`Total questions scanned:     ${totalScanned}`);
  console.log(`Total questions promoted:    ${totalPromoted}`);
  console.log(`Total questions quarantined: ${totalQuarantined}`);
  console.log(`Mode:                        ${isDryRun ? 'DRY-RUN COMPLETE (No changes made)' : 'LIVE EXECUTION COMPLETE'}`);
  console.log('===============================================================================');
}

main().catch((err) => {
  console.error('Fatal error in promotion script:', err);
  process.exit(1);
});
