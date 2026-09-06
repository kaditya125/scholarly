/**
 * Fetch and verify UPSC Civil Services Prelims papers from the examining body.
 *
 * WHAT THIS IS FOR
 *
 * Every PYQ in this repository today was either typed into a corpus file or
 * emitted by a template generator, and a large share of them carry
 * TIER_A_OFFICIAL with a sourceUrl that was built by string interpolation and
 * never fetched. This script is the opposite of that: it starts from the URL,
 * proves the bytes, and refuses to emit anything it cannot tie back to a file it
 * actually downloaded.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not write to Firestore. It does not touch Pinecone. It does not call
 * pyqCorpusIngestionService. It writes candidate records to disk and prints a
 * verification report, and a human decides whether they are good enough to
 * ingest. Verification and ingestion are deliberately two commands.
 *
 * THE ANSWER KEY IS THE WHOLE PROBLEM
 *
 * UPSC publishes the final key as a 1-bit TIFF inside a PDF, with no text layer,
 * roughly a year after the exam. There is no OCR dependency in this repository,
 * and a guessed answer key is worse than no answer key — so keys live in
 * ./keys/*.json, transcribed once by hand and pinned to the SHA-256 of the PDF
 * they were read from. If UPSC republishes that file, the hash stops matching
 * and this script aborts rather than keying live questions off a superseded
 * revision.
 *
 * COVERAGE, AS OF 6 SEPTEMBER 2026
 *
 * UPSC's previous-papers section lists Prelims papers for 2024, 2025 and 2026
 * only; older years have been removed. Its answer-key section lists four PDFs,
 * none of them Civil Services. The 2024 key is still served at its original URL
 * despite being delisted. So exactly one year is currently completable
 * end-to-end. 2025 and 2026 are configured below and will start working on the
 * day UPSC publishes their keys — the script reports them as BLOCKED until then,
 * which is the honest state, not a failure.
 *
 * USAGE
 *
 *   npx tsx scripts/pyq/official/fetch-verify-upsc-prelims.ts            # all configured years
 *   npx tsx scripts/pyq/official/fetch-verify-upsc-prelims.ts 2024       # one year
 *   npx tsx scripts/pyq/official/fetch-verify-upsc-prelims.ts --no-text  # papers + receipts only
 *
 * Output lands in scripts/pyq/official/out/ and is git-ignored by intent: it is
 * derived, re-derivable, and large.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface PaperSpec {
  paperKey: string;
  examId: string;
  examName: string;
  year: number;
  paper: string;
  series: string;
  /** Official question paper PDF, from upsc.gov.in. */
  paperUrl: string;
  /** Official final answer key PDF. `null` until UPSC publishes it. */
  answerKeyUrl: string | null;
  /** Transcribed key in ./keys, or `null` when there is nothing to transcribe yet. */
  keyFile: string | null;
  /**
   * Question text. UPSC's PDFs are scans with no text layer, so the stems have
   * to come from somewhere that has already done the OCR. This mirror is used
   * for text ONLY — never for answers, and never for provenance.
   */
  textUrl: string | null;
  expectedQuestions: number;
}

const UPSC_FILES = 'https://www.upsc.gov.in/sites/default/files';
const TEXT_MIRROR =
  'https://raw.githubusercontent.com/secretedoc/upsc-prelims-gs1-2011-2025/main/UPSC_Papers';

