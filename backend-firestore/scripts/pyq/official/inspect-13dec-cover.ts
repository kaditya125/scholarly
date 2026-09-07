import * as fs from 'fs';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

async function main() {
  const ai = createGoogleGenAIClient();
  const data = fs.readFileSync('d:/scholarly/dataset_staging/70th_13dec_cover.png').toString('base64');
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { inlineData: { mimeType: 'image/png', data } },
      'Report: 1) Examination title / Advt No., 2) Booklet Series letter, 3) Total questions.',
    ],
  });
  console.log(res.text);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
