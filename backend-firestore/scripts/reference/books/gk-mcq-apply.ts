/**
 * Load the SSC-pattern General Awareness MCQs written from Lucent's GK (gk_mcq_build.py) into the
 * private book bank as book 'lucent_gk'.
 *
 * An MCQ is accepted only when ALL hold:
 *   - four distinct, non-empty options and an answer letter among them;
 *   - its evidence quote appears verbatim (normalised) in the passage it was written from;
 *   - qwen3-235b, answering blind, picked the same option.
 * Chapters follow the SSC General Awareness areas the passages were already sorted into.
 * Rows: status EXTRACTED (09-classify-book-questions.ts classifies and maps them to the syllabus),
 * optionsSource 'ai-generated', answerSource 'ai-verified', evidence + sourceChunkId kept.
 * A real run needs --attested-by: who confirmed Sadhya's licence for the source book.
 *
 *   npx tsx scripts/reference/books/gk-mcq-apply.ts [--apply --attested-by <who>]
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { bookQuestionsRepository } from '../../../src/repositories/bookQuestions.repository';
import { hashQuestion } from '../../../src/services/books/bookQuestionParser';

const apply = process.argv.includes('--apply');
const attestedBy = process.argv.includes('--attested-by') ? process.argv[process.argv.indexOf('--attested-by') + 1] : undefined;
const BOOK = 'lucent_gk';
const GK = path.resolve(process.cwd(), '..', 'dataset_staging', 'lucent', 'gk');
const CHAPTERS: Record<string, { ordinal: number; name: string }> = {
  History: { ordinal: 1, name: 'History' },
  Geography: { ordinal: 2, name: 'Geography' },
  'Indian Polity': { ordinal: 3, name: 'Indian Polity' },
  Economy: { ordinal: 4, name: 'Economy' },
  'General Science': { ordinal: 5, name: 'General Science' },
  'Static GK': { ordinal: 6, name: 'Static GK' },
};
const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const lines = (f: string) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

(async () => {
  if (apply && !attestedBy) throw new Error('A real run needs --attested-by <who confirmed the licence for Lucent GK>.');
  const raw = JSON.parse(fs.readFileSync(path.join(GK, 'chunks.enriched.json'), 'utf8'));
  const chunks = new Map<string, any>((Array.isArray(raw) ? raw : raw.chunks).map((c: any) => [c.chunk_id, c]));
  const check = new Map(lines(path.join(GK, 'mcq', 'check.jsonl')).map((c: any) => [c.id, c.answer]));
  const now = new Date().toISOString();
  const jobId = `bookjob_${BOOK}_ai_${Date.now()}`;
  const why: Record<string, number> = {};
  const skip = (r: string) => { why[r] = (why[r] || 0) + 1; };
  const docs: any[] = [];
  const counter: Record<number, number> = {};

  // write.jsonl plus the per-region shard files (write.s0.jsonl, …)
  const writeFiles = fs.readdirSync(path.join(GK, 'mcq')).filter((f) => /^write(\.s\d+)?\.jsonl$/.test(f));
  for (const w of writeFiles.flatMap((f) => lines(path.join(GK, 'mcq', f)))) {
    const c = chunks.get(w.id);
    const ch = c && CHAPTERS[c.category];
    if (!ch) { skip('passage outside the GA areas'); continue; }
    (w.items || []).forEach((it: any, i: number) => {
      const mid = `${w.id}#${i}`;
      const options: string[] = (it.options || []).map((o: unknown) => String(o ?? '').trim());
      const idx = 'abcd'.indexOf(String(it.answer || '').toLowerCase());
      if (options.length !== 4 || options.some((o) => !o) || new Set(options.map(norm)).size < 4 || idx < 0) return skip('malformed');
      if (norm(it.evidence).split(' ').length < 5 || !norm(c.text).includes(norm(it.evidence))) return skip('evidence not verbatim in the passage');
      if (!check.has(mid)) return skip('not yet checked');
      if (check.get(mid) !== 'abcd'[idx]) return skip('blind check disagreed');
      const n = (counter[ch.ordinal] = (counter[ch.ordinal] || 0) + 1);
      const stem = String(it.question).trim();
      docs.push({
        id: createHash('sha256').update(`${BOOK}|ai|${mid}`).digest('hex').slice(0, 24),
        bookId: BOOK, subject: 'GK', chapterName: ch.name, chapterOrdinal: ch.ordinal, chapterId: `${BOOK}:ch${ch.ordinal}`,
        sourceSection: [c.chapter, c.topic].filter(Boolean).join(' / ') || ch.name, sourceSectionIndex: 1, questionNumber: n,
        sourcePdfPage: Number(c.pdf_page) || undefined,
        stem, options, answerKey: 'abcd'[idx], answerIndex: idx,
        answerSource: 'ai-verified', optionsSource: 'ai-generated',
        aiKey: { models: [w.model || 'gemini-3-flash-preview', 'qwen3-235b-a22b-instruct-2507'], method: 'written from the passage with a verbatim evidence quote; answered blind by the second model', at: now },
        evidence: String(it.evidence).trim(), sourceChunkId: w.id,
        originalQuestionHash: hashQuestion(stem, options), extractionSource: 'text',
        status: 'EXTRACTED', extractionVersion: 'gk-ai-mcq-v1', jobId, createdAt: now, updatedAt: now,
      });
    });
  }
  const per = Object.values(CHAPTERS).map((ch) => ({ ordinal: ch.ordinal, name: ch.name, questions: counter[ch.ordinal] || 0, extracted: counter[ch.ordinal] || 0 }));
  console.log(`${apply ? '' : '[dry run] '}${BOOK}: ${docs.length} verified MCQs ${JSON.stringify(Object.fromEntries(per.map((p) => [p.name, p.extracted])))}`);
  console.log('  not used:', JSON.stringify(why));
  if (!apply) process.exit(0);

  await bookQuestionsRepository.upsertBook({
    bookId: BOOK, title: "Lucent's General Knowledge", publisher: 'Lucent Publication', language: 'English', subject: 'GK',
    licenseStatus: 'licensed', licenseAttestation: { attestedBy: attestedBy!, attestedAt: now, note: 'Owner confirmed Sadhya holds a licence for this book. Questions are AI-written from its text (verbatim evidence, blind-checked).' },
    lastIngestionJobId: jobId, stats: { chapters: per.length, questions: docs.length, extracted: docs.length, quarantined: 0 },
  } as any);
  await bookQuestionsRepository.createJob({
    jobId, bookId: BOOK, status: 'COMPLETED' as any, extractionVersion: 'gk-ai-mcq-v1', startedAt: now, finishedAt: new Date().toISOString(),
    counts: { chapters: per.length, questions: docs.length, extracted: docs.length, quarantined: 0, superseded: 0 }, perChapter: per,
  });
  await bookQuestionsRepository.writeQuestions(docs as any);
  console.log(`  wrote ${docs.length} rows; job ${jobId}`);
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
