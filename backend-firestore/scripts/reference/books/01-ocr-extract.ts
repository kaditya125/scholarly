/**
 * Stage 01 — OCR a Lucent scan into reviewable text on disk.
 * =========================================================
 *
 * The Lucent scans have no text layer (pdf-parse returns ~1 char/page), so extraction is vision
 * OCR. This follows the proven pattern in scripts/phase4a/ocr-48-rrb-ntpc.ts: feed small PDF
 * slices straight to Gemini as `application/pdf` (no rasterisation step), temperature 0,
 * transcribe-only prompt that forbids prior knowledge.
 *
 * Persists NOTHING to Firestore or Pinecone. Output is JSON per slice under
 *   dataset_staging/lucent/<book>/ocr/pXXXX-pYYYY.json
 * plus a draft source record at dataset_staging/lucent/<book>/source.json — meant to be read by
 * a human before stage 02.
 *
 *   npx tsx scripts/reference/books/01-ocr-extract.ts --book=gk --file=../dataset_staging/lucent/gk/source.pdf
 *   optional: --from=1 --to=40 --slice=2 --force
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { assertAIEnabled } from '../../../src/config/env';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';
import { resolveBook, findWatermarks, ReferenceSourceRecord } from './contract';

// ── args ────────────────────────────────────────────────────────────────────
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const has = (k: string) => process.argv.includes(`--${k}`);

const book = resolveBook(arg('book') || '');
const fileArg = arg('file');
if (!fileArg) {
  console.error('Pass --file=<path to the licensed source PDF>');
  process.exit(1);
}
const SRC_PDF = path.resolve(process.cwd(), fileArg);
const SLICE = Math.max(1, Number(arg('slice') || 1)); // PDF pages per OCR call (1 = smallest output, best page attribution)
const FORCE = has('force');
const PACING_MS = Number(process.env.LUCENT_OCR_PACING_MS || 2500);
const CONCURRENCY = Math.max(1, Number(arg('concurrency') || process.env.LUCENT_OCR_CONCURRENCY || 3));
const MAX_OUTPUT_TOKENS = Number(process.env.LUCENT_OCR_MAX_TOKENS || 16000);
const THINKING_BUDGET = Number(process.env.LUCENT_OCR_THINKING_BUDGET || 0);
/** Per-PDF-page sanity cap on transcription length — a 2-up book-page pair is ~10-15k chars of real text. */
const DEGENERATE_CHARS = Number(process.env.LUCENT_OCR_DEGENERATE_CHARS || 40000);

const OUT_DIR = path.resolve(process.cwd(), '..', 'dataset_staging', ...book.stagingDir.split('/'));
// LUCENT_OCR_SUBDIR writes a re-OCR somewhere other than the live ocr/ folder, so it can be
// compared against the current pages before replacing any of them.
const OCR_DIR = path.join(OUT_DIR, process.env.LUCENT_OCR_SUBDIR || 'ocr');

const PROMPT = `You are transcribing scanned pages of the printed reference book "${book.title}"
(${book.publisher}${book.author ? ', ' + book.author : ''}). Transcribe EXACTLY what is printed on these page images.

Return GitHub-flavoured Markdown:
- Preserve every heading and its level. Book chapter titles -> "#", section headings -> "##",
  sub-headings -> "###". Keep the printed numbering (e.g. "1.", "1.1", "(a)").
- Reproduce lists as Markdown lists, preserving order.
- For a TABLE, write ONE LINE PER ROW as "- col1 value | col2 value | col3 value" using a single
  " | " between cells. Put the column names as the first such line. Do NOT draw an ASCII/pipe
  grid, do NOT pad cells with spaces to align columns, do NOT add separator dashes. Keep every
  row and every column; never flatten, summarise or reorder rows.
- Keep scientific notation exactly: H2O as H₂O, CO2 as CO₂, m/s² , 10⁻⁹ , °C , μ , Ω , etc.
- Mark an unreadable word as [illegible]. Do NOT guess it.
- At the top of the FIRST page's output, if a running page number is visible, note it as
  "<!-- book-page: N -->".

HARD RULES:
- Transcribe only. Do NOT summarise, complete, correct, or add anything not printed on the page.
- You may already know this book's contents. Ignore that. If it is not printed on THESE images,
  it must not appear in your output.
- A watermark / website URL / "downloaded from ..." / Telegram-WhatsApp promo / scan-tool stamp
  is an overlay, NOT the book's text — so do not transcribe it as body text. But if such an
  overlay physically covers printed book text so you cannot read it with confidence, write
  ${'`[obscured-by-overlay]`'} for that span. Do NOT guess the hidden words and do NOT reconstruct
  them. Do not crop or describe the watermark either — just leave it out of the body and mark
  what it covers.
- Output the Markdown only. No preamble, no commentary.`;

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

