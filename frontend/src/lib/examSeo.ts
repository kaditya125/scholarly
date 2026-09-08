/**
 * The meta description for an /exams/:slug hub.
 *
 * Imported by BOTH src/pages/ExamLanding.tsx (which sets the tag at runtime) and
 * scripts/seo-routes.ts (which stamps it into the served HTML at build time). Everything else
 * in the SEO table is duplicated between those two files with a "keep in sync" comment; this is
 * not, because it is a pure function over data both sides already import, so sharing it costs
 * nothing and makes drift impossible.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 *  WHY THESE ARE WRITTEN OUT AND NOT GENERATED
 *
 *  The previous description was assembled:
 *
 *      `Complete latest pattern, subject-wise syllabus, marking scheme, and AI tutor for
 *       ${exam.fullName} (${exam.name}). ${exam.about.slice(0, 110)}…`
 *
 *  240-270 characters against the ~155 Google renders, so every exam hub was cut off in
 *  results — and `slice(0, 110)` cuts mid-word, so NEET's ended "...and other allied healthc…".
 *
 *  Shortening the slice does not fix it. Truncating prose at a character budget cannot land on
 *  a clause boundary, because whether a cut reads as finished depends on the sentence, not on
 *  the character count. Trying it produced, at a 90-character budget:
 *
 *      JEE Advanced ...premier entrance test for admissions to the prestigious.
 *      IBPS PO      ...Probationary Officers / Management Trainees across 11 participating.
 *      UGC NET      ...eligibility for Assistant Professorship and the award of Junior.
 *      State PSCs   ...conduct recruitment into state administrative.
 *
 *  Six of seventeen came out grammatically broken. Walking the cut back past prepositions fixes
 *  "…admissions into" but not "…the prestigious" or "…the award of Junior", and no word list
 *  ever will. A broken sentence shown in full is worse than a good one truncated.
 *
 *  So they are written, one per exam, from the facts already in EXAM_CATALOG — every claim below
 *  is drawn from that entry's own `about`, `fullName` or `conductedBy`. Seventeen lines is a
 *  tractable amount of copy, and copy is what a meta description is.
 * ─────────────────────────────────────────────────────────────────────────────────────
 */

import type { ExamEntry } from './examCatalog';
import { SITE } from './siteConfig';

/**
 * Google renders roughly 155-160 characters of a description on desktop and fewer on mobile,
 * then truncates. It is a soft limit — nothing is penalised for exceeding it, the tail is simply
 * never read — so this is a budget, not a validation rule.
 */
export const META_DESCRIPTION_LIMIT = 155;

/**
 * Google gives a title roughly 600 pixels, which works out near 60 characters before it is
 * replaced by an ellipsis. Like the description limit this is a budget, not a rule — an over-long
 * title is shortened in the result, not penalised.
 */
export const META_TITLE_LIMIT = 60;

/**
 * The exam hubs used to title themselves:
 *
 *     `${exam.name} Exam Pattern, Syllabus & AI Preparation — ${exam.fullName} | ${SITE.name}`
 *
 * 92-152 characters against the ~60 shown. Two things were spending that budget badly. The
 * `— ${exam.fullName}` splice is the larger one: `fullName` runs to 90 characters on its own
 * ("State Public Service Commission Examinations (UPPSC, MPPSC, RAS, WBPSC, TNPSC, MPSC, etc.)"),
 * and it is already the page's <h1>, so the title was repeating what the page says anyway and
 * losing the brand off the end to do it. "AI Preparation" is the other: fifteen characters spent
 * on a phrase nobody types into a search box.
 *
 * What replaces them are the terms people actually search — "<exam> syllabus", "<exam> exam
 * pattern", "<exam> eligibility" — all of which this page genuinely answers.
 */
function defaultTitle(exam: ExamEntry): string {
  return `${exam.name} Exam Pattern, Syllabus & Eligibility | ${SITE.name}`;
}

/**
 * For exams the default sentence does not describe honestly. CBSE & ICSE is not an entrance exam
 * with an eligibility bar — it is board-curriculum tutoring for Classes 6-12 — so promising
 * "Eligibility" there would be a title the page does not pay off.
 */
const EXAM_TITLE_OVERRIDES: Record<string, string> = {
  'cbse-icse': `CBSE & ICSE Syllabus & Board Exam Preparation | ${SITE.name}`,
};

/** The <title> served for /exams/<slug>. */
export function examMetaTitle(exam: ExamEntry): string {
  return EXAM_TITLE_OVERRIDES[exam.slug] ?? defaultTitle(exam);
}

/**
 * One description per exam, keyed by slug.
 *
 * Each opens with what the exam actually is, so the seventeen are distinct rather than one
 * sentence with a name swapped in, and closes with what the page gives you. The exam's short
 * name appears in every one — two of the catalogue's `about` texts never mention it (State PSCs
 * opens "State Public Service Commissions…", CBSE & ICSE opens "Sadhya provides…"), so leaning
 * on the prose alone would drop the term someone actually searched for.
 */