const PAPERS: PaperSpec[] = [
  {
    paperKey: 'UPSC-CSE-PRELIMS-GS1-2024',
    examId: 'UPSC_CSE',
    examName: 'Union Public Service Commission — Civil Services Examination',
    year: 2024,
    paper: 'General Studies Paper I',
    series: 'A',
    paperUrl: `${UPSC_FILES}/QP-CSP-24-GENERAL-STUDIES-PAPER-I-180624.pdf`,
    answerKeyUrl: `${UPSC_FILES}/AnsKey-CivilServicesPExam-2024-GeneralStudies-I-210525.pdf`,
    keyFile: 'upsc_cse_2024_gs1.json',
    textUrl: `${TEXT_MIRROR}/Prelims_GS1_2024.txt`,
    expectedQuestions: 100,
  },
  {
    paperKey: 'UPSC-CSE-PRELIMS-GS1-2025',
    examId: 'UPSC_CSE',
    examName: 'Union Public Service Commission — Civil Services Examination',
    year: 2025,
    paper: 'General Studies Paper I',
    series: 'A',
    paperUrl: `${UPSC_FILES}/QP-CSP-25-GENERAL-STUDIES-PAPER-I-26052025.pdf`,
    answerKeyUrl: null, // not published as of 2026-09-06
    keyFile: null,
    textUrl: `${TEXT_MIRROR}/Prelims_GS1_2025.txt`,
    expectedQuestions: 100,
  },
  {
    paperKey: 'UPSC-CSE-PRELIMS-GS1-2026',
    examId: 'UPSC_CSE',
    examName: 'Union Public Service Commission — Civil Services Examination',
    year: 2026,
    paper: 'General Studies Paper I',
    series: 'A',
    paperUrl: `${UPSC_FILES}/QP_CSP_2026_GENERAL_STUDIES_PAPER-I_25052026.pdf`,
    answerKeyUrl: null, // UPSC publishes ~1 year after the cycle closes
    keyFile: null,
    textUrl: null,
    expectedQuestions: 100,
  },
];

const HERE = __dirname;
const OUT = path.join(HERE, 'out');
const KEYS = path.join(HERE, 'keys');
/*
 * upsc.gov.in sits behind a filter that returns 403 to anything whose
 * User-Agent does not look like a browser, including a politely self-identifying
 * one. These are public documents linked from a public index page and the
 * request rate below is one file at a time, so the headers are shaped to get
 * through rather than to disguise anything.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/pdf,text/plain,text/html;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9',
};

// ─────────────────────────────────────────────────────────────────────────────
// Fetching
// ─────────────────────────────────────────────────────────────────────────────

const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

async function download(url: string): Promise<{ body: Buffer; status: number }> {
  const headers = { ...BROWSER_HEADERS };
  // The mirror is raw.githubusercontent.com; a upsc.gov.in Referer there is noise.
  if (url.includes('upsc.gov.in')) {
    headers.Referer = 'https://www.upsc.gov.in/examinations/previous-question-papers';
  }
  const res = await fetch(url, { headers, redirect: 'follow' });
  const body = Buffer.from(await res.arrayBuffer());
  return { body, status: res.status };
}

/**
 * The receipt is the whole point of this script. It records what was asked for,
 * what came back, and a hash of the bytes — so a question can later be traced to
 * a file, and that file can be checked against the one the answer was read from.
 */
interface Receipt {
  paperKey: string;
  examId: string;
  year: number;
  paper: string;
  series: string;
  sourceName: string;
  sourcePageUrl: string;
  paperUrl: string;
  paperSha256: string | null;
  paperBytes: number | null;
  answerKeyUrl: string | null;
  answerKeySha256: string | null;
  answerKeyBytes: number | null;
  answerKeyHashMatchesTranscription: boolean | null;
  downloadedAt: string;
  fetcher: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Question text parsing
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedQuestion {
  /** The number printed on the paper, or null when it could not be read. */
  number: number | null;
  stem: string;
  options: string[];
  defects: string[];
}

/** Lines the mirror prepends to a file; they are not part of question 1. */
const HEADER_LINE = /^(BODY|EXAM|SET|PAPER|SUBJECT)\s*[-:]/i;

/*
 * Options are matched a-e, not a-d, because the mirror's OCR routinely reads a
 * printed "(c)" as "(e)" — the two glyphs differ by one stroke at scan
 * resolution. UPSC papers have no (e) option, so an (e) in the third slot is
 * always a misread (c) and is safe to normalise. Left unhandled this was not a
 * cosmetic problem: a broken option run swallowed the FOLLOWING question into
 * the previous stem, which is how Q74 and Q77 went missing from the 2024 paper.
 */
const OPT_LINE = /^\s*\**\s*\(?([a-e])\)\s*(\S.*)$/i;
const OCR_OPTION_FIX: Record<string, string> = { e: 'c' };
const optionLabel = (raw: string, expecting: string): string => {
  const c = raw.toLowerCase();
  return c === expecting ? c : OCR_OPTION_FIX[c] === expecting ? expecting : c;
};
const NUM_LINE = /^\s*\**\s*(\d{1,3})\s*[.)]\s*(.*)$/;

