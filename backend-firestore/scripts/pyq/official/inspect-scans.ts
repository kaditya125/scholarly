import * as fs from 'fs';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

async function main() {
  const ai = createGoogleGenAIClient();

  for (const name of ['68th_cover', '67th_Re_cover']) {
    const imgPath = `d:/scholarly/dataset_staging/${name}.png`;
    const imageBytes = fs.readFileSync(imgPath).toString('base64');

    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: imageBytes,
          },
        },
        'Read this examination cover page carefully. State: 1) Exact Exam Title, 2) Booklet Series letter (A, B, C, or D), 3) Subject name, 4) Total number of questions and time/marks if mentioned.',
      ],
    });

    console.log(`\n================== ${name} ==================`);
    console.log(res.text);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
