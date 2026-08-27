/**
 * Can the scanned RRB NTPC CEN be read at all?
 *
 * pdf-parse returns nothing because there is no text layer. Before proposing an OCR path, find
 * out whether the pages are even legible: slice out the syllabus pages and ask Gemini, which
 * reads PDF pages as images, to report what it can see.
 *
 * This is a FEASIBILITY probe, not an ingestion. Nothing is written. The question is only whether
 * the pixels carry a readable syllabus.
 */
import 'dotenv/config';
import https from 'https';
import { PDFDocument } from 'pdf-lib';
import { GoogleGenAI } from '@google/genai';
import { env } from '../../src/config/env';
import { certificateAuthorities } from '../../src/services/exam/trust';

const URL = 'https://rrb.indianrailways.gov.in/-/image/1762325939510Detailed_CEN_07_2025_NTPC_Under_Graduate_English.pdf/examsDocuments';

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
  console.log(`source PDF: ${full.length} bytes, ${src.getPageCount()} pages`);

  // Para-13 is where the FAQ says the pattern and syllabus live; take a window around it.
  const START = Number(process.argv[2] || 20);
  const COUNT = Number(process.argv[3] || 8);
  const want = [...Array(COUNT).keys()].map((i) => i + START).filter((i) => i < src.getPageCount());
  const slice = await PDFDocument.create();
  const copied = await slice.copyPages(src, want);
  copied.forEach((p) => slice.addPage(p));
  const bytes = Buffer.from(await slice.save());
  console.log(`sliced pages ${want[0] + 1}-${want[want.length - 1] + 1} -> ${bytes.length} bytes\n`);

  const ai = new GoogleGenAI({ vertexai: true, project: env.GOOGLE_VERTEX_PROJECT, location: env.GOOGLE_VERTEX_LOCATION });
  const res: any = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'application/pdf', data: bytes.toString('base64') } },
      { text: 'Pages from an Indian Railways CEN. Report ONLY what is literally printed. '
            + 'Find paragraph 13 (\"13.0\" or \"13.\"). Quote its heading and ALL its content verbatim, '
            + 'including any table of subjects, question counts, marks or duration. '
            + 'If paragraph 13 is not on these pages, say which paragraph numbers ARE present and stop. '
            + 'Do NOT use prior knowledge of RRB exams.' },
    ] }],
  });
  console.log('=== what the model can actually see ===');
  console.log(res?.text ?? JSON.stringify(res).slice(0, 1500));
  process.exit(0);
})().catch((e) => { console.error('FAILED:', String(e?.message || e).slice(0, 300)); process.exit(1); });