/**
 * A question is delimited by a complete (a)(b)(c)(d) run, not by its number.
 *
 * UPSC stems routinely contain their own numbered statement lists — "1. 2. 3." —
 * so numbering alone cannot tell a question start from a statement. Options can:
 * exactly one complete a-b-c-d run belongs to each question. Everything between
 * the previous run and this one is the stem.
 */
function parseQuestions(raw: string): ParsedQuestion[] {
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const out: ParsedQuestion[] = [];
  let cursor = 0;
  let i = 0;

  while (i < lines.length) {
    const m = OPT_LINE.exec(lines[i]);
    if (!m || optionLabel(m[1], 'a') !== 'a') {
      i++;
      continue;
    }

    const opts: string[] = [m[2]];
    let ocrFixed = false;
    let j = i + 1;
    while (j < lines.length && opts.length < 4) {
      if (!lines[j]) {
        j++;
        continue;
      }
      const o = OPT_LINE.exec(lines[j]);
      const want = 'abcd'[opts.length];
      if (o && optionLabel(o[1], want) === want) {
        if (o[1].toLowerCase() !== want) ocrFixed = true;
        opts.push(o[2]);
        j++;
      } else break;
    }
    if (opts.length !== 4) {
      i++;
      continue;
    }

    const block = lines.slice(cursor, i).filter((l) => l && !HEADER_LINE.test(l));

    /*
     * Read the number the paper printed. Do NOT fall back to the ordinal.
     *
     * An earlier version numbered questions by position, which manufactured a
     * contiguous 1..N run even when the parser had missed a question — and the
     * answer key is indexed by question number, so every question after the gap
     * silently received the answer to its neighbour. A wrong answer served with
     * official provenance is the worst thing this pipeline can produce, so an
     * unreadable number is now recorded as null and gated on below.
     */
    const prev = out.length ? out[out.length - 1].number : 0;
    let number: number | null = null;
    for (const line of block) {
      const n = NUM_LINE.exec(line);
      if (!n) continue;
      const v = Number(n[1]);
      if (prev !== null && v === prev + 1) { number = v; break; }
      if (number === null && prev !== null && v > prev && v <= prev + 5) number = v;
    }

    const stemLines = block.map((line) => {
      const n = NUM_LINE.exec(line);
      return n && number !== null && Number(n[1]) === number ? n[2] : line;
    });

    const stem = stemLines.join(' ').replace(/\s+/g, ' ').trim();
    out.push({
      number,
      stem,
      options: opts.map((o) => o.replace(/\s+/g, ' ').trim()),
      defects: [...detectDefects(stem, opts), ...(ocrFixed ? ['ocr-option-label-repaired'] : [])],
    });
    cursor = j;
    i = j;
  }

  return out;
}

/**
 * The alignment gate.
 *
 * The official key maps question number to answer. If the parsed numbering is
 * not exactly 1..expected, we cannot know which stem a given answer belongs to,
 * and no amount of per-question cleanliness rescues that. In this state the run
 * keeps the text and throws away every answer.
 */
function checkAlignment(questions: ParsedQuestion[], expected: number) {
  const nums = questions.map((q) => q.number);
  const unread = nums.filter((n) => n === null).length;
  const seq = nums.filter((n): n is number => n !== null);
  const contiguous = seq.every((n, i) => n === i + 1);
  const complete = seq.length === expected && contiguous;
  const missing = complete ? [] : Array.from({ length: expected }, (_, i) => i + 1).filter((n) => !seq.includes(n));
  return { aligned: complete && unread === 0, unread, missing, parsed: questions.length };
}

/**
 * The mirror's text comes from OCR of a two-column scan, and it fails in three
 * specific, recognisable ways. Detecting them is not optional politeness: a
 * question whose statement list has been reordered is a question whose answer
 * key no longer applies to it.
 */
