/**
 * Turns a student's prose into a retrieval intent plus the entities needed to act on it.
 *
 * This exists because the chat runtime had no way to tell "give me the SSC CGL 2022 Shift 1 paper"
 * (an exact request for records Sadhya holds) from "explain normalization" (a request no corpus
 * needs to answer). Without that distinction there is only one behaviour available, and the
 * behaviour that was chosen was to answer everything from the model's own knowledge.
 *
 * Deliberately deterministic. An LLM classifier here would add a network round-trip to every
 * message and make the grounding decision itself non-deterministic — the opposite of what a
 * no-fabrication guarantee needs. Intent is decided by evidence in the query:
 *
 *   EXACT_PYQ          a specific sitting is named (exam + year, optionally shift/paper)
 *   PYQ_SEARCH         past questions wanted, but scoped by topic rather than by sitting
 *   GENERATED_PRACTICE new questions explicitly requested
 *   SYLLABUS           the syllabus itself is the subject
 *   EXAM_PATTERN       structure/marks/duration of an exam
 *   NONE               nothing canonical is being asked for
 *
 * A request that names an exam and a year but that asks to *generate* is GENERATED_PRACTICE, not
 * EXACT_PYQ — the generation verb is stronger evidence than the sitting, and mislabelling it is
 * exactly how generated questions come to be presented as past papers.
 */
import { detectExamId } from './examIndex';
import { normalizeShift, normalizePaper } from './paperIdentity';

export type PyqRetrievalIntent =
  | 'EXACT_PYQ'
  | 'PYQ_SEARCH'
  | 'GENERATED_PRACTICE'
  | 'SYLLABUS'
  | 'EXAM_PATTERN'
  | 'NONE';

export interface ParsedPyqQuery {
  intent: PyqRetrievalIntent;
  examId: string | null;
  year: number | null;
  shift: number | null;
  paper: string | null;
  topic: string | null;
  /** How many questions were asked for, when the student said. */
  requestedCount: number | null;
  /** An exam named in the query that the corpus does not contain (e.g. GATE). */
  unresolvedExamHint: string | null;
  /** True when the student asked for a whole paper rather than a few questions. */
  wantsFullPaper: boolean;
  evidence: string[];
}

/*
 * "Give me" is not a generation verb.
 *
 * It was in this alternation, so "Give me the complete SSC CGL 2022 Shift 1 paper" classified as
 * GENERATED_PRACTICE — the single most important request in this whole investigation being routed
 * to the one branch that is allowed to invent questions. Generation now needs a verb that actually
 * means "produce something new", or an explicit ask for practice/mock/sample material.
 */
// The noun can sit some distance from the verb — "Generate 20 SSC CGL questions on probability" —
// so allow words in between, but only within one clause so a later sentence cannot trigger it.
const STRONG_GENERATE_RE = /\b(generate|create|build|prepare|compose|draft|frame)\b[^.?!]{0,45}?\b(questions?|mcqs?|test|quiz|paper|problems?)\b/i;
const SOFT_GENERATE_RE = /\b(practice|mock|sample|custom|new)\s+(questions?|mcqs?|test|quiz|set)\b|\b(questions?|mcqs?)\s+(in\s+the\s+style\s+of|similar\s+to|based\s+on)\b/i;

/** Freshness requests belong to web search, not to the question corpus. */
const NEWS_RE = /\b(notification|admit\s*card|result|vacancy|apply|application\s*form|eligibility|exam\s*date|latest\s*news|cut\s*off\s*(date)?|registration)\b/i;
// "repetitive/repeated/frequently asked" etc. is how students actually phrase this — "which
// questions keep coming back across shifts and years" — not with the word "PYQ" or "previous
// year" at all. A query using only these words still requires examId to do anything (see
// asksPyq's use at the intent decision below), so this stays safe without the exam+year anchor.
const PYQ_RE = /\b(pyq|pyqs|previous\s*year|past\s*(year|paper)|previous\s*paper|question\s*paper|actual\s*paper|real\s*paper|repetitive|repeats?(?:ed|ing)?|recurring|frequently\s*asked|commonly\s*asked|most\s*asked|most\s*common(?:ly)?|keeps?\s+(?:coming|repeating)|comes?\s+(?:again\s+and\s+again|up\s+often|back))\b/i;
const FULL_PAPER_RE = /\b(whole|full|complete|entire|all)\b[^.?!]{0,20}\b(paper|test|set|questions?)\b|\bpaper\b[^.?!]{0,10}\bin\s+full\b/i;
const SYLLABUS_RE = /\bsyllabus|curriculum\s+for|topics?\s+covered|what\s+(is|are)\s+.{0,30}\bsyllabus\b/i;
const PATTERN_RE = /\b(exam\s*pattern|marking\s*scheme|how\s*many\s*questions|negative\s*marking|paper\s*pattern|duration|total\s*marks)\b/i;

