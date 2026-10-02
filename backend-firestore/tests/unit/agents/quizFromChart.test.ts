/**
 * Phase 6 — quizzes from a formula chart: answers are the chart's own verified entries, wrong
 * options are other real entries, and the validator refuses anything ambiguous.
 */
import { composeQuizFromDocument, questionCountFromGoal, readChart } from '../../../src/agents/tools/adapters/quiz.adapter';
import { normalizeStrict } from '../../../src/agents/tools/adapters/formulaVerify';
import { CHART, CHART_SOURCE as SOURCE } from './fixtures/lawsOfMotionChart';

describe('readChart', () => {
  it('reads formulae with their chapter section, symbols with units, and statements', () => {
    const { formulae, symbols, statements } = readChart(CHART);
    expect(formulae.find((x) => x.formula === 'f_c = mv^2/R')).toMatchObject({ topic: 'Circular motion', note: expect.stringContaining('p. 15') });
    expect(symbols.find((s) => s.symbol === 'g')).toEqual({ symbol: 'g', name: 'Acceleration due to gravity', unit: 'm s⁻² (about 9.8 m s⁻²)' });
    expect(statements.map((s) => s.label)).toEqual(['Newton’s first law of motion', 'inertia']);
    expect(statements[0]).toMatchObject({ page: 3, statement: expect.not.stringContaining('(p. 3)') });
  });
});

describe('composeQuizFromDocument', () => {
  const quiz = composeQuizFromDocument(SOURCE, 12);

  it('is deterministic: the same chart gives the same quiz', () => {
    expect(composeQuizFromDocument(SOURCE, 12)).toEqual(quiz);
  });

  it('builds the number of questions asked for, titled for the chapter', () => {
    expect(quiz.questions).toHaveLength(12);
    expect(quiz.title).toBe('Laws of Motion — Quiz');
    expect(quiz.durationMinutes).toBe(12);
    expect(quiz.sourceArtifactId).toBe('chart-1');
  });

  it('gives every question four distinct options, exactly one of them the chart’s own entry', () => {
    const { formulae, symbols } = readChart(CHART);
    const truths = new Set([...formulae.map((x) => x.formula), ...symbols.flatMap((s) => [s.name, s.unit])]);
    for (const q of quiz.questions) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => normalizeStrict(o))).size).toBe(4);
      expect(q.correctAnswerIndex).toBeGreaterThanOrEqual(0);
      const answer = q.options[q.correctAnswerIndex];
      // The key is a real chart entry (a formula, its right-hand side, a symbol's name or unit, or a statement label).
      const rhsOk = formulae.some((x) => x.formula.endsWith(answer));
      expect(truths.has(answer) || rhsOk || /law|inertia/i.test(answer)).toBe(true);
    }
  });

  it('never offers an option equivalent to the answer (m s⁻² against m s⁻² “about 9.8”)', () => {
    const unitQuestions = quiz.questions.filter((q) => /SI unit/.test(q.text));
    const all = composeQuizFromDocument(SOURCE, 50).questions.filter((q) => /SI unit/.test(q.text));
    for (const q of [...unitQuestions, ...all]) {
      const keys = q.options.map((o) => o.replace(/\(about[^)]*\)/i, '').trim().toLowerCase());
      expect(new Set(keys).size).toBe(4);
    }
  });

  it('spreads questions across the chart’s sections before repeating one', () => {
    const topics = new Set(quiz.questions.map((q) => q.topic));
    for (const t of ['Newton’s second law of motion', 'Circular motion', 'Common forces in mechanics', 'Symbols and SI units']) {
      expect([...topics]).toContain(t);
    }
    expect(quiz.topics.reduce((n, t) => n + t.count, 0)).toBe(12);
  });

  it('never offers another true completion as a wrong option (F = ma, F = kma and F = -kx all complete “F = ?”)', () => {
    const everything = composeQuizFromDocument(SOURCE, 50);
    const fQuestions = everything.questions.filter((q) => q.text === 'Complete the relation: F = ?');
    expect(fQuestions).toHaveLength(1);
    const wrong = fQuestions[0].options.filter((_, i) => i !== fQuestions[0].correctAnswerIndex);
    for (const trueAnswer of ['ma', 'kma', '-kx']) expect(wrong).not.toContain(trueAnswer);
    expect(everything.validation.rejected.duplicate_question).toBe(2);
  });

  it('cites the chart’s page in each formula question’s explanation', () => {
    const centripetal = composeQuizFromDocument(SOURCE, 50).questions.find((q) => q.options[q.correctAnswerIndex] === 'f_c = mv^2/R');
    expect(centripetal?.explanation).toMatch(/Eq\. \(4\.16\) · §4\.10 Circular Motion|Eq\. \(4\.16\) · §4\.10 Circular motion/);
    expect(centripetal?.explanation).toMatch(/p\. 15 of the chapter PDF/);
  });

  it('marks every question as curriculum-synthesized, never as a past-year question', () => {
    for (const q of quiz.questions) {
      expect(q.questionOrigin).toBe('CURRICULUM_SYNTHESIZED');
      expect(q.identityStatus).toBe('UNANCHORED');
      expect((q as any).sourcePyqId).toBeUndefined();
    }
  });

  it('reports what the validator set aside: two statements cannot make four options', () => {
    const everything = composeQuizFromDocument(SOURCE, 50);
    expect(everything.validation.rejected.not_enough_distinct_options).toBeGreaterThanOrEqual(2);
    expect(everything.validation.accepted).toBe(everything.validation.checked - Object.values(everything.validation.rejected).reduce((a, b) => a + b, 0));
    // And a quiz asked for more than the chart supports is capped, not padded.
    expect(everything.questions.length).toBe(everything.validation.accepted);
  });

  it('narrows to weak topics while still drawing wrong options from the whole chart', () => {
    const weak = composeQuizFromDocument(SOURCE, 10, ['Circular motion']);
    expect(weak.title).toBe('Laws of Motion — Weak-area quiz');
    expect(new Set(weak.questions.map((q) => q.topic))).toEqual(new Set(['Circular motion']));
    const distractors = weak.questions.flatMap((q) => q.options.filter((_, i) => i !== q.correctAnswerIndex));
    expect(distractors.some((d) => /μ_k N|kma|-kx|mv$/.test(d))).toBe(true);
    expect(() => composeQuizFromDocument(SOURCE, 10, ['Thermodynamics'])).toThrow(/no formulae on those topics/);
  });
});

describe('questionCountFromGoal', () => {
  it.each([
    ['Create a 20-question quiz from it.', 20],
    ['Make me a quiz with 30 questions', 30],
    ['quiz me with 15 MCQs', 15],
    ['Create a quiz from it', 20],
    ['Create a 500 question quiz', 50],
    ['a 2 question quiz', 5],
    // Words between the number and "questions"; class numbers and years are not counts.
    ['Create 30 NEET Biology questions from Cell Structure.', 30],
    ['Class 11 Physics: 20 questions', 20],
    ['Give me 5 NEET 2019 questions', 5],
  ])('%s → %i', (goal, n) => {
    expect(questionCountFromGoal(goal)).toBe(n);
  });
});
