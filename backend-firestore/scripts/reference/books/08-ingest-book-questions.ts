/**
 * Step 08 — extract a reference book's exercise MCQs into the private book bank.
 *
 * Reads the book's OCR pages from dataset_staging (produced by steps 01–02) and runs
 * bookIngestionService, which stores every question with its answer key in `book_questions`
 * (server-only) and records a `book_ingestion_jobs` entry.
 *
 * Runs here rather than behind an HTTP upload because the OCR output lives in dataset_staging on
 * the machine that ran steps 01–02; an upload → OCR → ingest endpoint is a later phase.
 *
 * Usage:
 *   npx tsx scripts/reference/books/08-ingest-book-questions.ts <bookKey> --attested-by <who> [--dry-run]
 * `--attested-by` records who confirmed the licence for this book (required for a real run).
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { BOOKS } from './contract';
import { bookIngestionService } from '../../../src/services/books/bookIngestion.service';
import type { OcrPage } from '../../../src/services/books/bookQuestionParser';
import type { BookSubject } from '../../../src/repositories/bookQuestions.repository';

const args = process.argv.slice(2);
const key = args[0];
const dryRun = args.includes('--dry-run');
const attestedBy = args.includes('--attested-by') ? args[args.indexOf('--attested-by') + 1] : undefined;

const SUBJECT_BY_DOMAIN: Record<string, BookSubject> = { aptitude: 'QUANT', reasoning: 'REASONING', english: 'ENGLISH', gk: 'GK', general_knowledge: 'GK', science: 'GS', general_studies: 'GS' };
const RUNNING_HEADERS = /^(QUANTITATIVE APTITUDE|Reasoning|REASONING)$/;
/** Books whose questions aren't under EXERCISE headings (see ParseOptions.layout). */
const LAYOUT: Record<string, { layout: 'answer-blocks' | 'english-exercises'; partHeading?: RegExp }> = {
  lucent_science: { layout: 'answer-blocks', partHeading: /^(Physics|Chemistry|Biology|Botany|Zoology|Computer|Astronomy|Environment|Ecology)$/i },
  lucent_english: { layout: 'english-exercises' },
};

(async () => {
  const book = BOOKS[key];
  if (!book) throw new Error(`Unknown book "${key}". Known: ${Object.keys(BOOKS).join(', ')}`);
  if (!dryRun && !attestedBy) throw new Error('A real run needs --attested-by <who confirmed the licence>.');
  const subject = SUBJECT_BY_DOMAIN[book.domain];
  if (!subject) throw new Error(`No subject mapping for domain "${book.domain}"`);

  const dir = path.resolve(process.cwd(), '..', 'dataset_staging', ...book.stagingDir.split('/'), 'ocr');
  const pages: OcrPage[] = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

  const result = await bookIngestionService.ingest({
    dryRun,
    pages,
    parse: { chapterHeading: book.chapterHeading, runningHeader: RUNNING_HEADERS, ...LAYOUT[key] },
    book: {
      bookId: book.key,
      title: book.title,
      publisher: book.publisher,
      author: book.author,
      language: book.language,
      subject,
      licenseStatus: 'licensed',
      licenseAttestation: attestedBy ? { attestedBy, attestedAt: new Date().toISOString(), note: 'Owner confirmed Sadhya holds a licence for this book.' } : undefined,
    },
  });

  console.log(`\n${dryRun ? '[dry run] ' : ''}${key}: ${result.status}  job=${result.jobId}`);
  console.log(`  chapters=${result.counts.chapters} questions=${result.counts.questions} extracted=${result.counts.extracted} quarantined=${result.counts.quarantined} superseded=${result.counts.superseded}`);
  console.log(`  quarantine reasons: ${JSON.stringify(result.quarantineReasons)}`);
  for (const c of result.perChapter) console.log(`   ${String(c.ordinal).padStart(2)}. ${c.name.padEnd(42)} ${String(c.extracted).padStart(4)}/${c.questions}`);
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
