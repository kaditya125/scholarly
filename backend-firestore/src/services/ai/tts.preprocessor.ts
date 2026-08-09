/**
 * TTS Text Preprocessor
 *
 * Cleans and normalizes text before it reaches Google Cloud TTS so the
 * synthesized audio sounds natural. The current pipeline was sending raw
 * script text directly to the API, which caused:
 *
 *   - "-" in words like "step-by-step" being spoken as "minus"
 *   - Markdown asterisks pronounced as "asterisk asterisk"
 *   - Chemical formulas ("H2O") read wrong
 *   - Roman numerals ("Class III") read as letters
 *   - URLs read verbatim
 *   - Emoji spoken
 *   - Abbreviations expanded inconsistently
 *
 * Everything happens in plain text (no SSML). This means the preprocessor
 * works with EVERY Google voice family — including Chirp 3 HD, which is
 * the highest-quality tier but rejects SSML input entirely per the docs
 * (https://cloud.google.com/text-to-speech/docs/list-voices-and-types).
 *
 * ORDERING MATTERS — steps assume prior transformations already ran. Do
 * not reorder without updating the tests.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type TTSLanguage = 'en' | 'hi' | 'hinglish' | string;

export interface PreprocessOptions {
  /** BCP-ish language hint. Affects some transformations (e.g. currency). */
  language?: TTSLanguage;
  /**
   * Some voices already handle percentages/currencies well. Skip the
   * expansion pass by setting this to false. Default: true.
   */
  expandUnits?: boolean;
  /**
   * Educational scripts commonly say "Class III", "Chapter IV", etc. When
   * true, contextual Roman numerals are converted to Arabic numbers. Default: true.
   */
  expandRomanNumerals?: boolean;
}

/**
 * Clean and normalize a chunk of text for TTS synthesis.
 * Returns a string safe to pass as `input.text` to Google Cloud TTS.
 */
export function preprocessTextForTTS(
  raw: string,
  options: PreprocessOptions = {}
): string {
  if (!raw || typeof raw !== 'string') return '';

  const { language = 'en', expandUnits = true, expandRomanNumerals = true } = options;

  let text = raw;

  // 1. Strip fenced/inline code — the actual code content is not narratable.
  text = stripCodeBlocks(text);

  // 2. Strip HTML / XML tags (in case the script accidentally has them).
  text = stripHtmlTags(text);

  // 3. Strip images and turn markdown links into their label text.
  text = stripMarkdownImages(text);
  text = stripMarkdownLinks(text);

  // 4. Remove raw URLs and emails so they're not read character-by-character.
  text = stripUrlsAndEmails(text);

  // 5. Remove emoji — reading them out interrupts the listening flow.
  text = stripEmoji(text);

  // 6. Strip remaining markdown syntax (bold, italic, strike, blockquote,
  //    headings, list bullets, table pipes) while keeping the text content.
  text = stripMarkdownSyntax(text);

  // 7. Dashes: em/en → comma pause; word-word hyphens → space so "-" is
  //    NOT spoken as "minus" in compound words like "step-by-step".
  text = normalizeDashes(text);

  // 8. Expand common abbreviations (e.g., i.e., etc., Dr., Prof., vs.).
  text = expandAbbreviations(text, language);

  // 9. Expand well-known chemistry / molecular formulas so numeric
  //    subscripts are spoken correctly (H2O → "H two O").
  text = expandChemicalFormulas(text);

  // 10. Class III → Class 3 (only after "class/chapter/part/…" context words).
  if (expandRomanNumerals) text = expandContextualRomanNumerals(text);

  // 11. Units and symbols: 50% → "50 percent", $10 → "10 dollars", etc.
  if (expandUnits) text = expandUnitsAndSymbols(text, language);

  // 12. Collapse whitespace / stray punctuation runs, and make sure Devanagari
  //      punctuation is spaced so it actually produces a pause.
  text = normalizeWhitespaceAndPunctuation(text);

  // 13. Guarantee a closing terminator in the correct script, so the line ends
  //      with a falling intonation instead of running into the next one.
  text = ensureSentenceTerminator(text, language);

  return text.trim();
}