/** Words that are never a topic, so a leftover-token topic does not become noise. */
const STOPWORDS = new Set([
  'give', 'me', 'the', 'a', 'an', 'of', 'for', 'from', 'any', 'some', 'all', 'please', 'want',
  'need', 'show', 'get', 'fetch', 'paper', 'papers', 'question', 'questions', 'pyq', 'pyqs',
  'previous', 'year', 'years', 'past', 'shift', 'tier', 'exam', 'test', 'set', 'full', 'whole',
  'complete', 'entire', 'and', 'on', 'in', 'with', 'about', 'related', 'to', 'based', 'mcq',
  'mcqs', 'practice', 'generate', 'create', 'make', 'new', 'sample', 'mock', 'do', 'you', 'have',
  'check', 'db', 'database', 'available', 'availability', 'whether', 'is', 'are', 'there',
  'extract', 'give', 'list', 'find', 'search', 'want', 'like', 'can', 'could', 'would', 'my',
  // Greeting/filler and the frequency-language PYQ_RE now matches — none of these name a subject,
  // so leaving them in let "hello help most repetitive ..." become the `topic` filter. topic is
  // an exact-match metadata filter server-side (retrieval.service.ts), so a leftover phrase like
  // that matches zero real PYQ records and silently empties out a search that should have worked.
  'hello', 'hi', 'hey', 'help', 'most', 'many', 'which', 'come', 'comes', 'coming', 'back',
  'keep', 'keeps', 'actual', 'actually', 'common', 'commonly', 'recurring', 'frequently',
  'repetitive', 'repeated', 'repeatedly', 'repeat', 'repeats', 'asked', 'again', 'what', 'why',
  'when', 'where', 'who', 'how', 'across', 'every', 'that', 'this', 'different', 'various',
  // "diffrent" is the actual typo a real report used ("different" misspelled) — not a general
  // typo-correction pass, just closing the one gap that was actually observed.
  'diffrent',
]);

function extractYear(q: string): number | null {
  // Prefer a year adjacent to exam/paper words; otherwise any plausible exam year.
  const all = Array.from(q.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g), (m) => Number(m[1]));
  if (all.length === 0) return null;
  const plausible = all.filter((y) => y >= 1990 && y <= new Date().getFullYear() + 1);
  return plausible.length ? plausible[0] : null;
}

function extractCount(q: string): number | null {
  const m = q.match(/\b(\d{1,3})\s+(questions?|mcqs?|problems?)\b/i);
  if (m) return Number(m[1]);
  return null;
}

