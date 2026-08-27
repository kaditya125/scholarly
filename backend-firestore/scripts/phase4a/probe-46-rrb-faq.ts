import https from 'https';
import { certificateAuthorities } from '../../src/services/exam/trust';
import { PdfExtractor } from '../../src/core/pipeline/extractors/PdfExtractor';

const URL = 'https://rrb.indianrailways.gov.in/-/image/1762326267243FAQs_CEN_07_2025_NTPC_UG.pdf/examsDocuments';
const get = (url: string): Promise<Buffer> => new Promise((resolve, reject) => {
  https.get(url, { agent: new https.Agent({ ca: certificateAuthorities(), rejectUnauthorized: true }) }, (res) => {
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.destroy(); return resolve(get(new URL(res.headers.location, url).toString()));
    }
    const p: Buffer[] = []; res.on('data', d => p.push(d)); res.on('end', () => resolve(Buffer.concat(p)));
  }).on('error', reject);
});

(async () => {
  const buf = await get(URL);
  const ex: any = await new PdfExtractor().extract(buf, { documentId:'f', documentVersionId:'f1', filename:'f.pdf', contentType:'application/pdf' });
  const text: string = ex.rawText || '';
  console.log(`FAQ text: ${text.length} chars\n`);
  const at = (re: RegExp) => { const m = text.match(re); return m ? m.index : -1; };
  for (const [l, re] of [['SYLLABUS', /\bsyllabus\b/i], ['CBT 1', /CBT[\s\-]?(1|I)\b/], ['CBT 2', /CBT[\s\-]?(2|II)\b/],
    ['Mathematics', /\bMathematics\b/i], ['General Awareness', /General Awareness/i],
    ['General Intelligence', /General Intelligence/i], ['No. of Questions', /No\.?\s*of\s*Questions/i],
    ['Duration', /\bDuration\b/i], ['negative marking', /negative marking/i]] as const) {
    const i = at(re as RegExp);
    console.log(`  ${String(l).padEnd(22)} ${i >= 0 ? 'at ' + i : 'ABSENT'}`);
  }
  const i = at(/\bsyllabus\b/i);
  if (i >= 0) { console.log('\n=== around first "syllabus" mention ==='); 
    console.log(text.slice(Math.max(0,i-500), i+1200).replace(/[ \t]{2,}/g,' ').split('\n').map((l:string)=>'  '+l.trim()).filter((l:string)=>l.trim()).join('\n')); }
  process.exit(0);
})().catch(e => { console.error('FAILED:', e?.message||e); process.exit(1); });
