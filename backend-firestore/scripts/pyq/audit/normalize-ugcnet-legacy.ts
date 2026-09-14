/**
 * Normalise the legacy UGC NET contract onto the canonical field names, and record where each
 * topic mapping came from.
 *
 * DRY RUN BY DEFAULT. `--execute` writes, and writes a backup first.
 *
 * ── Why this is a rename, not an ingestion ─────────────────────────────────────────────────
 * The Phase 2 audit reported UGC NET at 4.9% question text, 0% answers and 0% topic coverage,
 * which read as a corpus needing 27,000 embeddings and an LLM topic-labelling pass. That reading
 * was wrong. 26,291 records were written by an earlier ingestion using `text` / `correctOption`
 * instead of `questionText` / `correctAnswer`, and every one of them already carries
 * `unitName` / `unitCode` / `unitNumber` — unit-level syllabus mapping that no other exam in this
 * corpus has. 100% of them, not a sample.
 *
 * So nothing here is inferred. Every value written is copied from a field the source ingestion
 * already populated, which is why this needs no embedding quota and no model.
 *
 * ── Purely additive ────────────────────────────────────────────────────────────────────────
 * The legacy fields are left exactly where they are. This only adds the canonical aliases beside
 * them, so the operation is reversible by deleting the added keys and loses nothing if the
 * mapping later turns out to be wrong.
 *
 * ── The one thing it refuses to launder ────────────────────────────────────────────────────
 * 2,613 records (87% of Sanskrit, 84% of Hindi) hold text that decoded through the wrong code
 * page. Their text is still copied across — dropping real questions would be worse — but they are
 * marked `textIntegrity: 'SUSPECT_ENCODING'` so nothing downstream treats them as clean, and so a
 * re-decoding pass can find them later. Promoting mojibake to `questionText` silently would make
 * them indistinguishable from good records the moment they are embedded.
 */
import { firebaseApp } from '../../../src/config/firebase';
import * as fs from 'fs';
import * as path from 'path';

const EXECUTE = process.argv.includes('--execute');
const OUT_DIR = path.join(__dirname, 'out');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';

/** Latin-1 mojibake from a UTF-8 source, with no surviving Devanagari to vouch for it. */
function looksMojibake(s: string): boolean {
  if (!s) return false;
  const markers = (s.match(/[ÃÂØÙÖÜúûÛ×¸Ÿ]/g) || []).length;
  const devanagari = (s.match(/[ऀ-ॿ]/g) || []).length;
  return markers >= 3 && markers / s.length > 0.08 && devanagari === 0;
}

/**
 * Where a topic mapping came from. The distinction matters most when the corpus is later used to
 * shape generated questions: a unit read off the source paper is evidence, a unit guessed by a
 * model is a hypothesis, and a blueprint built on the second while believing the first is how a
 * generated test drifts away from the real exam without anyone noticing.
 */
export type TopicSource =
  | 'OFFICIAL'   // validated against an ingested official syllabus document
  | 'CANONICAL'  // stated by the source paper/ingestion itself
  | 'CURATED'    // assigned by a human reviewer
  | 'INFERRED'   // assigned by a model
  | 'UNMAPPED';

