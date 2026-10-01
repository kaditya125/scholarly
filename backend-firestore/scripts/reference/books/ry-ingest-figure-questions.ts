/**
 * Rakesh Yadav SSC Reasoning — picture questions into the private bank.
 *
 * The text ingest already holds every one of these questions as a QUARANTINED row (picture options
 * came out empty) WITH its key, paired from the chapter's answer grid and cross-checked against the
 * printed solutions. segment_v3.py cut the figures. This joins the two:
 *   - a cut question (PDF page, number) belongs to the chapter whose pages hold that PDF page
 *     (chapter starts read from the OCR headings); it matches the chapter's text row of that number.
 *     Several rows of that number (Type-I/II sets) are told apart by printed page (±1); still several
 *     = ambiguous → skipped. Rows on a chapter's first page carry no page, so a missing page is fine,
 *     but a page more than 2 away from the cut page is a mismatch → skipped;
 *   - figure options: the row's key must be one of the printed option labels;
 *     text options (counting, word mirror images): the row must already hold four clean options;
 *   - crops go to private/book_figures/ry_ssc_reasoning/<id>/ (storage rules deny client access);
 *   - the new row is extractionSource 'figure' (the text ingest never supersedes it), CLASSIFIED with
 *     its chapter's archetype, linked to its text row by sourceTextRowId.
 * The text rows stay QUARANTINED — only the figure row is ever served.
 *
 *   npx tsx scripts/reference/books/ry-ingest-figure-questions.ts [--apply]
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { db, firebaseApp } from '../../../src/config/firebase';
import { env } from '../../../src/config/env';
import { bookQuestionsRepository } from '../../../src/repositories/bookQuestions.repository';

const BOOK = 'ry_ssc_reasoning';
const apply = process.argv.includes('--apply');
const FIG = path.resolve(process.cwd(), '..', 'dataset_staging', 'rakesh_yadav', 'ssc_reasoning', 'figures');
const OFFSETS: [number, number][] = [[4, 3], [67, 6], [125, 7], [185, 8], [305, 9], [405, 10]];
const printedOf = (pdf: number) => pdf - OFFSETS.reduce((o, [from, off]) => (pdf >= from ? off : o), 3);
/** [first PDF page, chapter ordinal, picture-only chapter] — from the OCR chapter headings. */
const CHAPTERS: [number, number, boolean][] = [
  [201, 7, false], [222, 8, false], [238, 0, false], // Venn, Dice, (Direction: no figures)
  [474, 20, true], [486, 21, true], [488, 22, true], [498, 23, true], [507, 24, true], [520, 25, true], [528, 26, true], [531, 27, true],
];
const chapterOf = (pdf: number) => CHAPTERS.reduce<[number, number, boolean] | null>((c, x) => (pdf >= x[0] ? x : c), null);
/** Counting answers are numbers; OCR run-on ("48 or more 52. Find…") or figure labels ("9 D C") fail. */
const CLEAN_COUNT = /^(?:\d{1,3}(?: or more)?|none(?: of these)?)$/i;

/** Picture-bearing chapters → the archetype their questions share. */
function archetypeFor(chapter: string, text: string): string | null {
  const t = `${chapter} ${text}`.toLowerCase();
  if (/counting/.test(chapter.toLowerCase())) return 'FIGURE_COUNTING';
  if (/mirror|water/.test(chapter.toLowerCase())) return /water/.test(text.toLowerCase()) ? 'WATER_IMAGE' : 'MIRROR_IMAGE';
  if (/completion/.test(t)) return 'PATTERN_COMPLETION';
  if (/embedded/.test(t)) return 'EMBEDDED_FIGURE';
  if (/paper/.test(chapter.toLowerCase())) return /\bcut/.test(text.toLowerCase()) ? 'PAPER_CUTTING' : 'PAPER_FOLDING';
  if (/deviation of figure/.test(t)) return 'FIGURE_CLASSIFICATION';
  if (/analogy.*non-verbal/.test(t)) return 'FIGURE_ANALOGY';
  if (/^series$/.test(chapter.toLowerCase())) return 'FIGURE_SERIES';
  if (/venn/.test(t)) return 'VENN_DIAGRAM';
  if (/\bdice\b|cube/.test(t)) return 'CUBES_AND_DICE';
  return null;
}

