import * as fs from 'fs';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

async function fixMissing() {
  const ai = createGoogleGenAIClient();
  const imgPath = 'd:/scholarly/dataset_staging/pages_67th_re/page_41.png';
  const data = fs.readFileSync(imgPath).toString('base64');

  console.log('Extracting missing questions from page_41.png with 60s timeout...');

  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { inlineData: { mimeType: 'image/png', data } },
      `Extract all examination questions visible on this page.
For each question:
1. "questionNumber": integer (e.g. 136, 137, ...)
2. "questionText": exact question stem in English
3. "options": array of 5 strings for options A, B, C, D, E (without the '(A)', '(B)' prefixes)
4. "correctAnswer": letter ("A", "B", "C", "D", or "E") according to the BPSC official key.
5. "subject": one of ["History", "Geography", "Indian Polity & Economy", "General Science", "Current Affairs", "General Mental Ability"]

Output ONLY a valid JSON array:
[
  {
    "questionNumber": 136,
    "questionText": "...",
    "options": ["...", "...", "...", "...", "..."],
    "correctAnswer": "A",
    "subject": "History"
  }
]`,
    ],
  });

  const text = res.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error('No valid JSON array in model response: ' + text);
  }

  const missingQs = JSON.parse(match[0]);
  console.log(`Extracted ${missingQs.length} missing questions from page 41!`);

  const mainFile = 'd:/scholarly/dataset_staging/bpsc_67th_re_extracted.json';
  const existingQs = JSON.parse(fs.readFileSync(mainFile, 'utf8'));

  const seen = new Set(existingQs.map((q: any) => q.questionNumber));
  for (const q of missingQs) {
    if (!seen.has(q.questionNumber)) {
      existingQs.push(q);
      seen.add(q.questionNumber);
    }
  }

  existingQs.sort((a: any, b: any) => a.questionNumber - b.questionNumber);

  console.log(`Total 67th Re-Exam questions now: ${existingQs.length} / 150`);
  fs.writeFileSync(mainFile, JSON.stringify(existingQs, null, 2), 'utf8');

  // Verify completeness
  const missing: number[] = [];
  for (let i = 1; i <= 150; i++) {
    if (!seen.has(i)) missing.push(i);
  }
  if (missing.length === 0) {
    console.log('🎉 100% COMPLETE! All 150 questions verified for 67th Re-Exam!');
  } else {
    console.warn('Still missing:', missing);
  }

  process.exit(0);
}

fixMissing().catch((err) => {
  console.error(err);
  process.exit(1);
});
