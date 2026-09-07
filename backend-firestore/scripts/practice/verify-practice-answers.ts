import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../src/config/firebase';
import { createGoogleGenAIClient } from '../../src/services/ai/googleGenAIClient';
import { PracticeBankQuestion } from '../../src/types/practiceBank.types';

interface VerificationResult {
  id: string;
  originalCorrectAnswerIndex: number;
  originalAnswerText: string;
  status: 'CORRECT' | 'WRONG_KEY' | 'OUTDATED' | 'AMBIGUOUS_OR_INVALID';
  verifiedCorrectIndex: number;
  reason: string;
}

const BATCH_SIZE = 25;

async function runVerification() {
  const isExecute = process.argv.includes('--execute');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  console.log('================================================================');
  console.log('🔍 PRACTICE BANK ANSWER VERIFICATION & AUDIT');
  console.log(`Mode: ${isExecute ? '🚨 LIVE MUTATION (--execute)' : '🔎 AUDIT & DRY-RUN'}`);
  if (limit) console.log(`Limit: ${limit} questions`);
  console.log('================================================================\n');

  console.log('Fetching questions from "practice_bank"...');
  const snap = await db.collection('practice_bank').get();
  let questions = snap.docs.map((d) => d.data() as PracticeBankQuestion);
  console.log(`Fetched ${questions.length} total questions from Firestore.`);

  if (limit) {
    questions = questions.slice(0, limit);
  }

  const ai = createGoogleGenAIClient();
  const cachePath = path.resolve(__dirname, 'data/verification_cache.json');
  let cache: Record<string, VerificationResult> = {};
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log(`Loaded ${Object.keys(cache).length} cached verification results.`);
    } catch (e) {
      console.warn('Failed to parse cache, starting fresh');
    }
  }

  const results: VerificationResult[] = [];
  const toVerify: PracticeBankQuestion[] = [];

  for (const q of questions) {
    if (cache[q.id]) {
      results.push(cache[q.id]);
    } else {
      toVerify.push(q);
    }
  }

  console.log(`Already verified: ${results.length}, Remaining to verify: ${toVerify.length}\n`);

  const saveCache = () => {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  };

  const totalBatches = Math.ceil(toVerify.length / BATCH_SIZE);

  for (let i = 0; i < toVerify.length; i += BATCH_SIZE) {
    const chunk = toVerify.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`Processing batch ${batchNum}/${totalBatches} (${chunk.length} questions)...`);

    const promptItems = chunk
      .map((q, idx) => {
        return (
          `Item ${idx + 1}:\n` +
          `ID: ${q.id}\n` +
          `Category: ${q.category}\n` +
          `Question: ${q.text}\n` +
          `Options:\n` +
          `[0] ${q.options[0]}\n` +
          `[1] ${q.options[1]}\n` +
          `[2] ${q.options[2]}\n` +
          `[3] ${q.options[3]}\n` +
          `Marked Answer Index: ${q.correctAnswerIndex} (which is: "${q.options[q.correctAnswerIndex]}")\n`
        );
      })
      .join('\n---\n');

    const prompt =
      `You are an expert fact-checker, exam author, and syllabus auditor for Indian Government Exams (UPSC, SSC, State PSC, Banking, Railways) and General Knowledge.\n` +
      `Analyze each of the following ${chunk.length} multiple-choice questions.\n\n` +
      `For each question:\n` +
      `1. Determine if the Marked Answer Index is factually and scientifically accurate.\n` +
      `2. Check if the question is time-sensitive / outdated (e.g. "Who is the current President/Prime Minister/Chief Justice/Governor?", sports tournaments, recent awards) where the correct answer might have changed over time.\n` +
      `3. Status must be one of:\n` +
      `   - "CORRECT": The marked answer is accurate.\n` +
      `   - "WRONG_KEY": The marked answer is wrong, but another option in [0, 1, 2, 3] is definitely correct. Provide verifiedCorrectIndex (0, 1, 2, or 3).\n` +
      `   - "OUTDATED": The question refers to a "current" officeholder or event and the marked answer is outdated today or was tied to a past period. Specify in reason.\n` +
      `   - "AMBIGUOUS_OR_INVALID": The question has multiple correct answers, no correct answer, or is factually nonsense.\n\n` +
      `Output your response STRICTLY as a JSON array of objects conforming to:\n` +
      `[\n` +
      `  {\n` +
      `    "id": string,\n` +
      `    "status": "CORRECT" | "WRONG_KEY" | "OUTDATED" | "AMBIGUOUS_OR_INVALID",\n` +
      `    "verifiedCorrectIndex": number,\n` +
      `    "reason": string\n` +
      `  }\n` +
      `]\n\n` +
      `Do not wrap in any commentary outside the JSON. Return only the valid JSON array.\n\n` +
      `Questions to evaluate:\n${promptItems}`;

    let success = false;
    let attempts = 0;
    while (!success && attempts < 6) {
      attempts++;
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        const rawText = response.text?.trim() || '[]';
        const parsed = JSON.parse(rawText) as any[];

        for (const item of parsed) {
          const q = chunk.find((c) => c.id === item.id);
          if (q) {
            const vRes: VerificationResult = {
              id: q.id,
              originalCorrectAnswerIndex: q.correctAnswerIndex,
              originalAnswerText: q.options[q.correctAnswerIndex],
              status: item.status,
              verifiedCorrectIndex:
                typeof item.verifiedCorrectIndex === 'number'
                  ? item.verifiedCorrectIndex
                  : q.correctAnswerIndex,
              reason: item.reason || '',
            };
            cache[q.id] = vRes;
            results.push(vRes);
          }
        }
        success = true;
        saveCache();
      } catch (err: any) {
        console.warn(`Batch failed on attempt ${attempts}: ${err.message || err}. Retrying in ${3000 * attempts}ms...`);
        await new Promise((r) => setTimeout(r, 3000 * attempts));
      }
    }

    if (!success) {
      console.error(`Failed to verify batch starting at ${chunk[0]?.id}`);
    }

    await new Promise((r) => setTimeout(r, 1200));
  }

  saveCache();

  console.log('\n================================================================');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('================================================================');
  const statusCounts: Record<string, number> = {
    CORRECT: 0,
    WRONG_KEY: 0,
    OUTDATED: 0,
    AMBIGUOUS_OR_INVALID: 0,
  };
  results.forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });
  console.table(statusCounts);

  const wrongKeys = results.filter((r) => r.status === 'WRONG_KEY');
  const outdated = results.filter((r) => r.status === 'OUTDATED');
  const invalid = results.filter((r) => r.status === 'AMBIGUOUS_OR_INVALID');

  console.log(`\nTotal Evaluated: ${results.length}`);
  console.log(
    `Correct Answers: ${statusCounts.CORRECT} (${((statusCounts.CORRECT / results.length) * 100).toFixed(1)}%)`
  );
  console.log(`Wrong Keys Fixed: ${wrongKeys.length}`);
  console.log(`Outdated / Time-Sensitive: ${outdated.length}`);
  console.log(`Ambiguous / Invalid: ${invalid.length}`);

  if (wrongKeys.length > 0) {
    console.log('\n--- SAMPLE WRONG KEYS DETECTED ---');
    wrongKeys.slice(0, 5).forEach((k) => {
      console.log(
        `ID: ${k.id} | Original: [${k.originalCorrectAnswerIndex}] "${k.originalAnswerText}" -> Verified: [${k.verifiedCorrectIndex}] | Reason: ${k.reason}`
      );
    });
  }

  if (outdated.length > 0) {
    console.log('\n--- SAMPLE OUTDATED QUESTIONS ---');
    outdated.slice(0, 5).forEach((k) => {
      console.log(`ID: ${k.id} | Answer: "${k.originalAnswerText}" | Reason: ${k.reason}`);
    });
  }

  if (isExecute) {
    console.log('\n================================================================');
    console.log('🚨 APPLYING VERIFIED UPDATES TO FIRESTORE "practice_bank"');
    console.log('================================================================');

    let updatedCount = 0;
    const batchSize = 400;
    let batch = db.batch();
    let inBatch = 0;

    for (const r of results) {
      const ref = db.collection('practice_bank').doc(r.id);
      const updates: Record<string, any> = {
        verificationStatus: r.status,
        verificationReason: r.reason,
        verifiedAt: Date.now(),
      };

      if (r.status === 'WRONG_KEY' && r.verifiedCorrectIndex >= 0 && r.verifiedCorrectIndex <= 3) {
        updates.correctAnswerIndex = r.verifiedCorrectIndex;
        updates.originalCorrectAnswerIndex = r.originalCorrectAnswerIndex;
        updates.keyCorrected = true;
      }

      const flagsToAdd: string[] = [];
      if (r.status === 'OUTDATED') flagsToAdd.push('outdated_answer');
      if (r.status === 'AMBIGUOUS_OR_INVALID') flagsToAdd.push('ambiguous_or_invalid');

      if (flagsToAdd.length > 0) {
        const admin = require('firebase-admin');
        updates.reviewFlags = admin.firestore.FieldValue.arrayUnion(...flagsToAdd);
      }

      batch.update(ref, updates);
      inBatch++;
      updatedCount++;

      if (inBatch >= batchSize) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
        console.log(`Committed ${updatedCount}/${results.length} updates...`);
      }
    }

    if (inBatch > 0) {
      await batch.commit();
    }

    console.log(`✅ Updated ${updatedCount} practice bank documents in Firestore with verification data.`);
  } else {
    console.log('\nDry run complete. Pass --execute to write verification results & corrected keys to Firestore.');
  }

  process.exit(0);
}

runVerification().catch((err) => {
  console.error('Verification script failed:', err);
  process.exit(1);
});