const EXAM_META_DESCRIPTIONS: Record<string, string> = {
  neet:
    "NEET is India's only national entrance exam for MBBS, BDS, BAMS and allied healthcare seats. Pattern, syllabus, marking scheme and an AI tutor.",
  'jee-main':
    'JEE Main is the entrance exam for NITs, IIITs and CFTIs, and the qualifying round for JEE Advanced. Pattern, syllabus, marking scheme and an AI tutor.',
  'jee-advanced':
    'JEE Advanced is the IIT entrance test, open only to the top 2.5 lakh JEE Main qualifiers. Pattern, syllabus, marking scheme and an AI tutor.',
  'upsc-cse':
    'UPSC CSE recruits for the IAS, IPS, IFS, IRS and allied Group A services. Prelims and Mains pattern, syllabus, marking scheme and an AI tutor.',
  'ssc-cgl':
    'SSC CGL recruits graduates into Group B and C posts — Income Tax Inspector, ASO, CBI SI and more. Pattern, syllabus, marking scheme and an AI tutor.',
  'ssc-chsl':
    'SSC CHSL is the 10+2 recruitment exam for LDC, JSA and Data Entry Operator posts. Pattern, syllabus, marking scheme and an AI tutor.',
  bpsc:
    "BPSC CCE recruits into Bihar's administrative services — SDM, DSP, BDO and Revenue Officer. Pattern, syllabus, marking scheme and an AI tutor.",
  'bihar-tre':
    'Bihar TRE recruits school teachers for Classes 1-12 across Bihar Government schools. Pattern, syllabus, marking scheme and an AI tutor.',
  'ctet-stet':
    'CTET and STET are the qualifying tests for teaching in Central and State Government schools. Pattern, syllabus, marking scheme and an AI tutor.',
  cuet:
    'CUET UG is the single entrance route to DU, BHU, JNU and 250+ other universities. Pattern, syllabus, marking scheme and an AI tutor.',
  'ibps-po':
    'IBPS PO recruits Probationary Officers across 11 public sector banks, including PNB and Bank of Baroda. Pattern, syllabus, marking scheme and an AI tutor.',
  'sbi-po':
    "SBI PO is the Probationary Officer exam for India's largest commercial bank. Pattern, syllabus, marking scheme and an AI tutor.",
  'rbi-grade-b':
    'RBI Grade B is direct entry into managerial roles in monetary policy and banking supervision. Pattern, syllabus, marking scheme and an AI tutor.',
  'rrb-ntpc':
    'RRB NTPC recruits Station Masters, Goods Train Managers and clerical staff across 21 Railway Boards. Pattern, syllabus, marking scheme and an AI tutor.',
  'ugc-net':
    'UGC NET decides Assistant Professor eligibility and JRF awards across 83 postgraduate subjects. Pattern, syllabus, marking scheme and an AI tutor.',
  'state-pscs':
    'State PSCs recruit Deputy Collectors, DSPs and Tehsildars — UPPSC, MPPSC, RAS, TNPSC and more. Pattern, syllabus, marking scheme and an AI tutor.',
  'cbse-icse':
    'CBSE and ICSE tutoring for Classes 6-12: concepts, homework help and board exam preparation, with an AI tutor grounded in the official syllabus.',
};

/**
 * Words that read as an unfinished thought when a cut lands right after them. Used only by the
 * fallback below; it is a mitigation, not a solution — see the note at the top of this file.
 */
const DANGLING_WORDS = new Set([
  'a', 'an', 'and', 'across', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'including', 'into',
  'of', 'on', 'or', 'the', 'to', 'via', 'with',
]);

/**
 * Trims `text` to at most `limit` characters, ending on a whole word and preferring a comma
 * break when one falls late enough to be worth taking. Returns text with trailing punctuation
 * stripped — the caller supplies the full stop.
 */
export function clampToClause(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed.replace(/[\s.,;:—-]+$/, '');

  // +1 so a limit landing exactly on a space still counts that word as whole.
  const window = trimmed.slice(0, limit + 1);

  // A comma break reads better, but only if it keeps most of the budget; an early comma would
  // throw away half the sentence to gain a little tidiness.
  const comma = Math.max(window.lastIndexOf(','), window.lastIndexOf(';'));
  const lastSpace = window.lastIndexOf(' ');
  let cut = comma >= limit * 0.6 ? window.slice(0, comma) : window.slice(0, lastSpace);

  const words = cut.split(/\s+/);
  while (words.length > 1) {
    const bare = words[words.length - 1]!.toLowerCase().replace(/[^a-z]/g, '');
    if (!DANGLING_WORDS.has(bare)) break;
    words.pop();
  }

  return words.join(' ').replace(/[\s.,;:—-]+$/, '');
}

/** True when this exam has copy written for it rather than a generated stopgap. */
export function hasWrittenDescription(slug: string): boolean {
  return slug in EXAM_META_DESCRIPTIONS;
}

/**
 * The description served for /exams/<slug>, always within META_DESCRIPTION_LIMIT.
 *
 * A new exam added to EXAM_CATALOG without a line above still gets something serviceable rather
 * than nothing — but it is a stopgap that may read awkwardly, which is why the build prints a
 * warning naming the slug. Write it a real line and the warning goes away.
 */
export function examMetaDescription(exam: ExamEntry): string {
  const written = EXAM_META_DESCRIPTIONS[exam.slug];
  if (written) return written;

  const tail = `Full ${exam.name} pattern, syllabus and marking scheme, plus an AI tutor.`;
  const budget = META_DESCRIPTION_LIMIT - tail.length - 2; // -2 for the ". " join
  return `${clampToClause(exam.about, budget)}. ${tail}`;
}
