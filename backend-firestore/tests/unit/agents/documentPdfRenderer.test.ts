/**
 * The PDF renderer. pdf-lib has no layout engine, so wrapping, pagination and notation are ours —
 * and a physics formula chart is exactly the content that breaks naive PDF text drawing.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Fonts, Run, Shaper, renderDocumentPdf, runsWidth, wrapRuns } from '../../../src/agents/artifacts/documentPdf.renderer';
import { DocumentSpec } from '../../../src/agents/artifacts/artifact.types';

let fonts: Fonts;
let shaper: Shaper;
beforeAll(async () => {
  const pdf = await PDFDocument.create();
  fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
    symbol: await pdf.embedFont(StandardFonts.Symbol),
    mathRoman: await pdf.embedFont(StandardFonts.TimesRoman),
    mathItalic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
  };
  shaper = new Shaper(fonts);
});

const textOf = (runs: Run[]) => runs.map((r) => r.text).join('');
const runFor = (runs: Run[], text: string) => runs.find((r) => r.text.includes(text))!;

describe('Shaper.shape (prose)', () => {
  it('draws Greek and maths symbols with the Symbol font and everything else with the base font', () => {
    const runs = shaper.shape('θ = ω t, a ≤ μs g', fonts.regular, 10);
    expect(textOf(runs)).toBe('θ = ω t, a ≤ μs g');
    expect(runFor(runs, 'θ').font).toBe(fonts.symbol);
    expect(runFor(runs, '≤').font).toBe(fonts.symbol);
    expect(runFor(runs, ' = ').font).toBe(fonts.regular);
  });

  it('keeps the WinAnsi characters the base font already has, instead of spelling them out', () => {
    const runs = shaper.shape('v² at 30° ± 2 × 3 – “quoted”', fonts.regular, 10);
    expect(textOf(runs)).toBe('v² at 30° ± 2 × 3 – “quoted”');
    expect(runs.every((r) => r.font === fonts.regular)).toBe(true);
  });

  it('drops only what no standard font can draw, without throwing', () => {
    expect(textOf(shaper.shape('formula 漢字 here', fonts.regular, 10))).toBe('formula  here');
  });
});

describe('Shaper.shapeFormula', () => {
  it('turns _x and ^2 into real subscripts and superscripts', () => {
    const runs = shaper.shapeFormula('F_x=dp_x/dt', 12);
    const subs = runs.filter((r) => r.rise < 0);
    expect(subs.map((r) => r.text).join('')).toBe('xx');
    expect(subs.every((r) => r.size < 12)).toBe(true);

    const sup = shaper.shapeFormula('v^2', 12).find((r) => r.rise > 0)!;
    expect(sup.text).toBe('2');
    expect(sup.size).toBeLessThan(12);
  });

  it('reads braced groups and signed exponents', () => {
    expect(shaper.shapeFormula('F_{AB}', 12).filter((r) => r.rise < 0).map((r) => r.text).join('')).toBe('AB');
    expect(shaper.shapeFormula('m s^-2', 12).filter((r) => r.rise > 0).map((r) => r.text).join('')).toBe('-2');
    expect(shaper.shapeFormula('p_A\'', 12).find((r) => r.text.includes("'"))!.rise).toBe(0); // the prime is not subscripted
  });

  it('sets variables in italic and function names and words upright, like a textbook', () => {
    const runs = shaper.shapeFormula('tan θ = μs', 12);
    expect(runFor(runs, 'tan').font).toBe(fonts.mathRoman);
    expect(runFor(runs, 'θ').font).toBe(fonts.symbol);
    expect(runFor(runs, 's').font).toBe(fonts.mathItalic);
    expect(runFor(shaper.shapeFormula('Impulse = F', 12), 'Impulse').font).toBe(fonts.mathRoman);
    expect(runFor(shaper.shapeFormula('F = ma', 12), 'ma').font).toBe(fonts.mathItalic);
  });

  it('treats Unicode subscript digits as subscripts', () => {
    const runs = shaper.shapeFormula('F₁ + F₂ = 0', 12);
    expect(runs.filter((r) => r.rise < 0).map((r) => r.text).join('')).toBe('12');
  });
});

describe('wrapRuns', () => {
  it('wraps shaped words to the width, and splits a word too long for any line', () => {
    const words = 'the quick brown fox jumps over the lazy dog'.split(' ').map((w) => shaper.shape(w, fonts.regular, 10));
    const space: Run = { text: ' ', font: fonts.regular, size: 10, rise: 0 };
    const lines = wrapRuns(words, space, 80);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(runsWidth(line)).toBeLessThanOrEqual(80);

    const long = wrapRuns([shaper.shapeFormula('F=ma+mv+mgh+0.5mv^2+Iα+τr+something', 10)], space, 60);
    expect(long.length).toBeGreaterThan(1);
    for (const line of long) expect(runsWidth(line)).toBeLessThanOrEqual(60 + 1e-6);
  });
});

const spec = (over: Partial<DocumentSpec> = {}): DocumentSpec => ({
  title: 'Laws of Motion — Formula Chart',
  subtitle: 'NCERT Class 11 Physics, Chapter 4',
  sourceNote: 'Every formula matched against the chapter text',
  sections: [
    {
      heading: 'Key formulae',
      blocks: [
        {
          type: 'formulae',
          items: [
            { formula: 'F = ma', meaning: 'Force equals mass times acceleration', note: 'Found in §4.5' },
            { formula: 'f_s ≤ μ_s N', meaning: 'Static friction never exceeds μs N' },
            { formula: 'f_c = mv^2/R' },
          ],
        },
      ],
    },
  ],
  ...over,
});

describe('renderDocumentPdf', () => {
  it('produces a real single-page PDF for a small document', async () => {
    const { bytes, pageCount } = await renderDocumentPdf(spec());
    expect(pageCount).toBe(1);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const reopened = await PDFDocument.load(bytes);
    expect(reopened.getPageCount()).toBe(1);
    expect(reopened.getTitle()).toBe('Laws of Motion — Formula Chart'); // em dash is WinAnsi
  });

  it('paginates long content instead of overflowing one page', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      heading: `Section ${i + 1}`,
      blocks: [{ type: 'paragraph' as const, text: 'Newton’s laws describe motion. '.repeat(12) }],
    }));
    const { pageCount } = await renderDocumentPdf(spec({ sections: many }));
    expect(pageCount).toBeGreaterThan(1);
  });

  it('renders every block type, with Greek, scripts and symbols, without throwing', async () => {
    const { bytes } = await renderDocumentPdf(
      spec({
        sections: [
          {
            heading: 'Everything — θ, μ, Δ',
            blocks: [
              { type: 'paragraph', text: 'A paragraph with Δp and θ in it, and v² ≥ μs R g.' },
              { type: 'bullets', items: ['first point', 'second point → with an arrow'] },
              { type: 'formulae', items: [{ formula: 'τ = r × F', meaning: 'Torque', note: 'Found in §6.7' }] },
              { type: 'keyValue', items: [{ label: 'μs', value: 'coefficient of static friction (no unit)' }] },
            ],
          },
        ],
      }),
    );
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
