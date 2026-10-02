/**
 * Read the official answer-key tables that exist only as images inside the archive papers
 * (GATE 2019 pp.17-19, GATE 2021 CS1 pp.41-43, GATE 2021 CS2 pp.44-46), with two different models.
 *
 *   npx tsx scripts/pyq/official/gate-cs/read-key-images.ts --model=gemini-2.5-flash
 *   npx tsx scripts/pyq/official/gate-cs/read-key-images.ts --model=gemini-2.5-pro
 *
 * Each reading is a verbatim transcription of the table (no inference): build-image-keys.py only accepts a
 * row when both models read it identically and the whole key passes the same gates as the text keys.
 * Output: out/gate-cs/keyreads/<model>/<fileKey>/pNNN.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { Type } from '@google/genai';
import { createGoogleGenAIClient } from '../../../../src/services/ai/googleGenAIClient';

const OUT = process.env.GATE_OUT || path.resolve(__dirname, '..', 'out', 'gate-cs');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true']; }));
const MODEL = String(args.model || 'gemini-2.5-flash');
const TARGETS: Record<string, number[]> = { CS2019: [17, 18, 19], CS1_2021: [41, 42, 43], CS2_2021: [44, 45, 46] };

const PROMPT = `This page image is part of an OFFICIAL answer key table from an exam paper. Transcribe the table exactly as printed.
Rules:
- Copy every table row on this page, top to bottom, including rows cut at the page edge (mark those cutOff=true).
- Copy each cell verbatim: do not solve, correct, normalise or infer anything. Keep the printed separators and words
  exactly (e.g. "A;C", "0.5 to 0.6", "13.3 to 13.3 OR 13.5 to 13.5", "MTA", "Marks to All", "1/3").
- A cell that is empty is "". A character you cannot read is [?]. Never guess.
- highlighted = true when the row is visibly shaded/coloured differently from the ordinary rows (describe the colour in highlightColour).
- headerCells: the column headings verbatim, left to right. title: the heading printed above the table, verbatim, or null.
- notes: any legend, footnote or remark printed on the page, verbatim.`;

const S = { type: Type.STRING };
const SN = { type: Type.STRING, nullable: true };
const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: SN,
    headerCells: { type: Type.ARRAY, items: S },
    notes: { type: Type.ARRAY, items: S },
    rows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          qNo: S, session: SN, questionType: SN, section: SN, key: S, marks: SN, negativeMarks: SN,
          highlighted: { type: Type.BOOLEAN }, highlightColour: SN, cutOff: { type: Type.BOOLEAN },
        },
        required: ['qNo', 'session', 'questionType', 'section', 'key', 'marks', 'negativeMarks', 'highlighted', 'highlightColour', 'cutOff'],
      },
    },
  },
  required: ['title', 'headerCells', 'notes', 'rows'],
};

async function main() {
  const ai = createGoogleGenAIClient();
  for (const [key, pages] of Object.entries(TARGETS)) {
    for (const p of pages) {
      const pageId = `p${String(p).padStart(3, '0')}`;
      const outFile = path.join(OUT, 'keyreads', MODEL, key, `${pageId}.json`);
      if (fs.existsSync(outFile) && JSON.parse(fs.readFileSync(outFile, 'utf8')).result) { console.log(`${key} ${pageId}: already read`); continue; }
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      const img = fs.readFileSync(path.join(OUT, 'keypages', key, `${pageId}.png`)).toString('base64');
      for (let attempt = 1; attempt <= 4; attempt++) {
        const t = Date.now();
        try {
          const res: any = await ai.models.generateContent({
            model: MODEL,
            contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: img } }, { text: PROMPT }] }],
            config: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA as any, maxOutputTokens: 32768,
              ...(/pro/.test(MODEL) ? { thinkingConfig: { thinkingBudget: 2048 } } : {}) },
          });
          let result: any = null;
          try { result = JSON.parse(res.text ?? ''); } catch { result = null; }
          fs.writeFileSync(outFile, JSON.stringify({ key, page: p, model: MODEL, ms: Date.now() - t, finish: res.candidates?.[0]?.finishReason,
            usage: res.usageMetadata, result, raw: result ? undefined : res.text }, null, 1));
          console.log(`${key} ${pageId}: ${result ? `${result.rows.length} rows` : 'UNPARSEABLE'} (${Date.now() - t} ms)`);
          if (result) break;
        } catch (e: any) {
          console.log(`${key} ${pageId}: attempt ${attempt} failed: ${String(e?.message || e).slice(0, 160)}`);
          await new Promise((r) => setTimeout(r, /429|RESOURCE_EXHAUSTED/.test(String(e?.message)) ? 30000 : 5000));
        }
      }
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e?.message || e); process.exit(1); });
