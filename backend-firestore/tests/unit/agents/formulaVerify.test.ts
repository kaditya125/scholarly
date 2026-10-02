/**
 * Formula verification against the chapter's own text. The text fixtures below are copied from the
 * real NCERT Class 11 Physics "Laws of Motion" PDF, exactly as pdf-parse extracts them — scrambled
 * fractions, displaced subscripts, the ½ character and all — because those are what the matcher has
 * to survive.
 */
import {
  buildChapterIndex,
  citeSection,
  equationNumberOf,
  extractCandidates,
  formulaAtoms,
  isUncorroboratedStatement,
  isWorkedExample,
  normalizeStrict,
  stripEquationNumber,
  verifyDefinition,
  verifyFormula,
} from '../../../src/agents/tools/adapters/formulaVerify';

// Pages as extracted (abridged), with the table of contents on page 1 like the real chapter.
const PAGES = [
  {
    pageNumber: 1,
    text: 'CHAPTER FOUR\nLAWS OF MOTION\n4.1 Introduction\n4.5 Newton’s second law of motion\n4.6 Newton’s third law of motion\n4.10 Circular motion\n',
  },
  {
    pageNumber: 5,
    text: '4.5 NEWTON’S SECOND LAW OF MOTION\nMomentum, P of a body is defined to be the product of its mass m and velocity v, and is denoted by p:\np = m v (4.1)\nF = kma\n= m a (4.3)\nF = ma\n',
  },
  { pageNumber: 8, text: '4.6 NEWTON’S THIRD LAW OF MOTION\nFAB = – FBA (4.8)\nget apart, with final momenta p′A and p′B\np′A + p′B = pA + pB (4.9)\n' },
  {
    pageNumber: 15,
    text: '4.10 CIRCULAR MOTION\nthis acceleration is :\n2\nc\nmv\nf = R (4.16)\nwhere m is the mass of the body.\nfs ≤ μs N\n',
  },
  { pageNumber: 16, text: 'vo = ( R g tan θ ) ½ (4.22)\nT2 = 6 × 10 = 60 N\n' },
];
const HEADINGS = ['4.1 INTRODUCTION', '4.5 Newton’s second law of motion', '4.6 Newton’s third law of motion', '4.10 Circular motion'];
const index = buildChapterIndex(PAGES, HEADINGS);
const candidate = (formula: string, extra: any = {}) => ({ formula, sources: ['study_notes' as const], ...extra });

describe('normalisation', () => {
  it('treats notational variants as the same formula', () => {
    expect(normalizeStrict('f_s <= μ_s N')).toBe(normalizeStrict('fs ≤ μs N'));
    expect(normalizeStrict('v_o = √(Rg tanθ)')).toBe(normalizeStrict('vo = ( R g tan θ ) ½'));
    expect(normalizeStrict("p_A' + p_B'")).toBe(normalizeStrict('p′A + p′B'));
    expect(normalizeStrict('F_AB = -F_BA')).toBe(normalizeStrict('FAB = – FBA'));
    expect(normalizeStrict('v^2')).toBe(normalizeStrict('v2'));
  });

  it('leaves apostrophes in words alone', () => {
    expect(normalizeStrict("Aristotle's")).toBe("aristotle's");
  });

  it('separates the book’s equation number from the formula', () => {
    expect(stripEquationNumber('fc = mv^2 / R (4.16)')).toBe('fc = mv^2 / R');
    expect(equationNumberOf('fc = mv^2 / R (4.16)')).toBe('4.16');
    expect(equationNumberOf('vO = (R g tan θ)^1/2 (Eq. 4.22)')).toBe('4.22');
    expect(equationNumberOf('N cos θ = mg + μs N sin θ (4.20a)')).toBe('4.20a');
    expect(equationNumberOf('F = ma')).toBeUndefined();
  });
});

describe('worked examples are not formulae', () => {
  it.each(['T2 = 6 × 10 = 60 N', 'μs = tan 15° = 0.27', 'amax = 0.15 x 10 m s–2 = 1.5 m s–2', '270 – R′ = 27 × 0.1 N', 'x-component of impulse = –2 m u cos 30°', 'Change in momentum = 0.15 × 12 – (–0.15 × 12) = 3.6 N s'])(
    'rejects %s',
    (f) => expect(isWorkedExample(f)).toBe(true),
  );

  it.each(['F = ma', 'F_1 + F_2 + F_3 = 0', 'F1x + F2x + F3x = 0', '1 N = 1 kg m s^-2', 'y = ut + (1/2)gt^2', 'v^2 ≤ μs R g', 'f_c = mv^2/R'])(
    'keeps %s',
    (f) => expect(isWorkedExample(f)).toBe(false),
  );

  it('drops statements only the graph proposed, keeps word-equations the notes corroborate', () => {
    expect(isUncorroboratedStatement({ formula: 'y-component of impulse = 0', sources: ['knowledge_graph'] })).toBe(true);
    expect(isUncorroboratedStatement({ formula: 'Impulse = Force × time duration', sources: ['study_notes', 'knowledge_graph'] })).toBe(false);
  });
});

