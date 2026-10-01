/**
 * Printed keys can be wrong (Lucent Science Q360/361/364, checked by hand 1 Oct 2026). Export a
 * book's usable book-keyed rows for ai_verify_keys.py audit: two models solve each blind; a row is
 * taken out of service only when BOTH name the same option and it is not the printed one.
 *
 *   npx tsx scripts/reference/books/key-audit-targets.ts <bookKey>  → ai_keys/audit_<book>.json
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';

(async () => {
  const book = process.argv[2];
  const rows = (await db.collection('book_questions').where('bookId', '==', book).where('status', '==', 'CLASSIFIED').get()).docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => r.extractionSource !== 'figure' && !String(r.answerSource || '').startsWith('ai-') && r.answerKey && (r.options || []).length >= 4);
  const out = rows.map((r) => ({ id: r.id, bookId: book, subject: r.subject, chapterName: r.chapterName, directions: r.sharedDirections || '', stem: r.stem, options: r.options, printed: r.answerKey }));
  const dir = path.resolve(process.cwd(), '..', 'dataset_staging', 'ai_keys');
  fs.writeFileSync(path.join(dir, `audit_${book}.json`), JSON.stringify(out, null, 1));
  console.log(`${book}: ${out.length} printed keys to audit`);
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
