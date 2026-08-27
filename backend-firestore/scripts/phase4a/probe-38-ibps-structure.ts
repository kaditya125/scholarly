import 'dotenv/config';
import { fetchOfficialDocument } from '../../src/services/exam/officialFetch';
import { examMasterService } from '../../src/services/exam/examMaster.service';
import { PdfExtractor } from '../../src/core/pipeline/extractors/PdfExtractor';

const URL = 'https://www.ibps.in/wp-content/uploads/Detailed-Notification_CRP-PO-XVI_Final_V1_30.06.2026.pdf';

(async () => {
  const exam = await examMasterService.getExam('IBPS_PO');
  const res = await fetchOfficialDocument({ url: URL, exam: exam! });
  const ex: any = await new PdfExtractor().extract(res.buffer, {
    documentId: 'probe', documentVersionId: 'probe_v1', filename: 'x.pdf', contentType: 'application/pdf' });
  const text: string = ex.rawText || '';

  // Every occurrence, so the table of contents can be told from the real section.
  const marks = [...text.matchAll(/Preliminary\s+Examination/gi)].map((m) => m.index!);
  console.log('occurrences of "Preliminary Examination":', marks.join(', '));

  // The real section is wherever the sectional table lives — find "Name of Tests" style headers.
  for (const re of [/No\.?\s*of\s*Questions/i, /Maximum\s*Marks/i, /Medium\s+of\s+Exam/i]) {
    const m = text.match(re);
    console.log(`  ${re} -> ${m ? m.index : 'absent'}`);
  }

  const anchor = text.search(/No\.?\s*of\s*Questions/i);
  if (anchor > 0) {
    console.log('\n=== REAL STRUCTURE SECTION ===');
    console.log(text.slice(anchor + 2400, anchor + 5200)
      .replace(/[ \t]{2,}/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean).join('\n'));
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