/** Instruction for a picture question whose printed stem is only "Question Figure … Answer Figures". */
const DEFAULT_STEM: Record<string, string> = {
  PATTERN_COMPLETION: 'Select the answer figure that completes the question figure.',
  EMBEDDED_FIGURE: 'Select the answer figure in which the question figure is embedded (hidden).',
  PAPER_FOLDING: 'A piece of paper is folded and punched as shown in the question figures. Select how it will look when unfolded.',
  PAPER_CUTTING: 'A piece of paper is folded and cut as shown in the question figures. Select how it will look when unfolded.',
  MIRROR_IMAGE: 'Select the correct mirror image of the question figure.',
  WATER_IMAGE: 'Select the correct water image of the question figure.',
  FIGURE_ANALOGY: 'The question figures are related in a certain way. Select the answer figure that completes the analogy.',
  FIGURE_SERIES: 'Select the answer figure that continues the series.',
  FIGURE_CLASSIFICATION: 'Select the figure that is different from the others.',
};
/** OCR invented markdown image links for the figures ("![](https://github.com/…)"): never text. */
const unlink = (t: string) => t.replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ').replace(/[ 	]+/g, ' ').trim();
/** The words of a stem once figure captions, Hindi captions, labels and punctuation are gone. */
const substance = (t: string) => unlink(t).replace(/\([A-Ea-e]\)/g, ' ').replace(/(?:question|answer)\s+figures?|प्रश्न\s*आकृति|उत्तर\s*आकृति(?:याँ)?|[?:()\-–|]/gi, ' ').replace(/\s+/g, ' ').trim();
/** "Direction (41-52):- A triangular piece…" → "A triangular piece…". */
const directionsText = (t: string) => unlink(t).replace(/^\s*directions?\s*\([^)]*\)\s*[:\-–]*\s*/i, '').replace(/\s+/g, ' ').replace(/([a-z])- ([a-z])/g, '$1$2').replace(/^[\s:;\-–]+/, '').replace(/(?:\s*\([a-e]\)){3,}\s*$/i, '').trim();
function stemFor(row: any, archetype: string): string {
  if (substance(String(row.stem || '')).length >= 15) return unlink(String(row.stem));
  const dirs = directionsText(String(row.sharedDirections || ''));
  if (substance(dirs).length >= 20) return dirs;
  return DEFAULT_STEM[archetype] ?? 'Study the figures and select the correct answer figure.';
}

const normKey = (k: unknown) => String(k ?? '').replace(/[\s().]/g, '').toLowerCase();

