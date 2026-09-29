/**
 * Step 12 — ingest non-verbal FIGURE questions into the private book bank (Track A).
 *
 * Reads dataset_staging/<book>/figures/manifest.json written by figures/extract_figures.py, and for
 * each question:
 *   - places it in its non-verbal chapter by exercise number (the book numbers the non-verbal part
 *     1 Series … 17 Figure Formation); a chapter the text bank doesn't have gets an ordinal ≥ 100 so
 *     it can never collide with a text-parsed chapter ordinal;
 *   - uploads its crops ONLY when the pixel segmentation accepted them, to
 *     private/book_figures/<book>/<id>/… — storage.rules deny all client access by default, so
 *     only the Admin SDK can read them;
 *   - is usable (CLASSIFIED, archetype from its chapter) only when its crops were accepted AND the
 *     book's answer key names one of its option labels ("no key → no answer"). Everything else is
 *     QUARANTINED with the reason.
 * Rows carry extractionSource 'figure', so the text ingest never supersedes them and the text
 * classifier skips them.
 *
 *   npx tsx scripts/reference/books/12-ingest-figure-questions.ts schand_reasoning [--dry-run]
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { db, firebaseApp } from '../../../src/config/firebase';
import { env } from '../../../src/config/env';
import { bookQuestionsRepository } from '../../../src/repositories/bookQuestions.repository';
import { BOOKS } from './contract';

const [key] = process.argv.slice(2);
const dryRun = process.argv.includes('--dry-run');
const book = BOOKS[key];
if (!book) throw new Error(`Unknown book ${key}`);

const FIGURE_DIR = path.resolve(process.cwd(), '..', 'dataset_staging', ...book.stagingDir.split('/'), 'figures');
const EXTRACTION_VERSION = 'figure-v1';

/** The non-verbal part's own chapter numbering, and the archetype each chapter's questions share. */
const NONVERBAL: Record<number, { name: string; archetype: string }> = {
  1: { name: 'Series', archetype: 'FIGURE_SERIES' },
  2: { name: 'Analogy', archetype: 'FIGURE_ANALOGY' },
  3: { name: 'Classification', archetype: 'FIGURE_CLASSIFICATION' },
  4: { name: 'Analytical Reasoning', archetype: 'FIGURE_COUNTING' },
  5: { name: 'Mirror-Images', archetype: 'MIRROR_IMAGE' },
  6: { name: 'Water-Images', archetype: 'WATER_IMAGE' },
  7: { name: 'Spotting Out The Embedded Figure', archetype: 'EMBEDDED_FIGURE' },
  8: { name: 'Completion Of Incomplete Pattern', archetype: 'PATTERN_COMPLETION' },
  9: { name: 'Figure Matrix', archetype: 'FIGURE_MATRIX' },
  10: { name: 'Paper Folding', archetype: 'PAPER_FOLDING' },
  11: { name: 'Paper Cutting', archetype: 'PAPER_CUTTING' },
  12: { name: 'Rule Detection', archetype: 'RULE_DETECTION' },
  13: { name: 'Grouping Of Identical Figures', archetype: 'FIGURE_GROUPING' },
  14: { name: 'Cubes And Dice', archetype: 'CUBES_AND_DICE' },
  15: { name: 'Dot Situation', archetype: 'DOT_SITUATION' },
  16: { name: 'Construction Of Squares And Triangles', archetype: 'CONSTRUCTION_OF_SHAPES' },
  17: { name: 'Figure Formation & Analysis', archetype: 'FIGURE_FORMATION' },
};

interface Row {
  page: number; chapter: string; exercise: string; number: number; directions: string; tag: string;
  status: string; optionLabels: string[]; crops: Record<string, string>; key: string | null; explanation: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  const rows: Row[] = JSON.parse(fs.readFileSync(path.join(FIGURE_DIR, 'manifest.json'), 'utf8'));

  // Existing chapter ordinals from the last text ingestion; prefer the NON-VERBAL occurrence when a
  // name appears twice (the verbal and non-verbal parts both have Analogy and Classification).
  const b = await bookQuestionsRepository.getBook(key);
  const job = b?.lastIngestionJobId ? await bookQuestionsRepository.getJob(b.lastIngestionJobId) : null;
  const prev = (job?.perChapter || []).map((c) => ({ name: c.name, ordinal: c.ordinal }));
  const ordinalFor = (n: number): number => {
    const matches = prev.filter((c) => norm(c.name) === norm(NONVERBAL[n].name)).sort((x, y) => y.ordinal - x.ordinal);
    return matches.length ? matches[0].ordinal : 100 + n; // figure-only chapter
  };

