import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { DocumentBlock, DocumentSpec } from './artifact.types';

/**
 * Renders a DocumentSpec to a branded PDF, server-side.
 *
 * Built on `pdf-lib`, which this repo already ships and uses in production (bookLibrary cover
 * extraction). The Phase 0 plan named `@react-pdf/renderer`; it is not installed, and adding a
 * React reconciler + layout engine to a shared branch — to run on a 2 vCPU / 3.8 GB VM — buys
 * layout convenience for a document shape this simple. pdf-lib has no layout engine, so wrapping,
 * pagination and measurement are done here, which is also what makes the output predictable.
 *
 * Notation without an embedded font: the standard PDF fonts already cover physics notation between
 * them. Helvetica/Times (WinAnsi) draw ² ³ ° ± × – ‘ ’; the Symbol font draws every Greek letter
 * and → ≤ ≥ ≈ ≠ √ ∞ ∝ ∑. Text is therefore shaped into runs, each drawn with a font that has its
 * glyphs, and formulae get real subscripts (`F_x`, `p_{AB}`), superscripts (`v^2`, `m s^{-2}`) and
 * textbook-style italic variables. Only characters no standard font has are transliterated.
 */

const PAGE = { width: 595.28, height: 841.89 }; // A4 portrait
const MARGIN = { top: 64, bottom: 56, left: 56, right: 56 };
const COLOR = {
  ink: rgb(0.11, 0.12, 0.15),
  muted: rgb(0.42, 0.45, 0.5),
  rule: rgb(0.85, 0.87, 0.9),
  accent: rgb(0.16, 0.39, 0.85),
  formula: rgb(0.06, 0.2, 0.55),
};
const SIZE = { title: 22, subtitle: 11.5, heading: 13.5, body: 10.5, small: 8.5, formula: 12 };
const LEADING = 1.45;
const SCRIPT_SCALE = 0.68;

/** Last resort for characters no standard font has: subscript digits, a few oddities. */
const FALLBACK: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '⁰': '0', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+',
  '−': '-', '·': '·', '⋅': '·', '∙': '·', '′': "'", '″': '"', '∗': '*',
};
/** Unicode sub/superscript characters that should be drawn as real scripts, not inline digits. */
const UNICODE_SUB = /[₀-₉]/;
const UNICODE_SUP = /[⁰⁴-⁹⁻⁺]/;

/**
 * Upright in a formula, where single-letter variables are italic: function names, and the short
 * English words of a word-equation ("Change in momentum").
 */
const UPRIGHT_WORDS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'cosec', 'log', 'ln', 'exp', 'max', 'min', 'lim', 'net', 'const',
  'in', 'of', 'the', 'is', 'per', 'and', 'to', 'by', 'on', 'at', 'as', 'for', 'or',
]);

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  symbol: PDFFont;
  mathRoman: PDFFont;
  mathItalic: PDFFont;
}

export interface Run {
  text: string;
  font: PDFFont;
  size: number;
  /** Baseline offset: negative for subscripts, positive for superscripts. */
  rise: number;
}

type Script = 'normal' | 'sub' | 'sup';

/** Which characters each font can encode, computed once per document. */
class Coverage {
  private readonly sets = new Map<PDFFont, Set<number>>();
  has(font: PDFFont, ch: string): boolean {
    let set = this.sets.get(font);
    if (!set) {
      set = new Set(font.getCharacterSet());
      this.sets.set(font, set);
    }
    return set.has(ch.codePointAt(0)!);
  }
}

export class Shaper {
  private readonly coverage = new Coverage();
  constructor(readonly fonts: Fonts) {}

  /** Plain text: base font where it has the glyph, Symbol where it does not. */
  shape(text: string, base: PDFFont, size: number): Run[] {
    const runs: Run[] = [];
    for (const ch of String(text ?? '')) this.push(runs, ch, base, size, 'normal');
    return runs;
  }

