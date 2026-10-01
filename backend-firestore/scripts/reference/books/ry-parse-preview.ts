/**
 * Local preview of the 'typed-sections' parse for ry_ssc_reasoning — no Firestore, no writes.
 * Prints the per-chapter pairing report and quarantine counts, and dumps parsed questions to
 * dataset_staging/rakesh_yadav/ssc_reasoning/parse_preview.json for spot checks.
 *
 *   node_modules/.bin/tsx scripts/reference/books/ry-parse-preview.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { BOOKS } from './contract';
import { parseTypedBook, TypedSectionsReport, describeCycles } from '../../../src/services/books/typedSectionsLayout';
import type { OcrPage } from '../../../src/services/books/bookQuestionParser';

const book = BOOKS.ry_ssc_reasoning;
const dir = path.resolve(process.cwd(), '..', 'dataset_staging', ...book.stagingDir.split('/'));
const pages: OcrPage[] = fs.readdirSync(path.join(dir, 'ocr')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, 'ocr', f), 'utf8')));

const runningHeader = /^(?:Rakesh Yadav Readers Publication.*|.*Best PDF.*|.*Nitin Gupta PDF.*|PRUDENCE COACHING CENTRE|By The Team of The Best Faculties.*|\.{2,}\s*the dais.*|641, Ground Floor.*|Join Prudence.*|Upcoming Batches.*|FOR ENQUIRY.*|[\d,\s-]{20,}|Telegram|Whats\s*app|Instagram|Apps|You\s*tube)$/i;
if (process.argv.includes('--cycles')) {
  for (const l of describeCycles(pages, { chapterHeading: book.chapterHeading, runningHeader, layout: 'typed-sections', bookPageOffset: 3 })) console.log(l);
}
const report: TypedSectionsReport[] = [];
const { chapters, questions } = parseTypedBook(pages, { chapterHeading: book.chapterHeading, runningHeader, layout: 'typed-sections', bookPageOffset: 3 }, report);

console.log(`pages ${pages.length} | chapters ${chapters.length} | questions ${questions.length} | usable ${questions.filter((q) => !q.quarantineReason).length}`);
for (const r of report) {
  const qs = questions.filter((q) => q.chapterName === r.chapter);
  console.log(`\n${r.chapter}: cycles ${r.cycles}, sections paired ${r.sectionsPaired}, key conflicts ${r.keyConflicts}, usable ${qs.filter((q) => !q.quarantineReason).length}/${qs.length}`);
  for (const m of r.sectionsKeyCountMismatch) console.log(`   unpaired: ${m}`);
  const reasons: Record<string, number> = {};
  for (const q of qs) if (q.quarantineReason) reasons[q.quarantineReason] = (reasons[q.quarantineReason] || 0) + 1;
  if (Object.keys(reasons).length) console.log(`   quarantine: ${JSON.stringify(reasons)}`);
}
fs.writeFileSync(path.join(dir, 'parse_preview.json'), JSON.stringify(questions, null, 1));
