import * as fs from 'fs';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

async function main() {
  const ai = createGoogleGenAIClient();

  for (const p of [1, 2, 3, 4]) {
    const data = fs.readFileSync(`d:/scholarly/dataset_staging/70th_dec13_p${p}.png`).toString('base64');
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { inlineData: { mimeType: 'image/png', data } },
        'Report: 1) Language of this page (Hindi, English, or bilingual side-by-side?), 2) Question numbers visible on this page.',
      ],
    });
    console.log(`=== Page ${p} ===\n${res.text}\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
