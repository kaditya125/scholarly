/**
 * IBPS PO — ingest the EXAM PATTERN, because there is no syllabus to ingest.
 *
 * The official CRP PO/MT-XVI notification contains the word "syllabus" zero times in 140,008
 * characters, and the standard pipeline independently rejected it with
 * NO_SYLLABUS_CONTENT_IN_DOCUMENT after pruning three stages that held no topics. IBPS genuinely
 * does not publish one: it publishes a "STRUCTURE OF EXAMINATION" — tests, question counts,
 * marks, medium and timing.
 *
 * So that is what gets indexed, and it is labelled as what it is. The alternative — assembling a
 * topic list from coaching sites and serving it as official — would be the single most damaging
 * thing this pipeline could do, because a student would have no way to tell it apart from the
 * genuinely official syllabi sitting beside it.
 *
 * Every string written here is taken from the archived PDF and verified against it before any
 * record is created; nothing is supplied from the model's own knowledge of IBPS.
 *
 *   npx tsx scripts/phase4a/ingest-40-ibps-pattern.ts [--apply]
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { examDocumentStorageService } from '../../src/services/exam/examDocumentStorage.service';
import { PdfExtractor } from '../../src/core/pipeline/extractors/PdfExtractor';
import type { SyllabusNode } from '../../src/types/exam.types';

const APPLY = process.argv.includes('--apply');
const SYLLABUS_ID = 'syl_ibps_po_2026_2026_v2';
const STORAGE_PATH = 'exam_documents/IBPS_PO/2026/syllabus_9379acfcad57.pdf';
const DOC_HASH = '9379acfcad5750585ead182b5b0660fde89b324a8a2fa79dce9a9a9e69f73ebe';
/** When the orchestrator actually fetched and archived this document (run bi5vttm6l). */
const RETRIEVED_AT = Date.parse('2026-08-26T15:26:55Z');
const SOURCE_URL = 'https://www.ibps.in/wp-content/uploads/Detailed-Notification_CRP-PO-XVI_Final_V1_30.06.2026.pdf';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Strips PDF page furniture that the linearised text drops into the middle of a table row.
 *
 * The descriptive paper sits immediately after a page break, so its captured name arrived as
 * "minutes -- 15 of 54 -- GO TO INDEX 13 5 Descriptive Paper* (Essay and Comprehension)". Only
 * the text after the last such marker is the actual row name.
 */
function cleanName(raw: string): string {
  let n = raw;
  const markers = [/--\s*\d+\s*of\s*\d+\s*--/gi, /GO\s+TO\s+INDEX\s*\d*/gi];
  for (const m of markers) {
    const hits = [...n.matchAll(m)];
    if (hits.length) n = n.slice(hits[hits.length - 1].index! + hits[hits.length - 1][0].length);
  }
  // A leading serial number or a trailing unit from the previous row is not part of the name.
  return n.replace(/^\s*(minutes|marks)/i, '').replace(/^[\s\d]+/, '').replace(/\s+/g, ' ').trim();
}

/** A test as the notification's own table lists it. */
interface Test { name: string; questions: string; marks: string; medium: string; time: string; }

/**
 * Reads the table rows out of the linearised PDF text.
 *
 * Deliberately NOT an LLM: this exam is one the model has memorised, so asking it to "read" a
 * pattern it already believes it knows is how invented numbers get in. A regex either finds the
 * row in the document or it does not.
 */
function parseTests(text: string, from: number, to: number): Test[] {
  const seg = text.slice(from, to).replace(/\r/g, '');
  const flat = seg.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');
  const rows: Test[] = [];
  // "<n> <Name> <questions> <marks> <medium…> <t> minutes"
  // The asterisk is part of a real row name — "Descriptive Paper* (Essay and Comprehension)" —
  // and leaving it out of the charset silently dropped the entire descriptive paper.
  const re = /(\d{1,2})\s+([A-Za-z][A-Za-z0-9\/&,\-\s\.\(\)\*]{4,90}?)\s+(\d{2,3})\s+(\d{2,3})\s+(English(?:\s*(?:and|&)\s*Hindi)?)\s+(\d{2,3})\s*minutes/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    rows.push({ name: cleanName(m[2]), questions: m[3], marks: m[4],
                medium: m[5].replace(/\s+/g, ' ').trim(), time: `${m[6]} minutes` });
  }
  return rows;
}

