/**
 * Re-read pages whose first reading could not be parsed, this time with an enforced response schema,
 * so the API itself guarantees the JSON shape (and its escaping). Same copyist prompt, same models.
 *   node tsx reread-failed.ts --model=gemini-2.5-flash
 */
import * as fs from 'fs';
import * as path from 'path';
import { Type } from '@google/genai';
import { createGoogleGenAIClient } from '../../../../src/services/ai/googleGenAIClient';

const OUT = process.env.GATE_OUT || path.resolve(__dirname, '..', 'out', 'gate-cs');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true']; }));
const MODEL = String(args.model || 'gemini-2.5-flash');
const PROMPT = fs.readFileSync(path.join(__dirname, 'transcribe-all.ts'), 'utf8').match(/const PROMPT = `([\s\S]*?)`;/)![1].replace(/\`/g, '`');

const STR = { type: Type.STRING };
const BOX = { type: Type.ARRAY, items: { type: Type.INTEGER } };
const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    header: { type: Type.STRING, nullable: true },
    footer: { type: Type.STRING, nullable: true },
    sectionNotes: { type: Type.ARRAY, items: STR },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          number: { type: Type.INTEGER, nullable: true },
          isContinuation: { type: Type.BOOLEAN },
          continuesOnNextPage: { type: Type.BOOLEAN },
          commonDataOrLinked: { type: Type.STRING, nullable: true },
          stem: STR,
          options: { type: Type.OBJECT, nullable: true, properties: { A: STR, B: STR, C: STR, D: STR } },
          hasAnswerBlank: { type: Type.BOOLEAN },
          box_2d: BOX,
          figures: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { role: STR, box_2d: BOX }, required: ['role', 'box_2d'] } },
          unreadable: { type: Type.BOOLEAN },
        },
        required: ['number', 'isContinuation', 'continuesOnNextPage', 'stem', 'hasAnswerBlank', 'box_2d', 'figures', 'unreadable'],
      },
    },
  },
  required: ['header', 'footer', 'sectionNotes', 'questions'],
};

async function main() {
  const ai = createGoogleGenAIClient();
  const files = fs.readdirSync(path.join(OUT, 'transcripts', MODEL)).flatMap((k) =>
    fs.readdirSync(path.join(OUT, 'transcripts', MODEL, k)).map((p) => path.join(OUT, 'transcripts', MODEL, k, p)));
  let fixed = 0, still = 0;
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const ok = d.result && !Array.isArray(d.result) || (Array.isArray(d.result) && d.result.length === 1 && typeof d.result[0] === 'object');
    if (ok) continue;
    const img = fs.readFileSync(path.join(OUT, 'pages', d.key, `p${String(d.page).padStart(3, '0')}.jpg`)).toString('base64');
    const t = Date.now();
    const res: any = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: img } }, { text: PROMPT }] }],
      config: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA as any, maxOutputTokens: 32768,
        ...(/pro/.test(MODEL) ? { thinkingConfig: { thinkingBudget: 2048 } } : {}) },
    });
    let result: any = null;
    try { result = JSON.parse(res.text ?? ''); } catch { result = null; }
    fs.writeFileSync(f, JSON.stringify({ ...d, ms: Date.now() - t, finish: res.candidates?.[0]?.finish, usage: res.usageMetadata, result, raw: result ? undefined : res.text, reread: 'responseSchema' }, null, 1));
    if (result) fixed++; else still++;
    console.log(`${d.key} p${d.page}: ${result ? 'fixed' : 'STILL UNPARSEABLE'}`);
  }
  console.log(`re-read done: fixed ${fixed}, still failing ${still}`);
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e?.message || e); process.exit(1); });
