import * as fs from 'fs';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

async function main() {
  const ai = createGoogleGenAIClient();
  const data = fs.readFileSync('d:/scholarly/dataset_staging/70th_13dec_p1.png').toString('base64');
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { inlineData: { mimeType: 'image/png', data } },
      'What are Question 1 and Question 2 on this page? State exact question text.',
    ],
  });
  console.log(res.text);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