  /**
   * A formula: `_x` / `_{AB}` subscripts, `^2` / `^{-2}` superscripts, italic single-letter
   * variables, upright numbers, operators and function names (sin, tan, max).
   */
  shapeFormula(text: string, size: number, context: { unitsOnly?: boolean } = {}): Run[] {
    const runs: Run[] = [];
    const src = String(text ?? '');
    // "1 N = 1 kg m s^-2" relates units, and SI units are set upright. Callers that shape a formula
    // word by word (for wrapping) pass this in, since no single word can tell.
    const unitsOnly = context.unitsOnly ?? /^\s*\d/.test(src);
    let i = 0;
    const readGroup = (start: number): { body: string; end: number } => {
      if (src[start] === '{') {
        const close = src.indexOf('}', start);
        if (close > start) return { body: src.slice(start + 1, close), end: close + 1 };
      }
      // Without braces: a script is a run of letters/digits (and a sign for exponents).
      let end = start;
      if (src[end] === '-' || src[end] === '–' || src[end] === '−' || src[end] === '+') end++;
      while (end < src.length && /[A-Za-z0-9]/.test(src[end])) end++;
      return { body: src.slice(start, end), end };
    };

    while (i < src.length) {
      const ch = src[i];
      if ((ch === '_' || ch === '^') && i + 1 < src.length) {
        const { body, end } = readGroup(i + 1);
        if (body) {
          for (const c of body) this.pushFormulaChar(runs, c, size, ch === '_' ? 'sub' : 'sup', body);
          i = end;
          continue;
        }
      }
      // Words: function names and prose ("Force", "momentum") upright, short variables italic.
      if (/[A-Za-z]/.test(ch)) {
        let end = i;
        while (end < src.length && /[A-Za-z]/.test(src[end])) end++;
        const word = src.slice(i, end);
        const upright = unitsOnly || UPRIGHT_WORDS.has(word.toLowerCase()) || word.length >= 4;
        for (const c of word) this.push(runs, c, upright ? this.fonts.mathRoman : this.fonts.mathItalic, size, 'normal');
        i = end;
        continue;
      }
      this.pushFormulaChar(runs, ch, size, 'normal', ch);
      i++;
    }
    return runs;
  }

  private pushFormulaChar(runs: Run[], ch: string, size: number, script: Script, context: string): void {
    const italic = script !== 'normal' && /[A-Za-z]/.test(ch) && context.length <= 2;
    this.push(runs, ch, italic ? this.fonts.mathItalic : this.fonts.mathRoman, size, script);
  }

  private push(runs: Run[], raw: string, base: PDFFont, size: number, script: Script): void {
    let ch = raw;
    let scr = script;
    if (UNICODE_SUB.test(ch)) scr = 'sub';
    else if (UNICODE_SUP.test(ch)) scr = 'sup';

    let font: PDFFont | null = null;
    if (this.coverage.has(base, ch)) font = base;
    else if (this.coverage.has(this.fonts.symbol, ch)) font = this.fonts.symbol;
    else if (FALLBACK[ch] !== undefined) {
      ch = FALLBACK[ch];
      font = this.coverage.has(base, ch) ? base : this.coverage.has(this.fonts.symbol, ch) ? this.fonts.symbol : null;
    }
    if (!font || ch === '') return; // no standard font has it: drop rather than fail the render

    const runSize = scr === 'normal' ? size : size * SCRIPT_SCALE;
    const rise = scr === 'sub' ? -size * 0.22 : scr === 'sup' ? size * 0.36 : 0;
    const last = runs[runs.length - 1];
    if (last && last.font === font && last.size === runSize && last.rise === rise) last.text += ch;
    else runs.push({ text: ch, font, size: runSize, rise });
  }
}

export const runsWidth = (runs: Run[]): number => runs.reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, r.size), 0);

/**
 * Greedy word wrap over shaped runs. Words are shaped independently and joined by a space of the
 * base font; a single word wider than the line (a long formula) is split between characters.
 */
export function wrapRuns(words: Run[][], spaceRun: Run, maxWidth: number): Run[][] {
  const lines: Run[][] = [];
  const space = runsWidth([spaceRun]);
  let line: Run[] = [];
  let width = 0;
  const flush = () => {
    if (line.length) lines.push(line);
    line = [];
    width = 0;
  };
  for (const word of words) {
    const w = runsWidth(word);
    if (line.length && width + space + w <= maxWidth) {
      line.push(spaceRun, ...word);
      width += space + w;
      continue;
    }
    if (line.length) flush();
    if (w <= maxWidth) {
      line = [...word];
      width = w;
      continue;
    }
    // Break an over-long word between characters.
    for (const run of word) {
      for (const ch of run.text) {
        const piece = { ...run, text: ch };
        const pw = runsWidth([piece]);
        if (width + pw > maxWidth && line.length) flush();
        line.push(piece);
        width += pw;
      }
    }
  }
  flush();
  return lines;
}

