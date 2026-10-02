/**
 * Lucent English open exercise items (no options, no printed key) → dataset_staging/ai_keys/open.json,
 * for ai_verify_keys.py build: an AI-written MCQ, verified blind by a second model.
 *
 *   npx tsx scripts/reference/books/ai-open-targets.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';

(async () => {
  const rows = (await db.collection('book_questions').where('bookId', '==', 'lucent_english').where('quarantineReason', '==', 'no_answer_key').get()).docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => r.status === 'QUARANTINED' && !(r.options || []).length && String(r.stem || '').trim().length >= 8);
  const out = rows.map((r) => ({ id: r.id, chapterName: r.chapterName, directions: r.sharedDirections || '', stem: String(r.stem).trim() }));
  const dir = path.resolve(process.cwd(), '..', 'dataset_staging', 'ai_keys');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'open.json'), JSON.stringify(out, null, 1));
  console.log(`open items ${out.length}`);
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
