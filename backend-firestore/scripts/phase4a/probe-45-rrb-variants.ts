/**
 * Is ANY variant of the RRB NTPC CEN machine-readable?
 *
 * The English detailed CEN is a scan (999 chars over 56 pages). Before concluding that RRB NTPC
 * needs OCR, check the other editions RRB publishes of the same notice — a Hindi typeset version,
 * or the corrigendum, may carry a real text layer.
 * No embeddings, no LLM: fetch and PDF text extraction only, safe beside a running indexer.
 */
import https from 'https';
import { certificateAuthorities } from '../../src/services/exam/trust';
import { PdfExtractor } from '../../src/core/pipeline/extractors/PdfExtractor';

const BASE = 'https://rrb.indianrailways.gov.in';
const DOCS: Array<[string, string]> = [
  ['English detailed CEN', '/-/image/1762325939510Detailed_CEN_07_2025_NTPC_Under_Graduate_English.pdf/examsDocuments'],
  ['Hindi detailed CEN',   '/-/image/1762325939524Detailed_CEN_07_2025_NTPC_Under_Graduate_Hindi.pdf/examsDocuments'],
  ['Corrigendum 1',        '/-/image/1768198728409Corrigendum-1-CEN-07-2025-NTPC-UG-combined.pdf/examsDocuments'],
  ['FAQs',                 '/-/image/1762326267243FAQs_CEN_07_2025_NTPC_UG.pdf/examsDocuments'],
];

const get = (url: string): Promise<{ status: number; type: string; buf: Buffer }> =>
  new Promise((resolve, reject) => {
    https.get(url, { agent: new https.Agent({ ca: certificateAuthorities(), rejectUnauthorized: true }) }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.destroy(); return resolve(get(new URL(res.headers.location, url).toString()));
      }
      const parts: Buffer[] = [];
      res.on('data', (d) => parts.push(d));
      res.on('end', () => resolve({ status: res.statusCode || 0, type: String(res.headers['content-type'] || ''), buf: Buffer.concat(parts) }));
    }).on('error', reject);
  });

(async () => {
  for (const [label, path] of DOCS) {
    try {
      const r = await get(BASE + path);
      if (!/pdf/i.test(r.type)) { console.log(`${label.padEnd(22)} HTTP ${r.status} not a PDF (${r.type})`); continue; }
      const ex: any = await new PdfExtractor().extract(r.buf, {
        documentId: 'p', documentVersionId: 'p1', filename: 'x.pdf', contentType: 'application/pdf' });
      const text: string = ex.rawText || '';
      // Page markers the extractor inserts are not content; strip them before judging.
      const real = text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').replace(/\s+/g, ' ').trim();
      const pages = (text.match(/--\s*\d+\s*of\s*\d+\s*--/g) || []).length;
      const perPage = pages ? Math.round(real.length / pages) : real.length;
      console.log(`${label.padEnd(22)} ${String(r.buf.length).padStart(8)}B  pages=${String(pages).padStart(3)}  realChars=${String(real.length).padStart(6)}  perPage=${String(perPage).padStart(5)}  ${perPage > 200 ? 'HAS TEXT LAYER' : 'SCANNED — no usable text'}`);
      if (perPage > 200) console.log(`     sample: ${real.slice(0, 180)}`);
    } catch (e: any) {
      console.log(`${label.padEnd(22)} ERROR ${String(e.message).slice(0, 70)}`);
    }
  }
  process.exit(0);
})();