function extractTopic(q: string, examId: string | null): string | null {
  let s = q.toLowerCase();
  if (examId) s = s.replace(new RegExp(examId.replace(/_/g, '[\\s_-]*'), 'ig'), ' ');
  s = s
    .replace(/\b(19[89]\d|20[0-4]\d)\b/g, ' ')
    .replace(/\bshift\s*\d+\b/gi, ' ')
    .replace(/\btier\s*[\divx]+\b/gi, ' ')
    .replace(/\bpaper\s*[\divx]+\b/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ');
  const words = s.split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (words.length === 0) return null;
  // "on probability", "about dbms normalization" — take what follows the topic preposition when
  // present, otherwise the remaining content words.
  const onMatch = q.match(/\b(?:on|about|related to|regarding)\s+([a-z0-9][a-z0-9\s&+-]{2,40})/i);
  if (onMatch) {
    const t = onMatch[1].split(/\s+/).filter((w) => !STOPWORDS.has(w.toLowerCase())).join(' ').trim();
    if (t) return t;
  }
  return words.slice(0, 4).join(' ');
}

export async function parsePyqQuery(rawQuery: string): Promise<ParsedPyqQuery> {
  const q = String(rawQuery || '').trim();
  const evidence: string[] = [];

  const examId = await detectExamId(q);
  if (examId) evidence.push(`exam=${examId}`);

  const year = extractYear(q);
  if (year) evidence.push(`year=${year}`);

  const shiftMatch = q.match(/\bshift\s*(\d+)\b/i) ?? q.match(/\b(\d+)(?:st|nd|rd|th)?\s+shift\b/i);
  const shift = shiftMatch ? Number(shiftMatch[1]) : normalizeShift(q).shift;
  if (shift !== null) evidence.push(`shift=${shift}`);

  const paperMatch = q.match(/\btier\s*([\divx]+)\b/i) ?? q.match(/\bpaper\s*([\divx]+)\b/i);
  const paper = paperMatch ? normalizePaper(paperMatch[0]) : null;
  if (paper) evidence.push(`paper=${paper}`);

  const requestedCount = extractCount(q);
  const wantsFullPaper = FULL_PAPER_RE.test(q);
  if (wantsFullPaper) evidence.push('wantsFullPaper');

  const asksPyq = PYQ_RE.test(q);
  const asksGenerate = STRONG_GENERATE_RE.test(q) || SOFT_GENERATE_RE.test(q);
  const asksNews = NEWS_RE.test(q);

  /*
   * An exam the corpus has never heard of.
   *
   * "GATE CS 2024 paper" resolves no examId, because GATE is genuinely absent from the corpus.
   * Left as NONE, that request would take the general-knowledge path and the model would invent a
   * GATE paper — the exact failure this work exists to prevent. It is recorded as an unresolved
   * exam hint so the request still reaches the canonical branch and is answered with "not in the
   * verified corpus" rather than from memory.
   */
  const examLikeToken = q.match(/\b(GATE|CAT|CLAT|NDA|CDS|AFCAT|SBI\s*PO|RBI|NABARD|ESE|GPAT|ICAR|TET|CTET|NIFT|NID|XAT|SNAP|MAT|BITSAT|VITEEE|COMEDK|WBJEE|MHT\s*CET|KCET)\b/i);
  const unresolvedExamHint = !examId && examLikeToken ? examLikeToken[1].toUpperCase().replace(/\s+/g, '_') : null;
  if (unresolvedExamHint) evidence.push(`unresolvedExam=${unresolvedExamHint}`);

  let intent: PyqRetrievalIntent = 'NONE';

  if (asksNews) {
    // Freshness beats everything: a notification or result is never answered from the PYQ corpus.
    intent = 'NONE';
    evidence.push('newsQuery');
  } else if (SYLLABUS_RE.test(q)) {
    intent = 'SYLLABUS';
  } else if (PATTERN_RE.test(q)) {
    intent = 'EXAM_PATTERN';
  } else if (asksGenerate && !asksPyq) {
    // "Create 20 SSC CGL questions on probability" — a sitting may be named, but new questions
    // were asked for. Generation wins.
    intent = 'GENERATED_PRACTICE';
  } else if (asksPyq || wantsFullPaper) {
    // Past questions wanted. A named sitting makes it exact; otherwise it is a topic search.
    const namesSitting = Boolean(examId && (year || shift !== null || wantsFullPaper));
    if (namesSitting) intent = 'EXACT_PYQ';
    else if (examId) intent = 'PYQ_SEARCH';
    else if (unresolvedExamHint) intent = 'EXACT_PYQ'; // answered as "not in corpus", not invented
    else intent = 'NONE';
  } else if (examId && year) {
    // "SSC CGL 2022" with no verb still names a sitting.
    intent = 'EXACT_PYQ';
  } else if (unresolvedExamHint && year) {
    intent = 'EXACT_PYQ';
  }

  const topic = extractTopic(q, examId);
  if (topic) evidence.push(`topic=${topic}`);
  evidence.push(`intent=${intent}`);

  return { intent, examId, year, shift, paper, topic, requestedCount, wantsFullPaper, unresolvedExamHint, evidence };
}
