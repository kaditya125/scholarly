/**
 * Formula verification against the chapter's own text (Phase 5, the flagship).
 *
 * The brief's rule is "verify every formula against trusted sources; do not allow the model to
 * hallucinate formulas". The most trusted source Sadhya holds for an NCERT chapter is the chapter
 * itself, so a formula counts as verified only when it can be found in the text of the chapter's
 * PDF. Everything here is deterministic string work — no model, no embeddings.
 *
 * Candidates come from two places that can each be wrong in their own way:
 *   - the KEY_FORMULAE study asset: model-written, with helpful meanings, never checked;
 *   - the knowledge graph's FORMULA nodes: extracted from the text, but mixed with worked-example
 *     arithmetic ("T2 = 6 × 10 = 60 N") that is not a formula at all.
 *
 * Matching tolerates what PDF text extraction does to notation: spaces vanish or multiply,
 * superscripts become plain digits ("mv2/r"), subscripts run into their symbol ("fs"), dashes and
 * minus signs vary. It does not paraphrase: a word-equation ("Impulse = Force × time") that is not
 * in the text is not verified, however true it is.
 */

import { displayCase } from './compose.adapter';

export interface FormulaCandidate {
  /** Display form, in the renderer's markup: `F_x = dp_x/dt`, `v^2`. */
  formula: string;
  meaning?: string;
  sources: Array<'study_notes' | 'knowledge_graph'>;
  /** The book's own equation number, when an extraction recorded it: "4.16", "4.20a". */
  equation?: string;
}

export type VerifiedFormula = FormulaCandidate & {
  status: 'verified';
  /**
   * exact: found as written; chain: every link of A = B = C found; loose: found ignoring brackets
   * and slashes; equation: the book's numbered equation is present and every symbol of the formula
   * appears just before it (for layouts — fractions, subscripts — that PDF text scrambles).
   */
  match: 'exact' | 'chain' | 'loose' | 'equation';
  section?: string;
  page?: number;
};

export type RejectedFormula = FormulaCandidate & {
  status: 'not_found' | 'worked_example' | 'not_a_formula';
};

export interface ChapterPage {
  pageNumber: number;
  text: string;
}

export interface ChapterIndex {
  strict: string;
  loose: string;
  /** Section starts in `strict` coordinates, in reading order. */
  sections: Array<{ heading: string; at: number }>;
  /** Page starts in `strict` coordinates, in reading order. */
  pages: Array<{ pageNumber: number; at: number }>;
}

const DASHES = /[‐-―−‒]/g;
const MULTIPLY = /[×·⋅∙*]/g;

/**
 * Case, spacing, dashes, multiplication signs and the renderer's _ ^ { } markup, normalised away —
 * and the notational variants that mean the same thing written differently:
 *   <= ≤ and >= ≥;  ½ (which NFKC turns into 1⁄2) and 1/2;  √(x) and (x)^½ (NCERT writes the latter);
 *   p_A' and p′A (NCERT puts the prime before the subscript).
 */
