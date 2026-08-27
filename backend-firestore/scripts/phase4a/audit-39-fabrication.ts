/**
 * Does every extracted node actually appear in the source document?
 *
 * The extractor is an LLM, and these are exams it has seen thousands of times in training. Asked
 * for the syllabus of a well-known exam from a document that does not contain one, the failure
 * mode is not an error — it is a confident, plausible, entirely invented topic list. For IBPS PO
 * this is not hypothetical: the official notification contains the word "syllabus" zero times, so
 * ANY topic-level node claiming to be an IBPS syllabus is fabricated by construction.
 *
 * Every node name is therefore checked back against the archived source text. Names are compared
 * on normalised alphanumerics so that spacing, case and punctuation differences do not count as
 * fabrication, while genuinely absent content still does.
 *
 * This reports; it does not delete. A high unsupported rate is a signal to reject the extraction,
 * and that call belongs to a person.
 *
 *   npx tsx scripts/phase4a/audit-39-fabrication.ts <SYLLABUS_ID>
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { examDocumentStorageService } from '../../src/services/exam/examDocumentStorage.service';
import { PdfExtractor } from '../../src/core/pipeline/extractors/PdfExtractor';
import { syllabusNodesOf, walkSyllabusNodes } from '../../src/types/exam.types';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  const syllabusId = process.argv[2];
  if (!syllabusId) { console.error('usage: audit-39-fabrication.ts <SYLLABUS_ID>'); process.exit(64); }

  const doc = await db.collection('exam_syllabi').doc(syllabusId).get();
  if (!doc.exists) { console.error('no such syllabus:', syllabusId); process.exit(1); }
  const s: any = doc.data();

  const bytes = await examDocumentStorageService.downloadDocumentBuffer(s.storagePath);
  const ex: any = await new PdfExtractor().extract(bytes, {
    documentId: syllabusId, documentVersionId: `${syllabusId}_audit`,
    filename: `${syllabusId}.pdf`, contentType: 'application/pdf' });
  const haystack = norm(ex.rawText || '');
  console.log(`${s.examId}  ${syllabusId}  status=${s.status}`);
  console.log(`source: ${s.storagePath}  (${bytes.length} bytes, ${haystack.length} normalised chars)\n`);

  const nodes = syllabusNodesOf(s);
  const unsupported: Array<{ type: string; name: string }> = [];
  let total = 0;
  let composed = 0;
  walkSyllabusNodes(nodes, (n: any) => {
    const name = String(n.name || '').trim();
    if (!name) return;
    total++;

    /*
     * A node may be COMPOSED rather than quoted — a sentence assembled from values that are each
     * in the document, such as "35 questions, 30 marks, medium: English and Hindi". The sentence
     * is ours, so a verbatim check would call it fabricated and, at 45% of the tree, would train
     * the reader to ignore this report. Such nodes declare their components and every component
     * is checked instead; a composed node whose parts are absent still fails.
     */
    if (Array.isArray(n.composedFrom) && n.composedFrom.length) {
      composed++;
      const missing = n.composedFrom.filter((c: any) => !haystack.includes(norm(String(c))));
      if (missing.length) unsupported.push({ type: `${n.type}*`, name: `[component absent: ${missing.join(' | ')}] ${name}` });
      return;
    }
    if (!haystack.includes(norm(name))) unsupported.push({ type: n.type, name });
  });
  if (composed) console.log(`composed nodes     ${composed}  (verified component-wise, not verbatim)`);

  const pct = total ? (unsupported.length / total) * 100 : 0;
  console.log(`nodes checked      ${total}`);
  console.log(`NOT in source      ${unsupported.length}  (${pct.toFixed(1)}%)`);

  const byType: Record<string, number> = {};
  unsupported.forEach((u) => { byType[u.type] = (byType[u.type] || 0) + 1; });
  if (unsupported.length) {
    console.log(`by type            ${JSON.stringify(byType)}`);
    console.log('\nexamples of nodes with NO support in the official document:');
    unsupported.slice(0, 20).forEach((u) => console.log(`  ${u.type.padEnd(9)} ${u.name.slice(0, 84)}`));
  }

  console.log(`\nVERDICT: ${pct === 0 ? 'every node traceable to the source'
    : pct < 5 ? 'minor drift — likely paraphrase, inspect the examples'
    : pct < 25 ? 'SIGNIFICANT unsupported content — do not publish without review'
    : 'LARGELY FABRICATED — reject this extraction'}`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