async function ocrSlice(
  ai: ReturnType<typeof createGoogleGenAIClient>,
  bytes: Buffer,
  label: string,
  pages: number,
  retries = Math.max(1, Number(process.env.LUCENT_OCR_RETRIES || 7)),
): Promise<{ text: string; finishReason: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res: any = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        // Thinking tokens count against maxOutputTokens; on equation-dense pages 2.5-flash spent the
        // whole budget thinking and returned ~1k chars with MAX_TOKENS. Transcription needs none.
        config: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingBudget: THINKING_BUDGET } },
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'application/pdf', data: bytes.toString('base64') } },
              { text: PROMPT },
            ],
          },
        ],
      });
      const text: string = res?.text ?? '';
      const finishReason: string = res?.candidates?.[0]?.finishReason ?? 'STOP';
      if (text.trim().length < 10) throw new Error('empty transcription');
      // Degenerate-generation guard: the model can loop on a table and emit a huge run of
      // repeated characters / whitespace. Reject and retry rather than persist the garbage.
      const runaway = /(.)\1{150,}/.test(text);
      const perPageCap = DEGENERATE_CHARS * pages;
      if (runaway || text.length > perPageCap) {
        throw new Error(`degenerate output (${text.length} chars${runaway ? ', repeated-char run' : ''}) — retrying`);
      }
      return { text, finishReason };
    } catch (err: any) {
      const msg = String(err?.message || err);
      const is429 = err?.status === 429 || /429|quota|rate|resource exhausted/i.test(msg);
      if (attempt === retries) throw err;
      // 429 backoff climbs steeply — the Vertex quota is shared with the live product, so on
      // contention we wait it out rather than hammer: 15s, 30s, 45s, 60s, 90s, 120s…
      const backoff = is429 ? Math.min(attempt * 15000, 120000) : attempt * 2500;
      console.warn(`   retry ${attempt}/${retries} for ${label}: ${msg.slice(0, 140)} — wait ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return { text: '', finishReason: 'ERROR' };
}

(async () => {
  assertAIEnabled('reference-book OCR');
  if (!fs.existsSync(SRC_PDF)) {
    console.error(`Source PDF not found: ${SRC_PDF}`);
    process.exit(1);
  }
  fs.mkdirSync(OCR_DIR, { recursive: true });

  const full = fs.readFileSync(SRC_PDF);
  const src = await PDFDocument.load(full);
  const pageCount = src.getPageCount();
  const from = Math.max(1, Number(arg('from') || 1));
  const to = Math.min(pageCount, Number(arg('to') || pageCount));

  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  REFERENCE OCR — ${book.title}  (${book.publisher}${book.author ? ', ' + book.author : ''})`);
  console.log(`  file:   ${SRC_PDF}`);
  console.log(`  sha256: ${sha256File(SRC_PDF)}`);
  console.log(`  pages:  ${pageCount} total | processing ${from}–${to} | ${SLICE}/call | concurrency ${CONCURRENCY}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  // Draft source record for human review (edition/year filled in after reading the first slice).
  const sourcePath = path.join(OUT_DIR, 'source.json');
  const sourceRec: ReferenceSourceRecord = fs.existsSync(sourcePath)
    ? JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
    : {
        id: book.key,
        book: book.key,
        publisher: book.publisher,
        author: book.author || '',
        book_title: book.title,
        source_filename: arg('orig-name') || path.basename(SRC_PDF), // pass --orig-name when working from a renamed copy
        source_path_at_ingest: SRC_PDF,
        edition: 'UNSPECIFIED',
        publication_year: 'UNSPECIFIED',
        language: book.language,
        source_type: 'reference_book',
        source_status: 'user-provided', // never auto-promoted to 'licensed'
        source_sha256: sha256File(SRC_PDF),
        pdf_page_count: pageCount,
        watermark_present: false, // set true below if any slice shows overlay text
        watermark_note: '',
        ingestedAt: '',
        notes: 'Draft — confirm edition/year from the title/copyright page, and set source_status only if the rights basis is actually known.',
      };
  fs.writeFileSync(sourcePath, JSON.stringify(sourceRec, null, 2));

  const ai = createGoogleGenAIClient();
  let done = 0;
  let watermarkPages = 0;

  // Build the list of slice ranges up front, then process with bounded concurrency.
  const ranges: Array<{ start: number; end: number; label: string; outFile: string }> = [];
  for (let start = from; start <= to; start += SLICE) {
    const end = Math.min(start + SLICE - 1, to);
    const label = `p${String(start).padStart(4, '0')}-p${String(end).padStart(4, '0')}`;
    ranges.push({ start, end, label, outFile: path.join(OCR_DIR, `${label}.json`) });
  }

  async function processRange(r: { start: number; end: number; label: string; outFile: string }) {
    if (fs.existsSync(r.outFile) && !FORCE) {
      console.log(`  skip  ${r.label} (exists)`);
      return;
    }
    const slice = await PDFDocument.create();
    const idxs = Array.from({ length: r.end - r.start + 1 }, (_, k) => r.start - 1 + k);
    (await slice.copyPages(src, idxs)).forEach((p) => slice.addPage(p));
    const bytes = Buffer.from(await slice.save());

    const t0 = Date.now();
    let markdown = '';
    let finishReason = 'STOP';
    try {
      ({ text: markdown, finishReason } = await ocrSlice(ai, bytes, r.label, r.end - r.start + 1));
    } catch (err: any) {
      console.log(`  ocr   ${r.label} … FAILED (${String(err?.message || err).slice(0, 110)})`);
      fs.writeFileSync(r.outFile, JSON.stringify({ book: book.key, pdfPageStart: r.start, pdfPageEnd: r.end, error: String(err?.message || err) }, null, 2));
      return;
    }

    const watermarkHits = findWatermarks(markdown);
    if (watermarkHits.length) watermarkPages++;
    const truncated = finishReason === 'MAX_TOKENS';
    fs.writeFileSync(
      r.outFile,
      JSON.stringify(
        {
          book: book.key,
          pdfPageStart: r.start,
          pdfPageEnd: r.end,
          model: 'gemini-2.5-flash',
          at: new Date().toISOString(),
          finishReason,
          truncated, // hit the output cap — stage 02 flags this page for review (content may be cut off)
          charCount: markdown.length,
          illegibleCount: (markdown.match(/\[illegible\]/g) || []).length,
          obscuredCount: (markdown.match(/\[obscured-by-overlay\]/g) || []).length,
          watermarkHits, // expected [] — the prompt keeps overlays out of the body; stage 02 flags (not fails) any that slip through
          markdown,
        },
        null,
        2,
      ),
    );
    done++;
    console.log(
      `  ocr   ${r.label} … ${markdown.length} chars, ${Date.now() - t0}ms  [${done}/${ranges.length}]` +
        `${truncated ? '  ⚠ TRUNCATED' : ''}${watermarkHits.length ? `  ⚠ ${watermarkHits.length} watermark line(s)` : ''}`,
    );
  }

  // Bounded worker pool. CONCURRENCY parallel calls, PACING_MS stagger between dispatches so we
  // never burst the rate limit. Sequential (CONCURRENCY=1) is the safe fallback.
  let cursor = 0;
  const worker = async () => {
    while (cursor < ranges.length) {
      const mine = ranges[cursor++];
      await processRange(mine);
      if (cursor < ranges.length) await new Promise((res) => setTimeout(res, PACING_MS));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ranges.length) }, () => worker()));

  // Honest provenance: record on the source that this copy carries an overlay, without hiding it.
  if (watermarkPages) {
    sourceRec.watermark_present = true;
    sourceRec.watermark_note =
      `Overlay text detected in OCR output on ${watermarkPages} slice(s) of ${path.basename(SRC_PDF)}. ` +
      `Kept out of body text by stage 01; affected pages listed by stage 02.`;
    fs.writeFileSync(sourcePath, JSON.stringify(sourceRec, null, 2));
  }

  console.log(`\n  ${done} slice(s) written to ${OCR_DIR}`);
  if (watermarkPages) {
    console.log(`  ⚠ ${watermarkPages} slice(s) had overlay/watermark text — recorded on source.json`);
    console.log(`    (watermark_present=true). Stage 02 will list the affected pages for review; it does NOT`);
    console.log(`    block the run. The book's own text on clean pages proceeds normally.`);
  }
  console.log(`  Next: npx tsx scripts/reference/books/02-validate-ocr.ts --book=${book.key}`);
  process.exit(0);
})().catch((e) => {
  console.error('OCR stage failed:', e);
  process.exit(1);
});