async function main() {
  console.log(`=== UGC NET LEGACY NORMALISATION === ${EXECUTE ? 'EXECUTE' : 'DRY RUN (pass --execute to write)'}\n`);
  const db = firebaseApp.firestore();

  const rows: { docId: string; d: any }[] = [];
  let last: any = null;
  while (true) {
    let q: FirebaseFirestore.Query = db.collection('pyq_questions').where('examId', '==', 'UGC_NET').orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const s = await q.get();
    if (s.empty) break;
    for (const doc of s.docs) rows.push({ docId: doc.id, d: doc.data() as any });
    last = s.docs[s.docs.length - 1];
    if (s.size < 2000) break;
  }
  console.log(`UGC NET records: ${rows.length}`);

  const updates: { docId: string; patch: Record<string, any> }[] = [];
  const stats = {
    alreadyCanonical: 0, normalised: 0, textCopied: 0, answerCopied: 0,
    topicFromUnit: 0, sourceCopied: 0, suspectEncoding: 0, cleanText: 0, skippedNoText: 0,
    topicSource: {} as Record<string, number>,
  };

  for (const { docId, d } of rows) {
    const patch: Record<string, any> = {};

    // Records already on the canonical contract only need mapping provenance stated.
    if (has(d.questionText)) {
      stats.alreadyCanonical++;
      if (!has(d.topicSource)) {
        const src: TopicSource = has(d.topic) ? 'CANONICAL' : 'UNMAPPED';
        patch.topicSource = src;
        patch.topicMappingStatus = has(d.topic) ? 'MAPPED' : 'UNMAPPED';
        patch.mappingConfidence = has(d.topic) ? 1 : 0;
        stats.topicSource[src] = (stats.topicSource[src] ?? 0) + 1;
      }
      if (Object.keys(patch).length) updates.push({ docId, patch });
      continue;
    }

    if (!has(d.text)) { stats.skippedNoText++; continue; }

    // ── the rename ────────────────────────────────────────────────────────────────────────────
    const suspect = looksMojibake(String(d.text));
    patch.questionText = d.text;
    patch.textIntegrity = suspect ? 'SUSPECT_ENCODING' : 'OK';
    stats.textCopied++;
    if (suspect) stats.suspectEncoding++; else stats.cleanText++;

    if (has(d.correctOption)) { patch.correctAnswer = d.correctOption; stats.answerCopied++; }

    // Unit mapping is stated by the source ingestion, so it is CANONICAL — not OFFICIAL, because
    // no official UGC NET syllabus document exists in the corpus to validate it against.
    if (has(d.unitName)) {
      patch.topic = d.unitName;
      patch.topicSource = 'CANONICAL' as TopicSource;
      patch.topicMappingStatus = 'MAPPED';
      patch.mappingConfidence = 1;
      patch.unitName = d.unitName;
      if (has(d.unitCode)) patch.unitCode = d.unitCode;
      if (has(d.unitNumber)) patch.unitNumber = d.unitNumber;
      stats.topicFromUnit++;
      stats.topicSource['CANONICAL'] = (stats.topicSource['CANONICAL'] ?? 0) + 1;
    } else {
      patch.topicSource = 'UNMAPPED' as TopicSource;
      patch.topicMappingStatus = 'UNMAPPED';
      patch.mappingConfidence = 0;
      stats.topicSource['UNMAPPED'] = (stats.topicSource['UNMAPPED'] ?? 0) + 1;
    }

    if (has(d.sourcePaperId) && !has(d.sourceId)) { patch.sourceId = d.sourcePaperId; stats.sourceCopied++; }
    if (has(d.sourceTier) && !has(d.sourceType)) patch.sourceType = d.sourceTier;
    if (has(d.marks) && !has(d.marks)) patch.marks = d.marks;

    // A record that has come through this pass is on the canonical contract; say so, so a later
    // run can tell normalised records from ones the original ingestion wrote.
    patch.schemaNormalisedAt = Date.now();
    patch.schemaNormalisedFrom = 'ugcnet-legacy-v1';

    stats.normalised++;
    updates.push({ docId, patch });
  }

  console.log('\n--- what would change ---');
  console.log(`  already on canonical contract     ${stats.alreadyCanonical}`);
  console.log(`  legacy records normalised         ${stats.normalised}`);
  console.log(`    questionText copied from text   ${stats.textCopied}`);
  console.log(`      of which clean                ${stats.cleanText}`);
  console.log(`      of which SUSPECT_ENCODING     ${stats.suspectEncoding}`);
  console.log(`    correctAnswer from correctOption ${stats.answerCopied}`);
  console.log(`    topic from unitName             ${stats.topicFromUnit}`);
  console.log(`    sourceId from sourcePaperId     ${stats.sourceCopied}`);
  console.log(`  skipped (no text at all)          ${stats.skippedNoText}`);
  console.log(`\n  topicSource distribution: ${JSON.stringify(stats.topicSource)}`);
  console.log(`  documents to write: ${updates.length}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'ugcnet-normalisation-plan.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), executed: EXECUTE, stats, sample: updates.slice(0, 5) }, null, 2));

  if (!EXECUTE) {
    console.log('\nDRY RUN — nothing written. Re-run with --execute to apply.');
    return;
  }

  const backupPath = path.join(OUT_DIR, `ugcnet-backup-${STAMP}.jsonl`);
  const bk = fs.createWriteStream(backupPath);
  for (const { docId, d } of rows) {
    bk.write(JSON.stringify({
      docId, questionText: d.questionText ?? null, correctAnswer: d.correctAnswer ?? null,
      topic: d.topic ?? null, topicSource: d.topicSource ?? null, sourceId: d.sourceId ?? null,
      sourceType: d.sourceType ?? null,
    }) + '\n');
  }
  await new Promise<void>((r) => bk.end(r));
  console.log(`\nbackup of pre-change values -> ${backupPath}`);

  const col = db.collection('pyq_questions');
  let written = 0;
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 400)) batch.set(col.doc(u.docId), u.patch, { merge: true });
    await batch.commit();
    written += Math.min(400, updates.length - i);
    process.stderr.write(`\r  written ${written}/${updates.length}`);
  }
  process.stderr.write('\n');
  console.log(`WROTE ${written} documents.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
