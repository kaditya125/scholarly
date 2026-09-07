import * as fs from 'fs';
import * as path from 'path';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

interface ExtractedQuestion {
  questionNumber: number;
  questionText: string;
  options: string[];
  correctAnswer: string;
  subject: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
}

async function extractPage(
  ai: ReturnType<typeof createGoogleGenAIClient>,
  imgPath: string,
  retries = 3
): Promise<ExtractedQuestion[]> {
  const data = fs.readFileSync(imgPath).toString('base64');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const call = ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { inlineData: { mimeType: 'image/png', data } },
          `Extract all examination questions visible on this page.
For each question:
1. "questionNumber": integer (e.g. 1, 2, ...)
2. "questionText": exact question stem in English
3. "options": array of 4 strings for options A, B, C, D (without the '(A)', '(B)' prefixes)
4. "correctAnswer": letter ("A", "B", "C", or "D") according to BPSC official key.
5. "subject": one of ["History", "Geography", "Indian Polity & Economy", "General Science", "Current Affairs", "General Mental Ability"]

Output ONLY a valid JSON array:
[
  {
    "questionNumber": 1,
    "questionText": "...",
    "options": ["...", "...", "...", "..."],
    "correctAnswer": "A",
    "subject": "General Science"
  }
]`,
        ],
      });

      const res = await withTimeout(call, 45000, `Timeout 45s on ${path.basename(imgPath)}`);
      const text = res.text || '';
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw new Error('No valid JSON array in model response');
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`   Retry ${attempt}/${retries} for ${path.basename(imgPath)}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  return [];
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('📄 EXTRACTING BPSC 70TH CCE PRELIMS MAIN EXAM (13 DEC 2024, SERIES E)');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const dirPath = 'd:/scholarly/dataset_staging/pages_70th_dec13';
  const outFile = 'd:/scholarly/dataset_staging/bpsc_70th_dec13_extracted.json';
  const ai = createGoogleGenAIClient();

  const allQuestions: ExtractedQuestion[] = fs.existsSync(outFile)
    ? JSON.parse(fs.readFileSync(outFile, 'utf8'))
    : [];

  const seenNumbers = new Set<number>(allQuestions.map((q) => q.questionNumber));
  console.log(`Resuming with ${allQuestions.length} previously extracted questions (seen up to Q${Math.max(0, ...seenNumbers)})`);

  const pageFiles = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.png'))
    .sort();

  // Pages 1-12 (page_01.png to page_23.png) already produced questions 1 to 69
  // Filter only pageFiles that need processing
  const remainingFiles = pageFiles.filter((pFile, idx) => {
    // If idx < 12, we already have questions 1 to 69
    return idx >= 12;
  });

  console.log(`Remaining pages to process: ${remainingFiles.length} (out of ${pageFiles.length})\n`);

  const CONCURRENCY = 2;

  for (let i = 0; i < remainingFiles.length; i += CONCURRENCY) {
    const chunk = remainingFiles.slice(i, i + CONCURRENCY);
    console.log(`   Processing pages ${i + 1} to ${Math.min(i + CONCURRENCY, remainingFiles.length)} of ${remainingFiles.length}...`);

    const results = await Promise.all(
      chunk.map(async (pFile) => {
        const fullPath = path.join(dirPath, pFile);
        try {
          const qs = await extractPage(ai, fullPath);
          return { pFile, qs, error: null };
        } catch (err: any) {
          return { pFile, qs: [], error: err.message };
        }
      })
    );

    for (const r of results) {
      if (r.error) {
        console.warn(`      ❌ ${r.pFile} failed: ${r.error}`);
      } else {
        let added = 0;
        for (const q of r.qs) {
          if (!seenNumbers.has(q.questionNumber)) {
            seenNumbers.add(q.questionNumber);
            allQuestions.push(q);
            added++;
          }
        }
        console.log(`      ✅ ${r.pFile}: extracted ${added} questions`);
      }
    }

    console.log(`   -> Current Running Total: ${allQuestions.length} / 150 questions`);
    fs.writeFileSync(outFile, JSON.stringify(allQuestions, null, 2), 'utf8');

    // Smooth delay between chunks
    await new Promise((r) => setTimeout(r, 1500));
  }

  allQuestions.sort((a, b) => a.questionNumber - b.questionNumber);

  console.log(`\n--- Extraction Summary for 70th Dec 13 Prelims ---`);
  console.log(`Total Extracted: ${allQuestions.length} questions`);

  const missing: number[] = [];
  for (let i = 1; i <= 150; i++) {
    if (!seenNumbers.has(i)) missing.push(i);
  }
  if (missing.length > 0) {
    console.warn(`⚠️ Missing question numbers (${missing.length}):`, missing);
  } else {
    console.log(`🎉 100% complete! All questions 1 to 150 captured.`);
  }

  fs.writeFileSync(outFile, JSON.stringify(allQuestions, null, 2), 'utf8');
  console.log(`Saved output to ${outFile}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
