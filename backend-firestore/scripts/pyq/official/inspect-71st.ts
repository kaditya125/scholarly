import * as fs from 'fs';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

async function inspect71st() {
  const ai = createGoogleGenAIClient();

  const coverData = fs.readFileSync('d:/scholarly/dataset_staging/71st_cover.png').toString('base64');
  const p1Data = fs.readFileSync('d:/scholarly/dataset_staging/71st_p1.png').toString('base64');

  const resCover = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { inlineData: { mimeType: 'image/png', data: coverData } },
      'Read the cover page of this examination booklet. Report: 1) Full Examination Name / Advertisement No., 2) Booklet Series (A, B, C, or D), 3) Subject, 4) Total Questions and Time.',
    ],
  });

  console.log('=== 71st COVER PAGE ===\n' + resCover.text + '\n');

  const resP1 = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { inlineData: { mimeType: 'image/png', data: p1Data } },
      'Read Page 1. Report: 1) Questions visible (e.g. Q1, Q2...), 2) Exact question text of Question 1 and options in English, 3) Layout (language, columns).',
    ],
  });

  console.log('=== 71st PAGE 1 ===\n' + resP1.text + '\n');

  process.exit(0);
}

inspect71st().catch((err) => {
  console.error(err);
  process.exit(1);
});