// ---------------------------------------------------------------------------
// Step implementations
// ---------------------------------------------------------------------------

/** Remove fenced code blocks (```...```) and inline `code` spans. */
function stripCodeBlocks(text: string): string {
  // Fenced blocks first (multiline) so their inline spans don't leak out.
  text = text.replace(/```[\s\S]*?```/g, ' ');
  // Inline code — keep the inner content since it might be a term worth reading.
  text = text.replace(/`([^`]+)`/g, '$1');
  return text;
}

function stripHtmlTags(text: string): string {
  return text.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');
}

function stripMarkdownImages(text: string): string {
  // ![alt](url) → alt (or blank if no alt)
  return text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
}

function stripMarkdownLinks(text: string): string {
  // [label](url) → label
  return text.replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1');
}

function stripUrlsAndEmails(text: string): string {
  // Emails
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, ' ');
  // Bare URLs
  text = text.replace(/\bhttps?:\/\/\S+/gi, ' ');
  text = text.replace(/\bwww\.[^\s)]+/gi, ' ');
  return text;
}

/**
 * Remove emoji using a Unicode property-aware range. Covers the majority
 * of the emoji ranges without eating Devanagari or other useful scripts.
 */
function stripEmoji(text: string): string {
  // Unicode property escapes are supported in Node ≥ 12 with the `u` flag.
  try {
    return text.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, ' ');
  } catch {
    // Fallback ASCII-safe path: strip the common BMP + supplemental ranges.
    return text.replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu,
      ' '
    );
  }
}

/**
 * Strip markdown syntax while preserving the readable words. Handles:
 *   **bold** *italic* _italic_ ~~strike~~
 *   # headings (any level)
 *   > blockquotes
 *   - / * / + / 1. list bullets at line start
 *   | table pipes
 */
function stripMarkdownSyntax(text: string): string {
  // Bold ** or __
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  text = text.replace(/__([^_\n]+)__/g, '$1');
  // Italic single * or _ (avoid unbalanced runs)
  text = text.replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, '$1$2');
  text = text.replace(/(^|[^_\w])_([^_\n]+)_(?=[^_\w]|$)/g, '$1$2');
  // Strikethrough
  text = text.replace(/~~([^~\n]+)~~/g, '$1');
  // Headings — strip leading # up to level 6
  text = text.replace(/^#{1,6}\s+/gm, '');
  // Blockquote markers
  text = text.replace(/^>\s?/gm, '');
  // Ordered/unordered list markers at start of line
  text = text.replace(/^[ \t]*(?:[-*+]|\d+\.)\s+/gm, '');
  // Table pipes — replace with commas so a row still reads sensibly
  text = text.replace(/\s*\|\s*/g, ', ');
  return text;
}

/**
 * Dashes:
 *   - em dash "—" and en dash "–" → ", " (short pause)
 *   - hyphen in compound words (letter-letter) → space
 *   - hyphen between numbers (10-20) preserved as "to" so it reads naturally
 * Preserves hyphens next to digits when it might be a math expression like
 * "a - b" (letters around " - " with spaces stay as "minus" candidate — most
 * podcast scripts use spaced hyphens for interjections; convert those too).
 */
function normalizeDashes(text: string): string {
  // Em/en dashes → comma-pause (safe everywhere)
  text = text.replace(/[\u2013\u2014]/g, ', ');
  // Spaced hyphen used as an em-dash substitute in prose: " - " → ", "
  text = text.replace(/ - /g, ', ');
  // Numeric range "10-20" → "10 to 20"
  text = text.replace(/(\d+)\s*-\s*(\d+)/g, '$1 to $2');
  // Compound word hyphen (letter-letter, no digit involved): "step-by-step"
  // → "step by step". Repeat until no more matches (handles chains).
  let prev;
  do {
    prev = text;
    text = text.replace(/([A-Za-z])-([A-Za-z])/g, '$1 $2');
  } while (text !== prev);
  return text;
}

// ---------------------------------------------------------------------------
// Abbreviations
// ---------------------------------------------------------------------------

const ABBREV_MAP: Array<[RegExp, string]> = [
  // Latin abbreviations — must match with the period so we don't touch words
  // that happen to start with the same letters (e.g. "e.g." vs "egg").
  [/\be\.g\./gi, 'for example'],
  [/\bi\.e\./gi, 'that is'],
  [/\betc\./gi, 'et cetera'],
  [/\bvs\./gi, 'versus'],
  [/\bapprox\./gi, 'approximately'],
  [/\bcf\./gi, 'compare'],
  [/\bviz\./gi, 'namely'],
  [/\bN\.B\./gi, 'note'],
  [/\bw\.r\.t\./gi, 'with respect to'],
  [/\bA\.M\./g, 'A M'],
  [/\bP\.M\./g, 'P M'],
  // Titles
  [/\bDr\.\s+/g, 'Doctor '],
  [/\bProf\.\s+/g, 'Professor '],
  [/\bMr\.\s+/g, 'Mister '],
  [/\bMrs\.\s+/g, 'Missus '],
  [/\bMs\.\s+/g, 'Miss '],
  [/\bSt\.\s+/g, 'Saint '],
  // Common exam/education abbreviations that TTS mispronounces if lowercased
  [/\bNo\.\s*(\d)/g, 'number $1'],
  [/\bpp\.\s*(\d)/g, 'pages $1'],
  [/\bp\.\s*(\d)/g, 'page $1'],
  [/\bch\.\s*(\d)/gi, 'chapter $1'],
  [/\bfig\.\s*(\d)/gi, 'figure $1'],
];

function expandAbbreviations(text: string, _language: TTSLanguage): string {
  for (const [pattern, replacement] of ABBREV_MAP) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Chemistry / molecular formulas
// ---------------------------------------------------------------------------

const CHEM_MAP: Record<string, string> = {
  H2O: 'H two O',
  CO2: 'C O two',
  O2: 'O two',
  N2: 'N two',
  H2: 'H two',
  CH4: 'C H four',
  NH3: 'N H three',
  HCl: 'H C L',
  NaCl: 'sodium chloride',
  H2SO4: 'H two S O four',
  HNO3: 'H N O three',
  H3PO4: 'H three P O four',
  CaCO3: 'calcium carbonate',
  NaOH: 'sodium hydroxide',
  KOH: 'potassium hydroxide',
  C6H12O6: 'C six H twelve O six',
};

function expandChemicalFormulas(text: string): string {
  // Replace whole-word matches only.
  for (const [formula, spoken] of Object.entries(CHEM_MAP)) {
    const escaped = formula.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`\\b${escaped}\\b`, 'g'), spoken);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Roman numerals in educational context
// ---------------------------------------------------------------------------

const ROMAN_CONTEXT = /\b(class|chapter|part|volume|section|unit|book|grade|round|phase|stage|level|chapter)\s+(M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))\b/gi;

function expandContextualRomanNumerals(text: string): string {
  return text.replace(ROMAN_CONTEXT, (_full, word: string, numeral: string) => {
    const value = romanToInt(numeral);
    if (!value) return `${word} ${numeral}`;
    return `${word} ${value}`;
  });
}

function romanToInt(s: string): number {
  const map: Record<string, number> = {
    I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
  };
  const upper = s.toUpperCase();
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const cur = map[upper[i]];
    if (!cur) return 0;
    const next = map[upper[i + 1]] || 0;
    if (cur < next) {
      total += next - cur;
      i++;
    } else {
      total += cur;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Units and symbols
// ---------------------------------------------------------------------------

function expandUnitsAndSymbols(text: string, language: TTSLanguage): string {
  // Percentages: "50%" → "50 percent"
  text = text.replace(/(\d)\s*%/g, '$1 percent');

  // Currency: language-aware for the two we care about; fall back to a
  // generic reading elsewhere.
  const rupees = language === 'hi' || language === 'hinglish' ? 'rupees' : 'rupees';
  text = text.replace(/\$\s*(\d[\d,]*(?:\.\d+)?)/g, '$1 dollars');
  text = text.replace(/₹\s*(\d[\d,]*(?:\.\d+)?)/g, `$1 ${rupees}`);
  text = text.replace(/£\s*(\d[\d,]*(?:\.\d+)?)/g, '$1 pounds');
  text = text.replace(/€\s*(\d[\d,]*(?:\.\d+)?)/g, '$1 euros');

  // Degrees (temperature) — kept as digits so the voice pronounces cardinally.
  text = text.replace(/(\d+)\s*°\s*C\b/g, '$1 degrees Celsius');
  text = text.replace(/(\d+)\s*°\s*F\b/g, '$1 degrees Fahrenheit');
  text = text.replace(/(\d+)\s*°/g, '$1 degrees');

  // Multiplication / division symbols
  text = text.replace(/\s*×\s*/g, ' times ');
  text = text.replace(/\s*÷\s*/g, ' divided by ');

  // Ampersand
  text = text.replace(/\s+&\s+/g, ' and ');

  return text;
}

// ---------------------------------------------------------------------------
// Whitespace + trailing punctuation cleanup
// ---------------------------------------------------------------------------

/**
 * Sentence-ending marks across the languages this product narrates.
 *
 * `।` (danda, U+0964) and `॥` (double danda) are the Devanagari full stops used
 * by Hindi and Sanskrit. They were previously absent from every punctuation
 * rule here, which mattered more than it looks: Chirp 3 HD voices accept plain
 * text only — no SSML, no <break> — so PUNCTUATION IS THE ONLY THING THAT
 * CREATES A PAUSE. An unnormalised or missing danda means the voice runs
 * straight through what should be a full stop.
 */
const TERMINATORS = '.!?।॥';
/** Mid-sentence marks, including the Devanagari/Arabic commas. */
const SEPARATORS = ',;:،';

function normalizeWhitespaceAndPunctuation(text: string): string {
  // Collapse whitespace
  text = text.replace(/[\t\r\f\v ]+/g, ' ');
  // Collapse blank lines
  text = text.replace(/\n{3,}/g, '\n\n');
  // Remove repeated punctuation runs like "!!!" or "??" or "।।"
  text = text.replace(
    new RegExp(`([${escapeForClass(TERMINATORS + SEPARATORS)}])\\1{1,}`, 'g'),
    '$1'
  );
  // Strip stray runs of asterisks/underscores that survived earlier stripping
  text = text.replace(/[*_~]{2,}/g, ' ');
  // Space before punctuation
  text = text.replace(
    new RegExp(`\\s+([${escapeForClass(TERMINATORS + SEPARATORS)}])`, 'g'),
    '$1'
  );
  // Ensure a space AFTER punctuation. "वाक्य।अगला" reads as one run-on breath;
  // separating them lets the engine treat it as two sentences and pause.
  text = text.replace(
    new RegExp(`([${escapeForClass(TERMINATORS + SEPARATORS)}])(?=[^\\s${escapeForClass(TERMINATORS + SEPARATORS)}\\d])`, 'g'),
    '$1 '
  );
  // Space collapse again
  text = text.replace(/ {2,}/g, ' ');
  return text;
}

/** Escape a set of characters for safe use inside a regex character class. */
function escapeForClass(chars: string): string {
  return chars.replace(/[\\\]^-]/g, '\\$&');
}

/**
 * Guarantee the line ends on a terminator, in the right script.
 *
 * A line ending without punctuation gets no closing fall and no gap before the
 * next line, which is a large part of why multi-line narration sounds clipped
 * and mechanical. Devanagari text gets a danda; everything else a period.
 */
export function ensureSentenceTerminator(text: string, language: TTSLanguage): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const last = trimmed[trimmed.length - 1];
  if (TERMINATORS.includes(last) || last === '"' || last === '”' || last === ')') {
    return trimmed;
  }

  // Choose the terminator by SCRIPT rather than by the language label, so a
  // Hinglish line written in Devanagari still ends correctly.
  const hasDevanagari = /[\u0900-\u097F]/.test(trimmed);
  const useDanda = hasDevanagari && (language === 'hi' || language === 'hinglish' || language === 'sa');
  return trimmed + (useDanda ? '।' : '.');
}