class Cursor {
  page: PDFPage;
  y: number;
  readonly pages: PDFPage[] = [];

  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: Fonts,
    private readonly shaper: Shaper,
    private readonly footer: string,
  ) {
    this.page = this.newPage();
    this.y = PAGE.height - MARGIN.top;
  }

  private newPage(): PDFPage {
    const page = this.pdf.addPage([PAGE.width, PAGE.height]);
    this.pages.push(page);
    return page;
  }

  get contentWidth(): number {
    return PAGE.width - MARGIN.left - MARGIN.right;
  }

  /** Starts a new page when `needed` points would cross the bottom margin. */
  ensure(needed: number): void {
    if (this.y - needed >= MARGIN.bottom) return;
    this.page = this.newPage();
    this.y = PAGE.height - MARGIN.top;
  }

  private drawLine(runs: Run[], x: number, baseline: number, color: any): void {
    let cx = x;
    for (const run of runs) {
      if (run.text.trim()) {
        this.page.drawText(run.text, { x: cx, y: baseline + run.rise, size: run.size, font: run.font, color });
      }
      cx += run.font.widthOfTextAtSize(run.text, run.size);
    }
  }

  write(
    text: string,
    opts: {
      font?: PDFFont;
      size?: number;
      color?: any;
      indent?: number;
      gap?: number;
      formula?: boolean;
      /** Drawn before the text on the first line only (a bullet); wrapped lines hang past it. */
      marker?: string;
      /** A leading label shaped as notation ("f_s, f_k:"), followed by ordinary text. */
      notationLabel?: string;
    } = {},
  ): void {
    const font = opts.font ?? this.fonts.regular;
    const size = opts.size ?? SIZE.body;
    const markerWidth = opts.marker ? font.widthOfTextAtSize(opts.marker, size) : 0;
    const indent = (opts.indent ?? 0) + markerWidth;
    const lineHeight = size * LEADING;
    const paragraphs = String(text ?? '').split('\n');
    paragraphs.forEach((paragraph, p) => {
      const unitsOnly = /^\s*\d/.test(paragraph);
      const words = paragraph
        .split(/[ \t]+/)
        .filter(Boolean)
        .map((w) => (opts.formula ? this.shaper.shapeFormula(w, size, { unitsOnly }) : this.shaper.shape(w, font, size)))
        .filter((runs) => runs.length);
      if (p === 0 && opts.notationLabel) {
        words.unshift(...opts.notationLabel.split(/[ \t]+/).filter(Boolean).map((w) => this.shaper.shapeFormula(w, size)));
      }
      const spaceRun: Run = { text: ' ', font: opts.formula ? this.fonts.mathRoman : font, size, rise: 0 };
      wrapRuns(words, spaceRun, this.contentWidth - indent).forEach((line, i) => {
        this.ensure(lineHeight);
        if (opts.marker && p === 0 && i === 0) {
          this.page.drawText(opts.marker, { x: MARGIN.left + (opts.indent ?? 0), y: this.y - size, size, font, color: opts.color ?? COLOR.ink });
        }
        this.drawLine(line, MARGIN.left + indent, this.y - size, opts.color ?? COLOR.ink);
        this.y -= lineHeight;
      });
    });
    if (opts.gap) this.y -= opts.gap;
  }

  rule(): void {
    this.ensure(10);
    this.page.drawLine({
      start: { x: MARGIN.left, y: this.y },
      end: { x: PAGE.width - MARGIN.right, y: this.y },
      thickness: 0.75,
      color: COLOR.rule,
    });
    this.y -= 12;
  }

  /** Page furniture, drawn once every page exists so "Page 2 of 5" can be truthful. */
  finish(): void {
    const total = this.pages.length;
    this.pages.forEach((page, i) => {
      page.drawLine({
        start: { x: MARGIN.left, y: MARGIN.bottom - 14 },
        end: { x: PAGE.width - MARGIN.right, y: MARGIN.bottom - 14 },
        thickness: 0.75,
        color: COLOR.rule,
      });
      let x = MARGIN.left;
      for (const run of this.shaper.shape(this.footer, this.fonts.regular, SIZE.small)) {
        page.drawText(run.text, { x, y: MARGIN.bottom - 26 + run.rise, size: run.size, font: run.font, color: COLOR.muted });
        x += run.font.widthOfTextAtSize(run.text, run.size);
      }
      const right = `Page ${i + 1} of ${total}`;
      page.drawText(right, {
        x: PAGE.width - MARGIN.right - this.fonts.regular.widthOfTextAtSize(right, SIZE.small),
        y: MARGIN.bottom - 26,
        size: SIZE.small,
        font: this.fonts.regular,
        color: COLOR.muted,
      });
    });
  }
}

