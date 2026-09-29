/**
 * Step 09 — classify a book's extracted questions (book-variant engine, phase 2).
 *
 *   1. maps every chapter to each exam's canonical syllabus node (phrase-verified);
 *   2. derives each chapter's fixed taxonomy (subtopics + archetypes);
 *   3. classifies every extracted question into it (concepts, skills, difficulty profile, strategy,
 *      generation constraints, fingerprint).
 * Resumable: questions already CLASSIFIED at the current version are skipped unless --force.
 *
 * Usage:
 *   npx tsx scripts/reference/books/09-classify-book-questions.ts <bookKey>
 *     [--exams SSC_CGL,SSC_CHSL,SSC_MTS,IBPS_PO] [--chapters 10,3] [--concurrency 3] [--force] [--skip-mapping]
 */
import 'dotenv/config';
import { bookClassificationService } from '../../../src/services/books/bookClassification.service';

const args = process.argv.slice(2);
const bookId = args[0];
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const exams = (opt('--exams') || 'SSC_CGL,SSC_CHSL,SSC_MTS,IBPS_PO').split(',').map((s) => s.trim()).filter(Boolean);
const only = opt('--chapters')?.split(',').map(Number);
const concurrency = Math.max(1, Number(opt('--concurrency') || 3));
const force = args.includes('--force');

(async () => {
  if (!bookId) throw new Error('usage: 09-classify-book-questions.ts <bookKey> [...]');
  const chapters = (await bookClassificationService.chapters(bookId)).filter((c) => !only || only.includes(c.ordinal));
  console.log(`${bookId}: ${chapters.length} chapters with usable questions`);

  if (!args.includes('--skip-mapping')) {
    const summary = await bookClassificationService.mapChapters(bookId, exams);
    for (const [exam, s] of Object.entries(summary)) console.log(`  syllabus ${exam}: mapped=${s.mapped} notInSyllabus=${s.notInSyllabus} needsReview=${s.unverified}`);
  }

  let totalClassified = 0, totalFailed = 0, totalSkipped = 0;
  const queue = [...chapters];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const r = await bookClassificationService.classifyChapter(bookId, c, { force });
        totalClassified += r.classified; totalFailed += r.failed; totalSkipped += r.skipped;
        console.log(`  ${String(c.ordinal).padStart(2)}. ${c.name.padEnd(40)} classified=${r.classified} failed=${r.failed} skipped=${r.skipped}`);
      } catch (e: any) {
        console.log(`  ${String(c.ordinal).padStart(2)}. ${c.name.padEnd(40)} ERROR ${String(e?.message || e).slice(0, 160)}`);
      }
    }
  }));
  console.log(`DONE ${bookId}: classified=${totalClassified} failed=${totalFailed} skipped(already current)=${totalSkipped}`);
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