(async () => {
  // Two segmenters: v3 (model counts + blobs, text-layer checked) first, then segment_text.py
  // (text-layer labels only) for what v3 left — a question placed by both keeps v3's crops.
  const load = (dir: string, source: 'v3' | 'text') => fs.existsSync(path.join(FIG, dir))
    ? fs.readdirSync(path.join(FIG, dir)).filter((f) => f.endsWith('.json')).sort()
      .map((f) => ({ ...JSON.parse(fs.readFileSync(path.join(FIG, dir, f), 'utf8')), source }))
    : [];
  const pages = [...load('pages_v3', 'v3'), ...load('pages_t', 'text')];
  const all = (await db.collection('book_questions').where('bookId', '==', BOOK).get()).docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }));
  const rows = all.filter((r) => r.extractionSource !== 'figure' && CHAPTERS.some((c) => c[1] && c[1] === r.chapterOrdinal));
  // Figure rows already written with the same crops are left alone (no re-upload, createdAt kept).
  const written = new Map(all.filter((r) => r.extractionSource === 'figure').map((r) => [r.id, r]));
  const seen = new Set<string>();
  const kept = new Map<string, string>();   // text row id -> unchanged figure row id

  const bucket = firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET);
  const now = new Date().toISOString();
  const reasons: Record<string, number> = {};
  const byChapter: Record<string, number> = {};
  const docs: any[] = [];
  const skip = (r: string) => { reasons[r] = (reasons[r] || 0) + 1; };

  for (const pg of pages) {
    for (const q of pg.questions) {
      if (q.status !== 'OK') { if (pg.source === 'v3') skip('figures not cut cleanly (v3)'); continue; }
      const printed = printedOf(pg.page);
      const ch = chapterOf(pg.page);
      if (!ch || !ch[1]) { skip('page outside picture chapters'); continue; }
      let cands = rows.filter((r) => r.chapterOrdinal === ch[1] && r.questionNumber === q.number);
      if (cands.length > 1) cands = cands.filter((r) => typeof r.sourcePage === 'number' && Math.abs(r.sourcePage - printed) <= 1);
      if (cands.length === 0) { skip(`no text row (ch${ch[1]})`); continue; }
      if (cands.length > 1) { skip('ambiguous text row'); continue; }
      const row = cands[0];
      if (typeof row.sourcePage === 'number' && Math.abs(row.sourcePage - printed) > 2) { skip('page mismatch'); continue; }
      // A CLASSIFIED text row whose question has its own printed figure (cut from inside the
      // question's number-to-number span) was answerable only by luck: the figure row replaces it.
      const key = normKey(row.answerKey);
      if (!key) { skip('no answer key'); continue; }
      const labels: string[] = (q.optionLabels || []).map((l: unknown) => normKey(l));
      let options: string[]; let answerIndex: number;
      if (q.optionsAreText) {
        options = Array.isArray(row.options) ? row.options : [];
        if (options.length < 4 || options.some((o) => !String(o).trim())) { skip('text options missing'); continue; }
        if (ch[1] === 20 && options.some((o) => !CLEAN_COUNT.test(String(o).trim()))) { skip('text options polluted'); continue; }
        if (options.some((o) => String(o).length > 60 || /\b\d{1,3}\.\s+[A-Z]/.test(String(o)))) { skip('text options polluted'); continue; }
        answerIndex = typeof row.answerIndex === 'number' ? row.answerIndex : -1;
        if (answerIndex < 0) { skip('answer not in options'); continue; }
      } else {
        // A full set of options, (a) onward: a question cut off at the page end has only (a)(b).
        if (labels.length < 4 || labels.some((l, j) => l !== 'abcde'[j])) { skip('incomplete option set'); continue; }
        answerIndex = labels.indexOf(key);
        if (answerIndex < 0) { skip('key not among figure labels'); continue; }
        options = labels.map((l) => `Figure (${l})`);
      }
      const archetype = archetypeFor(String(row.chapterName), `${row.stem || ''} ${row.sharedDirections || ''}`)!;
      const id = createHash('sha256').update(`${BOOK}|figure|${row.chapterOrdinal}|${row.sourceSectionIndex}|${row.questionNumber}`).digest('hex').slice(0, 24);
      if (seen.has(id)) { continue; }   // placed by v3 already
      seen.add(id);
      const hash = createHash('sha256');
      for (const [, file] of Object.entries(q.crops as Record<string, string>).sort()) hash.update(fs.readFileSync(path.join(FIG, 'crops', file)));
      const cropsHash = hash.digest('hex');
      byChapter[row.chapterName] = (byChapter[row.chapterName] || 0) + 1;
      const prev = written.get(id);
      const sameCrops = prev?.originalQuestionHash === cropsHash;

      const figure: { problem: string[]; options: Record<string, string> } = { problem: [], options: {} };
      for (const [slot, file] of Object.entries(q.crops as Record<string, string>).sort()) {
        const local = path.join(FIG, 'crops', file);
        const dest = `private/book_figures/${BOOK}/${id}/${slot}.png`;
        if (slot.startsWith('prob')) figure.problem.push(dest); else figure.options[slot.slice(3)] = dest;
        if (apply && !sameCrops) await bucket.upload(local, { destination: dest, metadata: { contentType: 'image/png', cacheControl: 'private, max-age=0' } });
      }
      const doc: any = {
        id, bookId: BOOK, subject: 'REASONING',
        chapterName: row.chapterName, chapterOrdinal: row.chapterOrdinal, chapterId: `${BOOK}:ch${row.chapterOrdinal}`,
        sourceSection: row.sourceSection, sourceSectionIndex: row.sourceSectionIndex, questionNumber: row.questionNumber,
        sourcePage: row.sourcePage, sourcePdfPage: pg.page,
        // A Venn block's question is only its three classes; the instruction is the block's directions.
        stem: q.sharedBlock && substance(directionsText(String(row.sharedDirections || ''))).length >= 20
          ? `${directionsText(String(row.sharedDirections))}
${String(row.stem || '').trim()}` : stemFor(row, archetype),
        sharedDirections: row.sharedDirections ?? undefined,
        options, answerKey: q.optionsAreText ? row.answerKey : labels[answerIndex], answerIndex,
        solution: row.solution ?? undefined, examTag: row.examTag ?? undefined,
        figure, extractionSource: 'figure', sourceTextRowId: row.id,
        status: 'CLASSIFIED', archetype, classificationVersion: 'figure-chapter-v1',
        originalQuestionHash: cropsHash, extractionVersion: pg.source === 'v3' ? 'figure-v3' : 'figure-text-v1',
        ...(q.sharedBlock ? { sharedFigureBlock: q.sharedBlock } : {}),
        jobId: `figjob_${BOOK}_${Date.now()}`, createdAt: prev?.createdAt ?? now, updatedAt: now,
      };
      // also rewrite when its chapter type was overwritten (a text classifier pass re-typed 216 of them, 2 Oct)
      if (sameCrops && prev.stem === doc.stem && prev.answerKey === doc.answerKey
          && prev.archetype === doc.archetype && prev.classificationVersion === doc.classificationVersion) {
        kept.set(row.id, id); skip('already in the bank, unchanged'); continue;
      }
      docs.push(doc);
    }
  }
  const dump = process.argv.includes('--dump') ? process.argv[process.argv.indexOf('--dump') + 1] : '';
  if (dump) fs.writeFileSync(dump, JSON.stringify(docs.map((d) => ({ ...d, crops: d.figure })), null, 1));
  console.log(`${apply ? '' : '[dry run] '}${BOOK}: ${docs.length + kept.size} picture questions usable (${docs.length} new or changed, ${kept.size} already in the bank)`);
  for (const [c, n] of Object.entries(byChapter)) console.log(`   ${c.padEnd(44)} ${n}`);
  console.log('  not used:', JSON.stringify(reasons));
  // A text row in a picture-only chapter (Counting Figures onward) was CLASSIFIED because its
  // options happened to parse, but without its figure the question can't be answered: take it out of
  // service. Its figure row, when one was cut, replaces it.
  const figureOf = new Map([...kept, ...docs.map((d) => [d.sourceTextRowId, d.id] as [string, string])]);
  const demote = rows.filter((r) => r.status === 'CLASSIFIED' && (figureOf.has(r.id) || CHAPTERS.some((c) => c[2] && c[1] === r.chapterOrdinal)));
  console.log(`  text rows without their figure to take out of service: ${demote.length} (${demote.filter((r) => figureOf.has(r.id)).length} replaced by a figure row)`);
  if (apply) {
    await bookQuestionsRepository.writeQuestions(docs as any);
    console.log(`  wrote ${docs.length} rows; crops in private/book_figures/${BOOK}/`);
    const b = db.batch();
    for (const r of demote) {
      b.update(db.collection('book_questions').doc(r.id), {
        status: 'QUARANTINED', quarantineReason: 'needs_figure', figureRowId: figureOf.get(r.id) ?? null, updatedAt: now,
      });
    }
    await b.commit();
    console.log(`  took ${demote.length} figure-less text rows out of service`);
  }
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