function drawBlock(cursor: Cursor, fonts: Fonts, block: DocumentBlock): void {
  switch (block.type) {
    case 'paragraph':
      cursor.write(block.text, { gap: 6 });
      break;
    case 'bullets':
      for (const item of block.items) cursor.write(item, { indent: 10, marker: '•  ' });
      cursor.y -= 6;
      break;
    case 'formulae':
      for (const item of block.items) {
        cursor.ensure(SIZE.formula * LEADING * 2.4);
        cursor.write(item.formula, { formula: true, size: SIZE.formula, color: COLOR.formula, indent: 10 });
        if (item.meaning) cursor.write(item.meaning, { size: SIZE.body - 0.5, color: COLOR.ink, indent: 22 });
        if (item.note) cursor.write(item.note, { size: SIZE.small, color: COLOR.muted, indent: 22 });
        cursor.y -= 5;
      }
      break;
    case 'keyValue':
      for (const item of block.items) {
        // A symbol label ("f_s, f_k", "μ_s", "F") is set as notation; a term ("Inertia") as text.
        const symbolic = /[_^]/.test(item.label) || item.label.replace(/[\s,]/g, '').length <= 3;
        if (symbolic) cursor.write(item.value, { indent: 10, notationLabel: `${item.label}:` });
        else cursor.write(`${item.label}: ${item.value}`, { indent: 10 });
      }
      cursor.y -= 6;
      break;
  }
}

export interface RenderedDocument {
  bytes: Uint8Array;
  pageCount: number;
}

export async function renderDocumentPdf(spec: DocumentSpec): Promise<RenderedDocument> {
  const pdf = await PDFDocument.create();
  // Metadata is stored as UTF-16, so the title keeps its dashes and Greek letters as written.
  pdf.setTitle(spec.title);
  pdf.setCreator('Sadhya');
  pdf.setProducer('Sadhya');

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
    symbol: await pdf.embedFont(StandardFonts.Symbol),
    mathRoman: await pdf.embedFont(StandardFonts.TimesRoman),
    mathItalic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
  };
  const shaper = new Shaper(fonts);

  const footer = spec.footerNote || spec.sourceNote || 'Generated by Sadhya';
  const cursor = new Cursor(pdf, fonts, shaper, footer);

  cursor.write('SADHYA', { font: fonts.bold, size: SIZE.small, color: COLOR.accent, gap: 6 });
  cursor.write(spec.title, { font: fonts.bold, size: SIZE.title, gap: 2 });
  if (spec.subtitle) cursor.write(spec.subtitle, { size: SIZE.subtitle, color: COLOR.muted, gap: 2 });
  if (spec.sourceNote) cursor.write(spec.sourceNote, { size: SIZE.small, color: COLOR.muted, gap: 2 });
  cursor.rule();

  for (const section of spec.sections) {
    cursor.ensure(SIZE.heading * LEADING * 3);
    cursor.write(section.heading, { font: fonts.bold, size: SIZE.heading, gap: 4 });
    for (const block of section.blocks) drawBlock(cursor, fonts, block);
    cursor.y -= 6;
  }

  cursor.finish();
  const bytes = await pdf.save();
  return { bytes, pageCount: pdf.getPageCount() };
}
