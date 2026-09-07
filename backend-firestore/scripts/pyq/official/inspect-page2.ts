import * as fs from 'fs';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

async function main() {
  const ai = createGoogleGenAIClient();

  for (const name of ['68th_p2', '67th_Re_p2']) {
    const data = fs.readFileSync('d:/scholarly/dataset_staging/' + name + '.png').toString('base64');
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { inlineData: { mimeType: 'image/png', data } },
        'Is this page in Hindi or English? What question numbers are visible on it?',
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
