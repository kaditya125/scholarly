/** Verify the official RRB NTPC CEN is reachable and actually carries a syllabus. */
import https from 'https';
import { certificateAuthorities } from '../../src/services/exam/trust';
import { PdfExtractor } from '../../src/core/pipeline/extractors/PdfExtractor';

const URL = 'https://rrb.indianrailways.gov.in/-/image/1762325939510Detailed_CEN_07_2025_NTPC_Under_Graduate_English.pdf/examsDocuments';

const get = (url: string) => new Promise<{ status: number; type: string; buf: Buffer }>((resolve, reject) => {
  https.get(url, { agent: new https.Agent({ ca: certificateAuthorities(), rejectUnauthorized: true }) }, (res) => {
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.destroy(); return resolve(get(new URL(res.headers.location, url).toString()) as any);
    }
    const parts: Buffer[] = [];
    res.on('data', (d) => parts.push(d));
    res.on('end', () => resolve({ status: res.statusCode || 0, type: String(res.headers['content-type'] || ''), buf: Buffer.concat(parts) }));
  }).on('error', reject);
});

(async () => {
  const r = await get(URL);
  console.log(`HTTP ${r.status}  ${r.type}  ${r.buf.length} bytes  (TLS verified)`);
  if (!/pdf/i.test(r.type)) { console.log('not a PDF — stopping'); process.exit(1); }

  const ex: any = await new PdfExtractor().extract(r.buf, {
    documentId: 'probe_rrb', documentVersionId: 'probe_rrb_v1', filename: 'ntpc.pdf', contentType: 'application/pdf' });
  const text: string = ex.rawText || '';
  console.log(`extracted ${text.length} chars\n`);

  console.log('=== ALL extracted text ===');
  console.log(text.slice(0, 1200));
  console.log('=== blocks: ' + (ex.blocks || []).length + ' ===');

  const at = (re: RegExp) => { const m = text.match(re); return m ? m.index : -1; };
  console.log('=== markers ===');
  for (const [l, re] of [['SYLLABUS heading', /\bSYLLABUS\b/], ['CBT 1', /(first|1st|CBT[- ]?1)\s*stage|Stage\s*1/i],
    ['CBT 2', /(second|2nd|CBT[- ]?2)\s*stage|Stage\s*2/i], ['Mathematics', /\bMathematics\b/],
    ['General Intelligence', /General Intelligence/i], ['General Awareness', /General Awareness/i]] as const) {
    const i = at(re as RegExp); console.log(`  ${String(l).padEnd(20)} ${i >= 0 ? 'at ' + i : 'ABSENT'}`);
  }

  const topics = ['Number System', 'Decimals', 'Fractions', 'LCM', 'HCF', 'Ratio and Proportion',
    'Percentage', 'Mensuration', 'Time and Work', 'Analogies', 'Syllogism', 'Venn Diagram', 'Puzzle'];
  const hits = topics.filter((t) => new RegExp(t.replace(/ /g, '\s+'), 'i').test(text));
  console.log(`\ntopic-level vocabulary present: ${hits.length}/${topics.length}`);
  console.log(`  ${hits.join(', ') || 'NONE'}`);

  const si = text.search(/\bSYLLABUS\b/);
  if (si >= 0) {
    console.log('\n=== syllabus section extract ===');
    console.log(text.slice(si, si + 1600).replace(/[ \t]{2,}/g, ' ').split('\n').map((l: string) => '  ' + l.trim()).filter((l: string) => l.trim()).join('\n'));
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
