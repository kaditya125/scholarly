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
3. "options": array of 5 strings for options A, B, C, D, E (without the '(A)', '(B)' prefixes)
4. "correctAnswer": letter ("A", "B", "C", "D", or "E") according to the BPSC official key.
5. "subject": one of ["History", "Geography", "Indian Polity & Economy", "General Science", "Current Affairs", "General Mental Ability"]

Output ONLY a valid JSON array:
[
  {
    "questionNumber": 1,
    "questionText": "...",
    "options": ["...", "...", "...", "...", "..."],
    "correctAnswer": "A",
    "subject": "Indian Polity & Economy"
  }
]`,
        ],
      });

      const res = await withTimeout(call, 25000, `Timeout 25s exceeded on ${path.basename(imgPath)}`);
      const text = res.text || '';
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw new Error('No valid JSON array in model response');
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`   Retry ${attempt}/${retries} for ${path.basename(imgPath)}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return [];
}

async function extractPaper(dirPath: string, outFile: string, paperName: string) {
  console.log(`\n═══════════════════════════════════════════════════════════════════════════════`);
  console.log(`📄 EXTRACTING ${paperName.toUpperCase()}`);
  console.log(`═══════════════════════════════════════════════════════════════════════════════`);

  const ai = createGoogleGenAIClient();
  const pageFiles = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.png'))
    .sort();

  console.log(`Found ${pageFiles.length} pages to process in ${dirPath}`);

  const allQuestions: ExtractedQuestion[] = [];
  const seenNumbers = new Set<number>();
  const CONCURRENCY = 4;

  for (let i = 0; i < pageFiles.length; i += CONCURRENCY) {
    const chunk = pageFiles.slice(i, i + CONCURRENCY);
    console.log(`   Processing pages ${i + 1} to ${Math.min(i + CONCURRENCY, pageFiles.length)} of ${pageFiles.length}...`);

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
  }

  allQuestions.sort((a, b) => a.questionNumber - b.questionNumber);

  console.log(`\n--- Extraction Summary for ${paperName} ---`);
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
  return allQuestions;
}

async function main() {
  const target = process.argv[2] || 'all';

  if (target === '68th' || target === 'all') {
    await extractPaper(
      'd:/scholarly/dataset_staging/pages_68th',
      'd:/scholarly/dataset_staging/bpsc_68th_extracted.json',
      'BPSC 68th CCE Prelims (2023 Set A)'
    );
  }

  if (target === '67th_re' || target === 'all') {
    await extractPaper(
      'd:/scholarly/dataset_staging/pages_67th_re',
      'd:/scholarly/dataset_staging/bpsc_67th_re_extracted.json',
      'BPSC 67th CCE Prelims Re-Exam (2022 Set B)'
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Extraction failed:', err);
  process.exit(1);
});
