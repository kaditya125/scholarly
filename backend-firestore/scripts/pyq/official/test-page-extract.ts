import * as fs from 'fs';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

async function testPageWithAnswer() {
  const ai = createGoogleGenAIClient();
  const imgPath = 'd:/scholarly/dataset_staging/pages_68th/page_01.png';
  const data = fs.readFileSync(imgPath).toString('base64');

  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { inlineData: { mimeType: 'image/png', data } },
      `Extract all examination questions visible on this page.
For each question, provide:
1. "questionNumber": integer
2. "questionText": exact question stem in English
3. "options": array of 5 strings for options A, B, C, D, E (without the '(A)', '(B)' prefixes)
4. "correctAnswer": letter ("A", "B", "C", "D", or "E") according to the BPSC official key.
5. "subject": one of ["History", "Geography", "Indian Polity & Economy", "General Science", "Current Affairs", "General Mental Ability"]

Output ONLY valid JSON:
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

  const text = res.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    const list = JSON.parse(match[0]);
    console.log(`Extracted ${list.length} questions:`);
    console.log(JSON.stringify(list, null, 2));
  } else {
    console.log('No JSON match:\n', text);
  }

  process.exit(0);
}

testPageWithAnswer().catch((e) => {
  console.error(e);
  process.exit(1);
});