  const bucket = firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET);
  const now = new Date().toISOString();
  const reasons: Record<string, number> = {};
  const byChapter: Record<string, { usable: number; total: number }> = {};
  const docs: any[] = [];

  for (const r of rows) {
    const exNum = parseInt((r.exercise || '').match(/^\d+/)?.[0] || '', 10);
    const ch = NONVERBAL[exNum];
    const id = createHash('sha256').update(`${key}|figure|${r.exercise}|${r.number}`).digest('hex').slice(0, 24);
    const labels = (r.optionLabels || []).map(String);
    const answerIndex = r.key ? labels.indexOf(String(r.key).trim()) : -1;

    let quarantineReason: string | undefined;
    if (!ch) quarantineReason = 'figure_unknown_exercise';
    else if (r.status !== 'OK') quarantineReason = 'figure_needs_review';
    else if (!r.key) quarantineReason = 'no_answer_key';
    else if (answerIndex < 0) quarantineReason = 'answer_not_in_options';
    if (quarantineReason) reasons[quarantineReason] = (reasons[quarantineReason] || 0) + 1;

    const chapterName = ch?.name || r.chapter || 'Non-Verbal (unmapped)';
    const chapterOrdinal = ch ? ordinalFor(exNum) : 199;
    const tally = (byChapter[`${chapterOrdinal} ${chapterName}`] ??= { usable: 0, total: 0 });
    tally.total++; if (!quarantineReason) tally.usable++;

    // Crops go up only for accepted segmentations; a REVIEW question has none to store.
    const figure: { problem: string[]; options: Record<string, string> } = { problem: [], options: {} };
    const cropHash = createHash('sha256');
    if (r.status === 'OK') {
      for (const [slot, file] of Object.entries(r.crops).sort()) {
        const local = path.join(FIGURE_DIR, 'crops', file);
        const dest = `private/book_figures/${key}/${id}/${slot}.png`;
        cropHash.update(fs.readFileSync(local));
        if (slot.startsWith('prob')) figure.problem.push(dest); else figure.options[slot.slice(3)] = dest;
        if (!dryRun) await bucket.upload(local, { destination: dest, metadata: { contentType: 'image/png', cacheControl: 'private, max-age=0' } });
      }
    }

    docs.push({
      id, bookId: key, subject: 'REASONING',
      chapterName, chapterOrdinal, chapterId: `${key}:ch${chapterOrdinal}`,
      sourceSection: `EXERCISE ${r.exercise}`, sourceSectionIndex: 1, questionNumber: r.number,
      sourcePdfPage: r.page,
      stem: r.directions || `Non-verbal question ${r.number} (figures).`,
      options: labels.map((l) => `Figure (${l})`),
      answerKey: r.key ?? undefined,
      answerIndex: answerIndex >= 0 ? answerIndex : undefined,
      solution: r.explanation ?? undefined,
      examTag: r.tag || undefined,
      figure,
      extractionSource: 'figure',
      status: quarantineReason ? 'QUARANTINED' : 'CLASSIFIED',
      quarantineReason,
      archetype: quarantineReason ? undefined : ch!.archetype,
      classificationVersion: quarantineReason ? undefined : 'figure-chapter-v1',
      originalQuestionHash: cropHash.digest('hex'),
      extractionVersion: EXTRACTION_VERSION,
      jobId: `figjob_${key}_${Date.now()}`,
      createdAt: now, updatedAt: now,
    });
  }

  const usable = docs.filter((d) => d.status === 'CLASSIFIED').length;
  console.log(`${dryRun ? '[dry run] ' : ''}${key}: ${docs.length} figure questions | usable ${usable} | quarantined ${docs.length - usable}`);
  console.log('  quarantine reasons:', JSON.stringify(reasons));
  for (const [ch, t] of Object.entries(byChapter).sort((a, b2) => parseInt(a[0]) - parseInt(b2[0]))) console.log(`   ${ch.padEnd(46)} ${String(t.usable).padStart(4)}/${t.total}`);
  if (!dryRun) {
    await bookQuestionsRepository.writeQuestions(docs as any);
    console.log(`  wrote ${docs.length} rows; crops uploaded to private/book_figures/${key}/`);
  }
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