describe('extractCandidates', () => {
  it('merges the same formula from both sources, keeping the notes’ meaning and the graph’s equation number', () => {
    const { candidates, dropped } = extractCandidates({
      studyNotes: [{ formula: 'f_c = mv^2/R', meaning: 'Centripetal force' }, { formula: 'Impulse is a vector' }],
      graph: ['fc = mv^2 / R (4.16)', 'T2 = 6 × 10 = 60 N'],
    });
    expect(candidates).toEqual([{ formula: 'f_c = mv^2/R', meaning: 'Centripetal force', sources: ['study_notes', 'knowledge_graph'], equation: '4.16' }]);
    expect(dropped).toEqual({ worked_example: 1, not_a_formula: 1 });
  });
});

describe('verifyFormula', () => {
  it('verifies a formula found as written, with its page and section', () => {
    expect(verifyFormula(candidate('F = ma'), index)).toMatchObject({ status: 'verified', match: 'exact', page: 5, section: '4.5 Newton’s second law of motion' });
  });

  it('locates sections by their last occurrence, not the table of contents', () => {
    expect(verifyFormula(candidate('F_AB = -F_BA'), index)).toMatchObject({ section: '4.6 Newton’s third law of motion', page: 8 });
  });

  it('verifies across notation the PDF writes differently', () => {
    expect(verifyFormula(candidate('f_s <= μ_s N'), index)).toMatchObject({ status: 'verified' });
    expect(verifyFormula(candidate('v_o = √(Rg tanθ)'), index)).toMatchObject({ status: 'verified', page: 16 });
    expect(verifyFormula(candidate("p_A' + p_B' = p_A + p_B"), index)).toMatchObject({ status: 'verified' });
  });

  it('verifies a chain written whole, and a chain whose links only appear separately', () => {
    expect(verifyFormula(candidate('F = kma = ma'), index)).toMatchObject({ status: 'verified', match: 'exact' });
    const apart = buildChapterIndex([{ pageNumber: 6, text: 'The second law reads F = kma. In SI units k = 1, so kma = ma.' }]);
    expect(verifyFormula(candidate('F = kma = ma'), apart)).toMatchObject({ status: 'verified', match: 'chain' });
    const halfThere = buildChapterIndex([{ pageNumber: 6, text: 'The second law reads F = kma.' }]);
    expect(verifyFormula(candidate('F = kma = ma'), halfThere)).toMatchObject({ status: 'not_found' });
  });

  it('is not confused by symbols that run together once line breaks are removed', () => {
    // Real extraction: "final momenta p′A and p′B" followed on the next line by "p′A + p′B = …".
    expect(verifyFormula(candidate("p_A' + p_B' = p_A + p_B"), index)).toMatchObject({ status: 'verified', match: 'exact', page: 8 });
  });

  it('verifies a scrambled fraction by its equation number and the symbols just before it', () => {
    expect(verifyFormula(candidate('f_c = mv^2/R', { equation: '4.16' }), index)).toMatchObject({ status: 'verified', match: 'equation', page: 15 });
    // The same formula with no equation number to anchor it stays unverified — no guessing.
    expect(verifyFormula(candidate('f_c = mv^2/R'), index)).toMatchObject({ status: 'not_found' });
  });

  it('does not accept an equation number whose surrounding symbols do not fit', () => {
    expect(verifyFormula(candidate('τ = r × F', { equation: '4.16' }), index)).toMatchObject({ status: 'not_found' });
  });

  it('refuses what is not in the chapter, however true it is', () => {
    expect(verifyFormula(candidate('E = mc^2'), index)).toMatchObject({ status: 'not_found' });
    expect(verifyFormula(candidate('T2 = 6 × 10 = 60 N'), index)).toMatchObject({ status: 'worked_example' });
  });

  it('reads the atoms of a formula', () => {
    expect(formulaAtoms('N cos θ = mg + μ_s N sin θ').sort()).toEqual(['cos', 'g', 'm', 'n', 's', 'sin', 'θ', 'μ'].sort());
  });
});

describe('verifyDefinition', () => {
  it('accepts a definition in the chapter’s own words and cites it', () => {
    const def = { term: 'momentum', definition: 'Momentum, P of a body is defined to be the product of its mass m and velocity v' };
    expect(verifyDefinition(def, index)).toMatchObject({ term: 'momentum', page: 5 });
  });

  it('rejects a paraphrase', () => {
    expect(verifyDefinition({ term: 'momentum', definition: 'Momentum is how hard it is to stop a moving thing in its tracks' }, index)).toBeNull();
  });
});

describe('citeSection', () => {
  it('formats a heading as a citation', () => {
    expect(citeSection('4.5 NEWTON’S SECOND LAW OF MOTION')).toBe('§4.5 Newton’s Second Law of Motion');
    expect(citeSection('4.10 Circular motion')).toBe('§4.10 Circular motion');
    expect(citeSection(undefined)).toBeUndefined();
  });
});
