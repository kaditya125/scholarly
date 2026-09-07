import * as fs from 'fs';
import * as path from 'path';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

async function main() {
  const ai = createGoogleGenAIClient();
  const imgPath = 'd:/scholarly/dataset_staging/pages_70th_dec13/page_31.png';
  console.log('Reading:', imgPath);
  const data = fs.readFileSync(imgPath).toString('base64');
  
  console.log('Invoking Gemini 2.5 Flash on page_31.png...');
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { inlineData: { mimeType: 'image/png', data } },
      `Extract all examination questions visible on this page.
For each question:
1. "questionNumber": integer (e.g. 88, 89, 90, 91, 92)
2. "questionText": exact question stem in English
3. "options": array of 4 strings for options A, B, C, D (without the '(A)', '(B)' prefixes)
4. "correctAnswer": letter ("A", "B", "C", or "D")
5. "subject": one of ["History", "Geography", "Indian Polity & Economy", "General Science", "Current Affairs", "General Mental Ability"]

Output ONLY a valid JSON array:
[
  {
    "questionNumber": 88,
    "questionText": "...",
    "options": ["...", "...", "...", "..."],
    "correctAnswer": "A",
    "subject": "History"
  }
]`
    ]
  });

  const text = res.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    console.error('No JSON found:', text);
    process.exit(1);
  }

  const parsed = JSON.parse(match[0]);
  console.log('Extracted', parsed.length, 'questions:');
  console.log(JSON.stringify(parsed, null, 2));

  // Merge into d:/scholarly/dataset_staging/bpsc_70th_dec13_extracted.json
  const existingPath = 'd:/scholarly/dataset_staging/bpsc_70th_dec13_extracted.json';
  const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
  const mergedMap = new Map<number, any>();
  for (const q of existing) {
    mergedMap.set(q.questionNumber, q);
  }
  for (const q of parsed) {
    mergedMap.set(q.questionNumber, q);
  }

  const merged = Array.from(mergedMap.values()).sort((a, b) => a.questionNumber - b.questionNumber);
  fs.writeFileSync(existingPath, JSON.stringify(merged, null, 2), 'utf8');
  console.log('Saved! Total in file now:', merged.length);
}

main().catch(console.error);