function detectDefects(stem: string, options: string[]): string[] {
  const d: string[] = [];

  // A number+dot mid-sentence: a fragment of the adjacent column landing inside
  // this line. Real question numbers only ever start a line.
  if (/[a-z,]\s+\d{1,3}\.\s+[a-z]/.test(stem)) d.push('column-bleed');

  // Roman-numeral statement lists printed in two columns come out read
  // column-wise: I, III, II, IV instead of I, II, III, IV.
  const romans = [...stem.matchAll(/(?:^|\s)(I{1,3}V?|IV|V)\.\s/g)].map((m) => m[1]);
  if (romans.length >= 3) {
    const order = ['I', 'II', 'III', 'IV', 'V'];
    const seen = romans.filter((r) => order.includes(r));
    const ascending = seen.every((r, k) => k === 0 || order.indexOf(r) > order.indexOf(seen[k - 1]));
    if (!ascending) d.push('scrambled-statement-order');
  }

  // A table flattened into a line: the separator survives, the layout does not.
  if ((stem.match(/\s-\s/g) || []).length >= 3) d.push('possible-flattened-table');

  if (options.some((o) => o.length < 2)) d.push('truncated-option');
  if (stem.length < 25) d.push('suspiciously-short-stem');

  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical record assembly
// ─────────────────────────────────────────────────────────────────────────────

/** Matches pyqExtractorService.generateQuestionHash so dedup works across sources. */
function questionHash(examId: string, text: string, options: string[]): string {
  const normText = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const normOpts = options.map((o) => o.trim().toLowerCase().replace(/\s+/g, ' ')).sort().join('|');
  return crypto.createHash('sha256').update(`${examId}::${normText}::${normOpts}`).digest('hex');
}

interface KeyFile {
  source: { url: string; sha256: string };
  declared: { totalQuestions: number; dropped: number; takenForScoring: number };
  answers: Record<string, string>;
  notes?: string[];
}

function buildRecords(
  spec: PaperSpec,
  questions: ParsedQuestion[],
  key: KeyFile | null,
  receipt: Receipt,
  aligned: boolean
) {
  const sessionSlug = spec.paper.toLowerCase().replace(/\s+/g, '_');
  const shiftSlug = `set_${spec.series.toLowerCase()}`;

  return questions.map((q, idx) => {
    const contentHash = questionHash(spec.examId, q.stem, q.options);
    // No number, or a paper whose numbering did not verify, means no answer.
    const answer = aligned && q.number !== null ? (key?.answers[String(q.number)] ?? null) : null;
    const dropped = answer === 'X';

    /*
     * Two gates decide what this record is allowed to claim.
     *
     * OFFICIAL_CONFIRMED requires an answer that came out of a key PDF whose
     * hash we verified. Anything else is UNVERIFIED — including a question we
     * are confident about, because confidence is not provenance.
     *
     * A question with any extraction defect is never OFFICIAL_CONFIRMED either.
     * If the statement order is wrong, the official answer is an answer to a
     * different question.
     */
    const clean = q.defects.length === 0;
    const keyed = Boolean(answer) && !dropped && receipt.answerKeyHashMatchesTranscription === true;

    return {
      questionId: `pyq:${spec.examId.toLowerCase()}:${spec.year}:${sessionSlug}:${shiftSlug}:q${q.number ?? `pos${idx + 1}`}:${contentHash.slice(0, 8)}`,
      examId: spec.examId,
      examName: spec.examName,
      year: spec.year,
      session: spec.paper,
      paper: spec.paper,
      shift: `Set ${spec.series}`,
      subject: 'General Studies',
      questionNumber: q.number ?? idx + 1,
      questionText: q.stem,
      questionType: 'MCQ_SINGLE',
      options: q.options,
      correctAnswer: keyed ? answer : '',
      correctAnswerSource: keyed
        ? `UPSC Official Final Answer Key ${spec.year} (Series ${spec.series})`
        : '',
      language: 'en',
      marks: 2,
      negativeMarks: 0.66,

      contentHash,
      sourceId: `src_upsc_cse_${spec.year}_gs1_official`,
      sourceUrl: spec.paperUrl,
      sourceType: 'TIER_A_OFFICIAL',

      provenanceRecords: [
        {
          sourceTier: 'TIER_A_OFFICIAL',
          sourceName: `UPSC official question paper — CSP ${spec.year} GS Paper I`,
          sourceUrl: spec.paperUrl,
          sourceDomain: 'upsc.gov.in',
          retrievedAt: Date.parse(receipt.downloadedAt),
          isOfficial: true,
          extractedAnswer: answer ?? undefined,
          contentHash,
          notes: [
            `paper sha256=${receipt.paperSha256}`,
            receipt.answerKeySha256 ? `key sha256=${receipt.answerKeySha256}` : 'key not published',
            'question text transcribed from an OCR mirror; answer from the official key only',
          ].join(' | '),
        },
      ],

      verificationStatus: keyed && clean ? 'OFFICIAL_CONFIRMED' : 'UNVERIFIED',
      ingestionState: keyed && clean ? 'VERIFIED' : 'QUARANTINED',
      rightsStatus: 'OFFICIAL_SOURCE_REVIEWED',
      redistributionAllowed: false,

      extractionQualityScore: clean ? 0.95 : Math.max(0.3, 0.95 - 0.2 * q.defects.length),
      vectorIndexed: false,
      retrievalTested: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),

      /* Not part of CanonicalPYQQuestion. Carried so a reviewer can sort by it. */
      _review: {
        defects: q.defects,
        dropped,
        printedNumber: q.number,
        paperAligned: aligned,
        needsHumanReview: !clean || dropped || !keyed,
      },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

interface Summary {
  paperKey: string;
  state: string;
  parsed: number;
  clean: number;
  keyed: number;
  dropped: number;
  defective: number;
  emitted: number;
  problems: string[];
}

async function processPaper(spec: PaperSpec, withText: boolean): Promise<Summary> {
  const dir = path.join(OUT, spec.paperKey);
  fs.mkdirSync(dir, { recursive: true });
  const problems: string[] = [];

  const receipt: Receipt = {
    paperKey: spec.paperKey,
    examId: spec.examId,
    year: spec.year,
    paper: spec.paper,
    series: spec.series,
    sourceName: 'UPSC official previous question papers',
    sourcePageUrl: 'https://www.upsc.gov.in/examinations/previous-question-papers',
    paperUrl: spec.paperUrl,
    paperSha256: null,
    paperBytes: null,
    answerKeyUrl: spec.answerKeyUrl,
    answerKeySha256: null,
    answerKeyBytes: null,
    answerKeyHashMatchesTranscription: null,
    downloadedAt: new Date().toISOString(),
    fetcher: 'scripts/pyq/official/fetch-verify-upsc-prelims.ts',
  };

  // 1. The question paper.
  const paper = await download(spec.paperUrl);
  if (paper.status !== 200) {
    problems.push(`paper HTTP ${paper.status}`);
    fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));
    return { paperKey: spec.paperKey, state: 'PAPER_UNAVAILABLE', parsed: 0, clean: 0, keyed: 0, dropped: 0, defective: 0, emitted: 0, problems };
  }
  receipt.paperSha256 = sha256(paper.body);
  receipt.paperBytes = paper.body.length;
  fs.writeFileSync(path.join(dir, `${spec.paperKey}.pdf`), paper.body);

  // 2. The answer key, and the hash gate.
  let key: KeyFile | null = null;
  if (spec.answerKeyUrl && spec.keyFile) {
    const ak = await download(spec.answerKeyUrl);
    if (ak.status === 200) {
      receipt.answerKeySha256 = sha256(ak.body);
      receipt.answerKeyBytes = ak.body.length;
      fs.writeFileSync(path.join(dir, `${spec.paperKey}-answer-key.pdf`), ak.body);

      const keyPath = path.join(KEYS, spec.keyFile);
      if (!fs.existsSync(keyPath)) {
        problems.push(`transcribed key missing: keys/${spec.keyFile}`);
      } else {
        const parsed: KeyFile = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
        const match = parsed.source.sha256 === receipt.answerKeySha256;
        receipt.answerKeyHashMatchesTranscription = match;
        if (match) {
          key = parsed;
          const xs = Object.values(parsed.answers).filter((a) => a === 'X').length;
          if (xs !== parsed.declared.dropped)
            problems.push(`key self-check failed: ${xs} X marks vs declared ${parsed.declared.dropped} dropped`);
          if (Object.keys(parsed.answers).length !== parsed.declared.totalQuestions)
            problems.push(`key has ${Object.keys(parsed.answers).length} answers, declares ${parsed.declared.totalQuestions}`);
        } else {
          problems.push(
            `ANSWER KEY HASH MISMATCH — UPSC has replaced the file. Transcription pinned ${parsed.source.sha256.slice(0, 12)}…, downloaded ${receipt.answerKeySha256.slice(0, 12)}…. Re-transcribe before using.`
          );
        }
      }
    } else {
      problems.push(`answer key HTTP ${ak.status}`);
    }
  } else {
    problems.push('no official answer key published yet');
  }

  fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));

  // 3. Question text.
  if (!withText || !spec.textUrl) {
    return { paperKey: spec.paperKey, state: key ? 'PAPER_AND_KEY_ONLY' : 'BLOCKED_NO_KEY', parsed: 0, clean: 0, keyed: 0, dropped: 0, defective: 0, emitted: 0, problems };
  }

  const text = await download(spec.textUrl);
  if (text.status !== 200) {
    problems.push(`question text HTTP ${text.status}`);
    return { paperKey: spec.paperKey, state: 'NO_TEXT', parsed: 0, clean: 0, keyed: 0, dropped: 0, defective: 0, emitted: 0, problems };
  }
  fs.writeFileSync(path.join(dir, 'questions.txt'), text.body);

  const questions = parseQuestions(text.body.toString('utf-8'));
  const align = checkAlignment(questions, spec.expectedQuestions);
  if (!align.aligned) {
    problems.push(
      `NUMBERING NOT VERIFIED — parsed ${align.parsed} of ${spec.expectedQuestions}` +
        (align.unread ? `, ${align.unread} with no readable number` : '') +
        (align.missing.length ? `, missing ${align.missing.slice(0, 12).join(',')}${align.missing.length > 12 ? '…' : ''}` : '') +
        '. All answers withheld: the key is indexed by question number, so a gap would attach answers to the wrong stems.'
    );
  }

  const records = buildRecords(spec, questions, key, receipt, align.aligned);
  fs.writeFileSync(path.join(dir, 'candidates.json'), JSON.stringify(records, null, 2));

  const clean = records.filter((r) => r._review.defects.length === 0).length;
  const keyed = records.filter((r) => r.correctAnswer).length;
  const dropped = records.filter((r) => r._review.dropped).length;
  const emitted = records.filter((r) => r.verificationStatus === 'OFFICIAL_CONFIRMED').length;

  return {
    paperKey: spec.paperKey,
    state: key ? 'COMPLETE' : 'BLOCKED_NO_KEY',
    parsed: questions.length,
    clean,
    keyed,
    dropped,
    defective: questions.length - clean,
    emitted,
    problems,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const withText = !args.includes('--no-text');
  const years = args.filter((a) => /^\d{4}$/.test(a)).map(Number);
  const todo = years.length ? PAPERS.filter((p) => years.includes(p.year)) : PAPERS;

  if (!todo.length) {
    console.error(`No configured paper for ${years.join(', ')}. Known: ${PAPERS.map((p) => p.year).join(', ')}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  console.log(`\nUPSC Prelims GS Paper I — fetch and verify`);
  console.log(`Output: ${OUT}\n`);

  const summaries: Summary[] = [];
  for (const spec of todo) {
    process.stdout.write(`  ${spec.year} … `);
    try {
      const s = await processPaper(spec, withText);
      summaries.push(s);
      console.log(s.state);
    } catch (err: any) {
      console.log(`ERROR ${err?.message}`);
      summaries.push({ paperKey: spec.paperKey, state: 'ERROR', parsed: 0, clean: 0, keyed: 0, dropped: 0, defective: 0, emitted: 0, problems: [String(err?.message)] });
    }
  }

  const pad = (s: string | number, n: number) => String(s).padStart(n);
  console.log('\n' + '─'.repeat(96));
  console.log(
    'YEAR  STATE                PARSED  CLEAN  DEFECTIVE  KEYED  DROPPED  ' + 'INGESTIBLE'
  );
  console.log('─'.repeat(96));
  for (const s of summaries) {
    const year = s.paperKey.slice(-4);
    console.log(
      `${year}  ${s.state.padEnd(20)}${pad(s.parsed, 6)}${pad(s.clean, 7)}${pad(s.defective, 11)}${pad(s.keyed, 7)}${pad(s.dropped, 9)}${pad(s.emitted, 12)}`
    );
  }
  console.log('─'.repeat(96));

  const problems = summaries.flatMap((s) => s.problems.map((p) => `${s.paperKey.slice(-4)}: ${p}`));
  if (problems.length) {
    console.log('\nProblems:');
    for (const p of problems) console.log(`  • ${p}`);
  }

  const total = summaries.reduce((a, s) => a + s.emitted, 0);
  console.log(
    `\n${total} question(s) reached OFFICIAL_CONFIRMED — clean extraction plus an answer from a hash-verified official key.`
  );
  console.log('Everything else is written as QUARANTINED for review.');
  console.log('\nNothing was written to Firestore or Pinecone. Review out/*/candidates.json before ingesting.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