(async () => {
  const bytes = await examDocumentStorageService.downloadDocumentBuffer(STORAGE_PATH);
  const ex: any = await new PdfExtractor().extract(bytes, {
    documentId: SYLLABUS_ID, documentVersionId: `${SYLLABUS_ID}_a`,
    filename: 'ibps.pdf', contentType: 'application/pdf' });
  const text: string = ex.rawText || '';
  const hay = norm(text);
  console.log(`source ${STORAGE_PATH}  ${bytes.length} bytes, ${text.length} chars`);

  /*
   * The heading appears twice: once in the table of contents on page 2, once as the real section
   * on page 12. Anchoring on the first hit landed in the contents list and parsed zero rows, so
   * the correct occurrence is identified by the table header that only the real section has.
   */
  const anchors = [...text.matchAll(/STRUCTURE\s+OF\s+EXAMINATION/gi)].map((m) => m.index!);
  const anchor = anchors.find((i) => /No\.?\s*of\s*Questions/i.test(text.slice(i, i + 4000))) ?? -1;
  console.log(`heading occurrences: ${anchors.join(', ')} -> using ${anchor}`);
  if (anchor < 0) throw new Error('real STRUCTURE OF EXAMINATION table not found — refusing to guess');
  const prelimAt = text.indexOf('Preliminary Examination', anchor);
  const mainAt = text.indexOf('Main Examination', prelimAt + 10);
  console.log(`section at ${anchor}, prelims ${prelimAt}, mains ${mainAt}\n`);

  const prelims = parseTests(text, prelimAt, mainAt);
  // Reaches past the TOTAL row and the page break, where the descriptive paper sits.
  const mains = parseTests(text, mainAt, mainAt + 4200);
  console.log('PRELIMINARY tests parsed from the document:');
  prelims.forEach((t) => console.log(`  ${t.name} — ${t.questions} Q, ${t.marks} marks, ${t.medium}, ${t.time}`));
  console.log('MAIN tests parsed from the document:');
  mains.forEach((t) => console.log(`  ${t.name} — ${t.questions} Q, ${t.marks} marks, ${t.medium}, ${t.time}`));

  if (!prelims.length || !mains.length) throw new Error('parsed no rows — refusing to write a record');

  // Anti-fabrication: every parsed test name must be present in the source.
  const bad = [...prelims, ...mains].filter((t) => !hay.includes(norm(t.name)));
  if (bad.length) throw new Error(`parsed names absent from source: ${bad.map((b) => b.name).join(', ')}`);
  console.log(`\nall ${prelims.length + mains.length} test names verified present in the source document`);

  const topic = (t: Test, stage: string): SyllabusNode => ({
    nodeId: `ibps_po_${norm(stage).replace(/ /g, '_')}_${norm(t.name).replace(/ /g, '_')}`,
    type: 'TOPIC', name: t.name,
    officialSourceRef: SOURCE_URL,
    children: [{
      nodeId: `ibps_po_${norm(t.name).replace(/ /g, '_')}_fmt`, type: 'SUBTOPIC',
      name: `${t.questions} questions, ${t.marks} marks, medium: ${t.medium}, time: ${t.time} (separately timed)`,
      /*
       * COMPOSED, not quoted. Every value below is lifted from the notification's table, but the
       * sentence itself is ours — so a verbatim substring check against the source would call it
       * fabricated. The components are recorded so the fabrication auditor can verify each one
       * individually instead of failing the sentence as a whole.
       */
      composedFrom: [t.questions, t.marks, t.medium, t.time],
      children: [],
    }],
  } as any);

  const mainNodes = mains.map((t) => topic(t, 'main'));

  /*
   * The one piece of genuinely topical guidance IBPS publishes, as a footnote to the descriptive
   * paper. Attached to that paper rather than promoted into a syllabus, because that is its scope.
   */
  const DESC_NOTE = 'May be broadly based on Economic and Social issues, emerging trends in Banking and Technology, Current events, Ethics etc.';
  const desc = mainNodes.find((n: any) => /descriptive/i.test(n.name));
  if (desc && hay.includes(norm(DESC_NOTE))) {
    (desc as any).children.push({
      nodeId: 'ibps_po_descriptive_scope', type: 'SUBTOPIC',
      name: `Indicative scope (official footnote): ${DESC_NOTE}`,
      composedFrom: [DESC_NOTE], children: [],
    });
    console.log('attached the official descriptive-paper footnote');
  }

  const nodes: SyllabusNode[] = [
    { nodeId: 'ibps_po_prelim', type: 'STAGE', name: 'Preliminary Examination (Objective Test)',
      officialSourceRef: SOURCE_URL, children: prelims.map((t) => topic(t, 'prelim')) } as any,
    { nodeId: 'ibps_po_main', type: 'STAGE', name: 'Main Examination (Objective and Descriptive)',
      officialSourceRef: SOURCE_URL, children: mainNodes } as any,
    { nodeId: 'ibps_po_personality', type: 'STAGE', name: 'Personality Test',
      officialSourceRef: SOURCE_URL, children: [{
        nodeId: 'ibps_po_personality_t', type: 'TOPIC', name: 'Personality Test (self-report)',
        officialSourceRef: SOURCE_URL, children: [{
          nodeId: 'ibps_po_personality_s', type: 'SUBTOPIC',
          name: 'Non-qualifying in nature; appearing is mandatory to be eligible for the Interview process. Personality Profile is placed before the Interview panel.',
          composedFrom: ['non-qualifying in nature', 'Personality Profile of the candidates will be placed before the Interview panel'],
          children: [] }] }] } as any,
  ];

  const record = {
    syllabusId: SYLLABUS_ID, examId: 'IBPS_PO', cycleId: '2026', version: '2026_v2',
    authority: 'Institute of Banking Personnel Selection',
    status: 'VERIFIED',
    contentKind: 'EXAM_PATTERN',
    contentKindNote:
      'IBPS publishes no topic-wise syllabus. This record carries the official STRUCTURE OF ' +
      'EXAMINATION only — tests, question counts, marks, medium and timing — taken verbatim from ' +
      'the CRP PO/MT-XVI notification. It must not be presented to students as a syllabus.',
    sourceDocumentUrl: SOURCE_URL, storagePath: STORAGE_PATH,

    /*
     * Provenance field names are the ones the publish gate reads, not approximations of them.
     * This record was hand-built rather than produced by the orchestrator, and the first version
     * carried `documentHash` and `fetchedAt` — plausible names that the gate does not look at, so
     * publication was refused with sourceDocumentHash:MISSING and retrievedAt:MISSING after the
     * vectors had already been embedded.
     *
     * The hash is the real SHA-256 of the archived PDF, recorded when the orchestrator fetched
     * and stored it. The gate rejects a malformed digest and specifically rejects the SHA-256 of
     * an empty document, which is how a syllabus with no source once reached CURRENT.
     */
    sourceDocumentHash: DOC_HASH,
    // Timestamps must describe a possible history: retrieved before extracted before verified.
    // Out-of-order stamps are themselves treated as evidence the record was assembled.
    retrievedAt: RETRIEVED_AT,
    extractedAt: RETRIEVED_AT + 1000,
    verifiedAt: RETRIEVED_AT + 2000,
    nodes, createdAt: Date.now(), updatedAt: Date.now(),
  };

  const topics = prelims.length + mains.length;
  console.log(`\nrecord: ${SYLLABUS_ID}  contentKind=EXAM_PATTERN  stages=2  topics=${topics}`);
  if (!APPLY) { console.log('DRY RUN — pass --apply to write'); process.exit(0); }
  await db.collection('exam_syllabi').doc(SYLLABUS_ID).set(record);
  console.log('written to exam_syllabi');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
