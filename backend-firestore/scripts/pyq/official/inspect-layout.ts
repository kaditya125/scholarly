import * as fs from 'fs';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

async function main() {
  const ai = createGoogleGenAIClient();

  for (const name of ['68th_p1', '67th_Re_p1']) {
    const data = fs.readFileSync('d:/scholarly/dataset_staging/' + name + '.png').toString('base64');
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { inlineData: { mimeType: 'image/png', data } },
        'Describe the page layout: Is it two columns (Hindi left, English right), or something else? List the question numbers on this page and the exact English text and options of Question 1.',
      ],
    });
    console.log(`\n=== ${name} ===\n${res.text}\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
