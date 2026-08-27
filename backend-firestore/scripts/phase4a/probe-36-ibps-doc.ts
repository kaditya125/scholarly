/**
 * What does the official IBPS notification actually contain?
 *
 * IBPS is widely believed to publish no topic-wise syllabus, only a structure of examination. If
 * that holds, the honest thing to index is the pattern IBPS really publishes — never a topic list
 * assembled from coaching sites and presented to students as official.
 */
import 'dotenv/config';
import { fetchOfficialDocument } from '../../src/services/exam/officialFetch';
import { examMasterService } from '../../src/services/exam/examMaster.service';
import { PdfExtractor } from '../../src/core/pipeline/extractors/PdfExtractor';

const URL = 'https://www.ibps.in/wp-content/uploads/Detailed-Notification_CRP-PO-XVI_Final_V1_30.06.2026.pdf';

(async () => {
  const exam = await examMasterService.getExam('IBPS_PO');
  if (!exam) throw new Error('IBPS_PO not registered');
  console.log('officialDomains:', JSON.stringify((exam as any).officialDomains));

  const res = await fetchOfficialDocument({ url: URL, exam });
  console.log(`fetched ${res.status} ${res.contentType} bytes=${res.buffer.length}`);
  console.log(`finalUrl: ${res.finalUrl}`);

  const ex: any = await new PdfExtractor().extract(res.buffer, {
    documentId: 'probe_ibps_po', documentVersionId: 'probe_ibps_po_v1',
    filename: 'ibps_po.pdf', contentType: 'application/pdf',
  });
  const text: string = ex.rawText || '';
  console.log(`extracted chars: ${text.length}\n`);

  const at = (re: RegExp) => { const m = text.match(re); return m ? (m.index ?? -1) : -1; };
  console.log('=== section markers ===');
  for (const [label, re] of [['STRUCTURE OF EXAM', /structure\s+of\s+(the\s+)?(online\s+)?exam/i],
    ['SYLLABUS word', /\bsyllabus\b/i], ['Preliminary', /preliminary\s+examination/i],
    ['Main Exam', /main\s+examination/i], ['Descriptive', /descriptive/i]] as const) {
    const i = at(re as RegExp);
    console.log(`  ${String(label).padEnd(18)} ${i >= 0 ? 'at char ' + i : 'ABSENT'}`);
  }

  console.log('\n=== topic-level vocabulary (would indicate a true syllabus) ===');
  const topics = ['Simplification', 'Syllogism', 'Puzzle', 'Seating Arrangement', 'Data Interpretation',
    'Quadratic Equation', 'Cloze Test', 'Error Spotting', 'Blood Relation', 'Coding-Decoding'];
  const hits = topics.filter((t) => new RegExp(t, 'i').test(text));
  console.log(`  present: ${hits.length ? hits.join(', ') : 'NONE'}`);

  const i = at(/structure\s+of\s+(the\s+)?(online\s+)?exam/i);
  if (i >= 0) {
    console.log('\n=== structure-of-examination extract ===');
    console.log(text.slice(i, i + 1800).replace(/[ \t]{2,}/g, ' ').replace(/\n{2,}/g, '\n')
      .split('\n').map((l) => '  ' + l.trim()).filter((l) => l.trim()).join('\n'));
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
