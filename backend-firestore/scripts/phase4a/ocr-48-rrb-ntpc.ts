/**
 * OCR the RRB NTPC syllabus out of the scanned CEN.
 *
 * The official Detailed CEN 07/2025 has no text layer — 0 characters across 56 pages — so
 * pdf-parse yields nothing and the standard ingestion path cannot see it. The pages are perfectly
 * legible though, and paragraph 13 carries a real topic-wise syllabus for both CBT stages.
 *
 * Gemini reads the PDF pages as images, so no rasterisation step is needed. The prompt is written
 * to forbid prior knowledge: RRB NTPC is an exam the model has seen many times, and the failure
 * mode to guard against is a plausible remembered syllabus rather than the one actually printed.
 *
 * Output is TEXT ONLY, written to disk for inspection. Nothing is persisted to Firestore here —
 * transcription and ingestion stay separate so the transcription can be read by a human first.
 *
 *   npx tsx scripts/phase4a/ocr-48-rrb-ntpc.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { PDFDocument } from 'pdf-lib';
import { GoogleGenAI } from '@google/genai';
import { env } from '../../src/config/env';
import { certificateAuthorities } from '../../src/services/exam/trust';

const URL = 'https://rrb.indianrailways.gov.in/-/image/1762325939510Detailed_CEN_07_2025_NTPC_Under_Graduate_English.pdf/examsDocuments';
const OUT = path.join(__dirname, 'rrb-ntpc-ocr.txt');
/** Paragraph 13 spans these pages; 13.5 was observed on page 21 and 14.0 opens page 22. */
const PAGES = [16, 17, 18, 19, 20, 21];

const get = (url: string): Promise<Buffer> => new Promise((resolve, reject) => {
  https.get(url, { agent: new https.Agent({ ca: certificateAuthorities(), rejectUnauthorized: true }) }, (res) => {
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.destroy(); return resolve(get(new URL(res.headers.location, url).toString()));
    }
    const p: Buffer[] = []; res.on('data', (d) => p.push(d)); res.on('end', () => resolve(Buffer.concat(p)));
  }).on('error', reject);
});

(async () => {
  const full = await get(URL);
  const src = await PDFDocument.load(full);
  const slice = await PDFDocument.create();
  const pages = PAGES.filter((i) => i < src.getPageCount());
  (await slice.copyPages(src, pages)).forEach((p) => slice.addPage(p));
  const bytes = Buffer.from(await slice.save());
  console.log(`source ${full.length}B / ${src.getPageCount()}pp -> slice pages ${pages[0] + 1}-${pages[pages.length - 1] + 1} (${bytes.length}B)`);

  const ai = new GoogleGenAI({ vertexai: true, project: env.GOOGLE_VERTEX_PROJECT, location: env.GOOGLE_VERTEX_LOCATION });
  const res: any = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    config: { temperature: 0 },   // transcription, not generation
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'application/pdf', data: bytes.toString('base64') } },
      { text:
        'TRANSCRIBE these scanned pages of an Indian Railways CEN, verbatim.\n\n'
        + 'Focus on paragraph 13 and every sub-paragraph (13.0, 13.1, 13.2 …). Reproduce exactly what is '
        + 'printed, including the CBT stage tables (duration, number of questions per subject, totals) and '
        + 'every subject heading with its full list of topics.\n\n'
        + 'RULES:\n'
        + '- Transcribe only. Do NOT summarise, reorder, complete or correct anything.\n'
        + '- You may know the RRB NTPC syllabus already. Ignore that entirely. If a topic is not printed on '
        + 'these pages, it must not appear in your output.\n'
        + '- If a word is illegible, write [illegible] rather than guessing it.\n'
        + '- Preserve the original headings and numbering.' },
    ] }],
  });
  const text: string = res?.text ?? '';
  fs.writeFileSync(OUT, text, 'utf8');
  console.log(`transcribed ${text.length} chars -> ${OUT}\n`);
  console.log(text.slice(0, 2600));
  process.exit(0);
})().catch((e) => { console.error('FAILED:', String(e?.message || e).slice(0, 300)); process.exit(1); });