export function normalizeStrict(text: string): string {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/⁄/g, '/')
    .replace(/√\s*\(([^()]*)\)/g, '($1)^1/2')
    .replace(/√\s*([A-Za-z0-9]+)/g, '($1)^1/2')
    .toLowerCase()
    .replace(/[‘’′]/g, "'")
    .replace(DASHES, '-')
    .replace(MULTIPLY, '')
    .replace(/[_^{}]/g, '')
    // Only a symbol — a lone letter with a short subscript, at a token boundary — has its prime
    // moved. This must run while spaces still separate tokens: once they are gone, "p′B p′A" reads
    // as "p'bp'a" and "bp'" would be mistaken for a subscripted symbol. "aristotle's" is untouched.
    .replace(/(^|[\s+\-=(,])([a-zα-ω])([a-z0-9]{1,2})'/g, "$1$2'$3")
    .replace(/\s+/g, '');
}

/** Additionally ignores brackets and slashes, which fraction layouts in PDFs often lose. */
export function normalizeLoose(text: string): string {
  return normalizeStrict(text).replace(/[()[\]/|]/g, '');
}

const EQUATION_NUMBER = /\s*\(\s*(?:eq\.?\s*)?(\d+\.\d+[a-z]?)\s*\)\s*$/i;

/** "fc = mv^2 / R (4.16)" → "fc = mv^2 / R". Equation numbers are the book's, not the formula's. */
export function stripEquationNumber(formula: string): string {
  return String(formula ?? '').replace(EQUATION_NUMBER, '').trim();
}

/** "fc = mv^2 / R (4.16)" → "4.16"; also "(Eq. 4.22)". */
export function equationNumberOf(formula: string): string | undefined {
  return String(formula ?? '').match(EQUATION_NUMBER)?.[1]?.toLowerCase();
}

const RELATION = /=|≤|≥|<|>|∝|≈/;

export function isFormula(text: string): boolean {
  return RELATION.test(String(text ?? ''));
}

/**
 * A worked example rather than a formula: its final value is a number (with or without units),
 * e.g. "T2 = 6 × 10 = 60 N", "μs = tan 15° = 0.27", "amax = 0.15 x 10 m s–2 = 1.5 m s–2".
 * A plain "= 0" is allowed — "F1 + F2 + F3 = 0" is a law, not arithmetic.
 */
export function isWorkedExample(formula: string): boolean {
  const text = String(formula ?? '');
  // Specific quantities mark a worked example: an angle in degrees, a decimal, or any free-standing
  // number above 2 ("270 – R′ = 27 × 0.1 N", "–2 m u cos 30°"). Subscript and exponent digits
  // (F_3, F3x, s^-2) and the 1s and 2s of real formulae ("1/2", "2as") do not count.
  if (/\d\s*°/.test(text)) return true;
  const freeNumbers = [...text.matchAll(/(^|[^A-Za-z0-9_^.'′])(\d+(?:\.\d+)?)/g)].map((m) => m[2]);
  if (freeNumbers.some((n) => n.includes('.') || Number(n) > 2)) return true;

  const sides = text.split('=').map((s) => s.trim());
  if (sides.length < 2) return false;
  const last = sides[sides.length - 1];
  const numeric = /^[-–−]?\s*\d+(\.\d+)?(\s*[×x]\s*10\s*[-–−]?\d+)?(\s*[a-zA-Zμ°]+(\s*[-–−]?\d)?)*\s*$/.test(last);
  if (!numeric) return false;
  if (/^[-–−]?\s*0(\.0+)?\s*$/.test(last)) {
    // "... = 0" is a worked example only when the left side is arithmetic too ("5 - 5 = 0").
    return /\d\s*[×x*/+\-–−]\s*\d/.test(sides.slice(0, -1).join('='));
  }
  return true;
}

/** One entry per formula, however many sources proposed it; the study notes' meaning wins. */
export function extractCandidates(input: {
  studyNotes: Array<{ formula: string; meaning?: string }>;
  graph: string[];
}): { candidates: FormulaCandidate[]; dropped: { worked_example: number; not_a_formula: number } } {
  const byKey = new Map<string, FormulaCandidate>();
  const dropped = { worked_example: 0, not_a_formula: 0 };
  const add = (raw: string, meaning: string | undefined, source: FormulaCandidate['sources'][number]) => {
    const formula = stripEquationNumber(raw);
    const equation = equationNumberOf(raw);
    if (!formula) return;
    if (!isFormula(formula)) {
      dropped.not_a_formula++;
      return;
    }
    if (isWorkedExample(formula)) {
      dropped.worked_example++;
      return;
    }
    const key = normalizeLoose(formula);
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (!existing.meaning && meaning) existing.meaning = meaning;
      if (!existing.equation && equation) existing.equation = equation;
      return;
    }
    byKey.set(key, { formula, meaning: meaning?.trim() || undefined, sources: [source], ...(equation ? { equation } : {}) });
  };
  for (const f of input.studyNotes ?? []) add(f.formula, f.meaning, 'study_notes');
  for (const f of input.graph ?? []) add(f, undefined, 'knowledge_graph');
  return { candidates: [...byKey.values()], dropped };
}

/**
 * Builds the searchable chapter. Section headings are located at their LAST occurrence: every
 * NCERT chapter opens with a table of contents listing them all, so the first occurrence is in
 * the contents, not where the section starts.
 */
export function buildChapterIndex(pages: ChapterPage[], headings: string[] = []): ChapterIndex {
  let strict = '';
  const pageStarts: ChapterIndex['pages'] = [];
  for (const page of pages) {
    pageStarts.push({ pageNumber: page.pageNumber, at: strict.length });
    strict += normalizeStrict(page.text);
  }
  const sections: ChapterIndex['sections'] = [];
  for (const heading of headings) {
    const key = normalizeStrict(heading);
    if (key.length < 6) continue;
    const at = strict.lastIndexOf(key);
    if (at >= 0) sections.push({ heading: heading.trim(), at });
  }
  sections.sort((a, b) => a.at - b.at);
  return { strict, loose: normalizeLoose(strict), sections, pages: pageStarts };
}

function locate(index: ChapterIndex, at: number): { section?: string; page?: number } {
  let section: string | undefined;
  for (const s of index.sections) if (s.at <= at) section = s.heading;
  let page: number | undefined;
  for (const p of index.pages) if (p.at <= at) page = p.pageNumber;
  return { section, page };
}

/** Too short to be meaningful evidence on its own ("a=g" matches too easily in loose mode). */
const MIN_STRICT = 3;
const MIN_LOOSE = 6;

/**
 * A statement in words that only the graph extractor proposed ("y-component of impulse = 0") is a
 * line from a worked example, not a formula a student should learn. Word-equations the study notes
 * also give ("Impulse = Force × time duration = Change in momentum") are kept.
 */
export function isUncorroboratedStatement(candidate: FormulaCandidate): boolean {
  if (candidate.sources.length !== 1 || candidate.sources[0] !== 'knowledge_graph') return false;
  return (candidate.formula.match(/[A-Za-z]{4,}/g) ?? []).length >= 2;
}

export function verifyFormula(candidate: FormulaCandidate, index: ChapterIndex): VerifiedFormula | RejectedFormula {
  const formula = candidate.formula;
  if (!isFormula(formula) || isUncorroboratedStatement(candidate)) return { ...candidate, status: 'not_a_formula' };
  if (isWorkedExample(formula)) return { ...candidate, status: 'worked_example' };

  const strict = normalizeStrict(formula);
  if (strict.length >= MIN_STRICT) {
    const at = index.strict.indexOf(strict);
    if (at >= 0) return { ...candidate, status: 'verified', match: 'exact', ...locate(index, at) };
  }

  // A chain "A = B = C" is verified when every link is in the text, even if never written whole.
  const sides = formula.split('=').map((s) => s.trim()).filter(Boolean);
  if (sides.length >= 3) {
    const links = sides.slice(0, -1).map((side, i) => normalizeStrict(`${side}=${sides[i + 1]}`));
    const positions = links.map((l) => (l.length >= MIN_STRICT ? index.strict.indexOf(l) : -1));
    if (positions.every((p) => p >= 0)) {
      return { ...candidate, status: 'verified', match: 'chain', ...locate(index, Math.min(...positions)) };
    }
  }

  const loose = normalizeLoose(formula);
  if (loose.length >= MIN_LOOSE) {
    const at = index.loose.indexOf(loose);
    // `loose` coordinates differ slightly from `strict`; the page/section is still the right one
    // to within a few characters, which is all a citation needs.
    if (at >= 0) return { ...candidate, status: 'verified', match: 'loose', ...locate(index, at) };
  }

  const atEquation = candidate.equation ? equationEvidence(formula, candidate.equation, index) : -1;
  if (atEquation >= 0) return { ...candidate, status: 'verified', match: 'equation', ...locate(index, atEquation) };
  return { ...candidate, status: 'not_found' };
}

const FUNCTION_ATOMS = /sin|cos|tan|cot|sec|log|ln|max|min/g;

/** The symbols a formula is made of: function names whole, every other letter or digit alone. */
export function formulaAtoms(formula: string): string[] {
  const norm = normalizeStrict(formula);
  const atoms: string[] = [...(norm.match(FUNCTION_ATOMS) ?? [])];
  const rest = norm.replace(FUNCTION_ATOMS, ' ');
  for (const ch of rest) if (/[a-z0-9α-ω]/.test(ch)) atoms.push(ch);
  return [...new Set(atoms)];
}

/**
 * Evidence for a formula the PDF text has scrambled: the chapter prints the equation number the
 * extraction recorded, and every symbol of the formula sits in the few characters before it —
 * where a fraction or subscripted term ends up after text extraction ("2 c mv f = R (4.16)").
 * Returns the position of that equation, or -1.
 */
function equationEvidence(formula: string, equation: string, index: ChapterIndex): number {
  const marker = `(${equation.toLowerCase()})`;
  const atoms = formulaAtoms(formula);
  if (atoms.length < 2) return -1;
  for (let at = index.strict.indexOf(marker); at >= 0; at = index.strict.indexOf(marker, at + 1)) {
    const window = index.strict.slice(Math.max(0, at - 90), at);
    if (window.includes('=') && atoms.every((a) => window.includes(a))) return at;
  }
  return -1;
}

export interface DefinitionCandidate {
  term: string;
  definition: string;
}

/**
 * A definition counts as the chapter's own when its opening words appear in the text: extraction
 * copies NCERT's sentences, so a genuine definition is found and a paraphrase is not.
 */
export function verifyDefinition(def: DefinitionCandidate, index: ChapterIndex): (DefinitionCandidate & { section?: string; page?: number }) | null {
  const words = String(def.definition ?? '').replace(/\s+/g, ' ').trim().split(' ');
  if (words.length < 5) return null;
  const opening = normalizeLoose(words.slice(0, Math.min(words.length, 12)).join(' '));
  if (opening.length < 20) return null;
  const at = index.loose.indexOf(opening);
  return at >= 0 ? { ...def, ...locate(index, at) } : null;
}

/** "4.5 NEWTON’S SECOND LAW OF MOTION" → "§4.5 Newton’s Second Law of Motion" for a citation. */
export function citeSection(heading: string | undefined): string | undefined {
  if (!heading) return undefined;
  const m = heading.match(/^\s*(\d+(\.\d+)*)\s+(.*)$/);
  const cased = displayCase(m ? m[3] : heading);
  return m ? `§${m[1]} ${cased}` : cased;
}

/** Sections a chapter uses to state a view in order to overturn it ("4.2 Aristotle’s Fallacy"). */
export const REFUTED_SECTION = /fallac|misconcept|myth|misbelief/i;

export interface GlossaryEntry {
  symbol: string;
  name: string;
  unit: string;
}

/**
 * Standard symbols and their SI units, keyed by the symbol as it appears in a formula. An entry is
 * used only when (1) the symbol occurs in a verified formula and (2) its meaning is attested in the
 * chapter's own text — `p` is momentum in Laws of Motion but pressure in Thermodynamics, and this
 * check is what keeps the two apart.
 */
const GLOSSARY: Record<string, GlossaryEntry & { evidence: RegExp }> = {
  F: { symbol: 'F', name: 'Force', unit: 'newton (N)', evidence: /force/ },
  m: { symbol: 'm', name: 'Mass', unit: 'kilogram (kg)', evidence: /mass/ },
  a: { symbol: 'a', name: 'Acceleration', unit: 'm s⁻²', evidence: /acceleration/ },
  p: { symbol: 'p', name: 'Linear momentum', unit: 'kg m s⁻¹', evidence: /momentum/ },
  v: { symbol: 'v', name: 'Velocity (speed)', unit: 'm s⁻¹', evidence: /velocity/ },
  g: { symbol: 'g', name: 'Acceleration due to gravity', unit: 'm s⁻² (about 9.8 m s⁻²)', evidence: /accelerationduetogravity/ },
  N: { symbol: 'N', name: 'Normal reaction', unit: 'newton (N)', evidence: /normalreaction|normalforce/ },
  μ: { symbol: 'μ_s, μ_k', name: 'Coefficients of static and kinetic friction', unit: 'no unit', evidence: /coefficientof(static|kinetic)?friction/ },
  θ: { symbol: 'θ', name: 'Angle (of an incline or a banked road)', unit: 'degree or radian', evidence: /angle/ },
  t: { symbol: 't', name: 'Time', unit: 'second (s)', evidence: /time/ },
  friction: { symbol: 'f_s, f_k', name: 'Static and kinetic friction', unit: 'newton (N)', evidence: /friction/ },
  centripetal: { symbol: 'f_c', name: 'Centripetal force', unit: 'newton (N)', evidence: /centripetal/ },
};

/**
 * The symbols a formula is written in. Prose words ("Impulse = Force × time duration") and
 * function names contribute nothing, and subscripts are not symbols of their own — the s in f_s is
 * not seconds. f is split by its subscript: f_s / f_k / a bare f are friction, f_c is centripetal.
 */
export function symbolsOf(formula: string): Set<string> {
  const found = new Set<string>();
  let f = String(formula ?? '');
  // "1 N = 1 kg m s^-2" relates units, not quantities: its letters are units.
  if (/^\s*\d/.test(f)) return found;
  if (/(^|[^A-Za-z])f_?c(?![A-Za-z])/.test(f)) found.add('centripetal');
  if (/(^|[^A-Za-z])f_?[sk](?![A-Za-z])/.test(f) || /(^|[^A-Za-z_])f(?![A-Za-z_])/.test(f)) found.add('friction');
  f = f
    .replace(/\b(sin|cos|tan|cot|sec|cosec|log|ln|exp)\b/g, ' ')
    .replace(/(max|min)\b/g, ' ')
    .replace(/[A-Za-z]{4,}/g, ' ') // prose
    .replace(/_\{[^}]*\}|_[A-Za-z0-9]+/g, ' ') // subscripts
    .replace(/\^\{[^}]*\}|\^[-–−]?[A-Za-z0-9]+/g, ' ') // exponents
    .replace(/(^|[^A-Za-z])f[sck]?(?![A-Za-z])/g, '$1 '); // f is handled above
  for (const ch of f) if (/[A-Za-zα-ωΑ-Ω]/.test(ch)) found.add(ch);
  return found;
}

/** The symbols a student meets in the chart, with names and units, in reading order. */
export function buildGlossary(formulae: string[], index: ChapterIndex): GlossaryEntry[] {
  const present = new Set<string>();
  for (const f of formulae) for (const s of symbolsOf(f)) present.add(s);
  return Object.entries(GLOSSARY)
    .filter(([key, entry]) => present.has(key) && entry.evidence.test(index.strict))
    .map(([, { symbol, name, unit }]) => ({ symbol, name, unit }));
}
