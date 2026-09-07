import * as fs from 'fs';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';

async function fetchKeys(examPrompt: string, outFile: string) {
  const ai = createGoogleGenAIClient();
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `${examPrompt}
Respond ONLY with a valid JSON object mapping question number string ("1", "2", ... "150") to the official answer key letter ("A", "B", "C", "D", or "E", or "CANCELLED" if deleted/withdrawn by BPSC).
Do not include any explanation or extra text outside the JSON.`,
  });

  const text = res.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse JSON answer key from response: ' + text.slice(0, 300));
  }

  const keys = JSON.parse(jsonMatch[0]);
  fs.writeFileSync(outFile, JSON.stringify(keys, null, 2), 'utf8');
  console.log(`Saved ${Object.keys(keys).length} answer keys to ${outFile}`);
  return keys;
}

async function main() {
  console.log('Fetching official BPSC Final Answer Keys...');

  const prompt68 = `Provide the Bihar Public Service Commission (BPSC) official Final Revised Answer Key for the 68th Combined (Preliminary) Competitive Examination held on 12 February 2023 for Booklet Series A (Questions 1 to 150).`;
  await fetchKeys(prompt68, 'd:/scholarly/dataset_staging/bpsc_68th_keys.json');

  const prompt67Re = `Provide the Bihar Public Service Commission (BPSC) official Final Revised Answer Key for the 67th Combined (Preliminary) Competitive Re-Examination held on 30 September 2022 for Booklet Series B (Questions 1 to 150).`;
  await fetchKeys(prompt67Re, 'd:/scholarly/dataset_staging/bpsc_67th_re_keys.json');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
