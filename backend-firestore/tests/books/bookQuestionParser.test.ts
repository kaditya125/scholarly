import {
  parseBook, parseChapter, segmentChapters, splitSequential, cleanMarkdown, hashQuestion, OcrPage,
} from '../../src/services/books/bookQuestionParser';

const CHAPTERS = /^(?:\d{1,2}[.)]?\s*)?(percentage|profit (?:and|&) loss|series completion|logic|assertion (?:and|&) reason)\s*$/i;
const page = (markdown: string, n = 1): OcrPage => ({ pdfPageStart: n, pdfPageEnd: n + 1, markdown });

describe('splitSequential', () => {
  it('anchors on the next expected number only, so stray numbers in text cannot start a question', () => {
    const body = '1. A price rises by 12. percent\n(a) 1 (b) 2\n2. Second\n7. not a question\n3. Third';
    const out = splitSequential(body);
    expect([...out.keys()]).toEqual([1, 2, 3]);
    expect(out.get(2)!.text).toContain('7. not a question');
  });
});

describe('cleanMarkdown', () => {
  it('drops bare page numbers and running headers, normalises OCR alpha to (a), keeps page sentinels', () => {
    const t = cleanMarkdown('<!-- book-page: 42 -->\nQUANTITATIVE APTITUDE\n17\n**1.** Q (α) x (b) y', /^QUANTITATIVE APTITUDE$/);
    expect(t).not.toMatch(/QUANTITATIVE APTITUDE/);
    expect(t).not.toMatch(/^17$/m);
    expect(t).toContain('(a) x');
    expect(t).not.toContain('**');
    expect(t).toMatch(/\u0001P42\u0001/);
  });
});

describe('Quant layout: one exercise, answer table, separate solutions', () => {
  const md = [
    '# 10. PERCENTAGE',
    'IMPORTANT FACTS AND FORMULAE', 'x% of y ...',
    '<!-- book-page: 316 -->',
    'EXERCISE',
    '1. How is 3/4 expressed as percentage? (R.R.B., 2006)',
    '(a) 0.75% (b) 7.5% (c) 75% (d) 60%',
    '2. Solve: 25% of 80 [SSC CGL Exam, 2019]',
    '(a) 10',
    '(b) 20',
    '(c) 30',
    '(d) 40',
    '3. Refer to the following figure and find x',
    '(a) 1 (b) 2 (c) 3 (d) 4',
    'ANSWERS',
    '- 1. (c) | 2. (b) | 3. (a)',
    'SOLUTIONS',
    '1. 3/4 × 100 = 75%.',
    '2. 25/100 × 80 = 20.',
  ].join('\n');

  const { chapters, questions } = parseBook([page(md)], { chapterHeading: CHAPTERS });

  it('finds the chapter and every question', () => {
    expect(chapters).toEqual([{ name: 'Percentage', ordinal: 1 }]);
    expect(questions.map((q) => q.questionNumber)).toEqual([1, 2, 3]);
  });

  it('pairs each question with the book key and worked solution', () => {
    const [q1, q2] = questions;
    expect(q1.options).toEqual(['0.75%', '7.5%', '75%', '60%']);
    expect(q1.answerKey).toBe('c');
    expect(q1.answerIndex).toBe(2);
    expect(q1.solution).toContain('75%');
    expect(q2.answerIndex).toBe(1);
    expect(q1.quarantineReason).toBeUndefined();
  });

  it('keeps exam tags out of the stem and records them separately', () => {
    expect(questions[1].stem).not.toContain('SSC CGL');
    expect(questions[1].examTag).toBe('SSC CGL Exam, 2019');
    expect(questions[0].examTag).toBe('R.R.B., 2006');
  });

  it('records the printed page and quarantines figure-dependent questions', () => {
    expect(questions[0].sourcePage).toBe(316);
    expect(questions[2].quarantineReason).toBe('needs_figure');
  });
});

describe('Reasoning layout: several sets with inline answers', () => {
  const md = [
    '3. SERIES COMPLETION',
    'EXERCISE 3A',
    '1. 1, 4, 9, 16, 25, (.....)',
    '(a) 35 (b) 36 (c) 48 (d) 49',
    '2. 20, 19, 17, (.....), 10',
    '(a) 12 (b) 13 (c) 14 (d) 15',
    'ANSWERS',
    '**1.** (b): The numbers are squares.',
    '2. (c) : The pattern is -1, -2, -3.',
    'EXERCISE 3B',
    '1. 2, 4, 8, (.....)',
    '(a) 10 (b) 12 (c) 16 (d) 32',
    'ANSWERS',
    '1. (c): Each term doubles.',
  ].join('\n');
  const { questions } = parseBook([page(md)], { chapterHeading: CHAPTERS });

  it('keeps each set separate with its own keys and explanations', () => {
    expect(questions.map((q) => `${q.sourceSection}#${q.questionNumber}:${q.answerKey}`))
      .toEqual(['EXERCISE 3A#1:b', 'EXERCISE 3A#2:c', 'EXERCISE 3B#1:c']);
    expect(questions[0].solution).toBe('The numbers are squares.');
    expect(questions[2].solution).toBe('Each term doubles.');
  });
});

describe('Fixed-choice formats: options printed once in the directions', () => {
  const md = [
    '18. ASSERTION AND REASON',
    'EXERCISE 18A',
    'Directions: Each question has an Assertion (A) and a Reason (R). Mark',
    '(a) Both A and R are true and R explains A. (b) Both true, R does not explain A. (c) A true, R false. (d) A false, R true.',
    '1. Assertion (A): CO causes death. Reason (R): CO binds haemoglobin.',
    '2. Assertion (A): Mountains are colder. Reason (R): Temperature falls with altitude.',
    'ANSWERS',
    '1. (a) 2. (a)',
  ].join('\n');
  const { questions } = parseBook([page(md)], { chapterHeading: CHAPTERS });

  it('inherits the choice list and marks it as inherited', () => {
    expect(questions).toHaveLength(2);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(q.optionsFromDirections).toBe(true);
      expect(q.quarantineReason).toBeUndefined();
    }
    expect(questions[0].options[0]).toMatch(/^Both A and R are true/);
  });
});

describe('quarantine rather than drop', () => {
  it('flags a missing answer key and incomplete options', () => {
    const md = ['10. PERCENTAGE', 'EXERCISE', '1. Only two options', '(a) 1 (b) 2', '2. No key here', '(a) 1 (b) 2 (c) 3 (d) 4', 'ANSWERS', '1. (a)'].join('\n');
    const { questions } = parseBook([page(md)], { chapterHeading: CHAPTERS });
    expect(questions[0].quarantineReason).toBe('options_incomplete');
    expect(questions[1].quarantineReason).toBe('no_answer_key');
  });
});

describe('segmentChapters', () => {
  it('ignores a chapter name used as ordinary text and repeated running headers', () => {
    const pages = [
      page('10. PERCENTAGE\nEXERCISE\n1. q'),
      page('PERCENTAGE\nsee the logic of this\n2. q'),
      page('11. PROFIT AND LOSS\nEXERCISE'),
    ];
    const ch = segmentChapters(pages, { chapterHeading: CHAPTERS });
    expect(ch.map((c) => c.name)).toEqual(['Percentage', 'Profit And Loss']);
    expect(ch[0].text).toContain('2. q');
  });
});

describe('hashQuestion', () => {
  it('is stable across whitespace/case and changes with content', () => {
    expect(hashQuestion('What is 25%  of 80?', ['10', '20'])).toBe(hashQuestion('what is 25% of 80?', ['10', '20']));
    expect(hashQuestion('What is 25% of 80?', ['10', '20'])).not.toBe(hashQuestion('What is 25% of 90?', ['10', '20']));
  });
});

describe('parseChapter ignores worked examples outside EXERCISE', () => {
  it('only takes numbered questions inside exercise sets', () => {
    const qs = parseChapter({ name: 'Percentage', ordinal: 1, text: 'SOLVED EXAMPLES\n1. Ex one (a) 1 (b) 2 (c) 3 (d) 4\nEXERCISE\n1. Real (a) 1 (b) 2 (c) 3 (d) 4\nANSWERS\n1. (d)' });
    expect(qs).toHaveLength(1);
    expect(qs[0].stem).toBe('Real');
  });
});

describe('two exercise sets with the same label', () => {
  it('numbers each set separately so both keep distinct identities', () => {
    const md = ['10. PERCENTAGE', 'EXERCISE', '1. First (a) 1 (b) 2 (c) 3 (d) 4', 'ANSWERS', '1. (a)', 'EXERCISE', '1. Second (a) 1 (b) 2 (c) 3 (d) 4', 'ANSWERS', '1. (b)'].join('\n');
    const { questions } = parseBook([page(md)], { chapterHeading: CHAPTERS });
    expect(questions.map((q) => [q.sourceSection, q.sourceSectionIndex, q.questionNumber, q.answerKey])).toEqual([['EXERCISE', 1, 1, 'a'], ['EXERCISE', 2, 1, 'b']]);
  });
});

import { bookQuestionId } from '../../src/repositories/bookQuestions.repository';
describe('bookQuestionId', () => {
  it('is unique per set position and stable for the first set', () => {
    const a = bookQuestionId('b', { chapterOrdinal: 1, sourceSection: 'EXERCISE', sourceSectionIndex: 1, questionNumber: 1 });
    const b = bookQuestionId('b', { chapterOrdinal: 1, sourceSection: 'EXERCISE', sourceSectionIndex: 2, questionNumber: 1 });
    expect(a).not.toBe(b);
    expect(a).toBe(bookQuestionId('b', { chapterOrdinal: 1, sourceSection: 'EXERCISE', sourceSectionIndex: 1, questionNumber: 1 }));
  });
});

describe('answer-blocks layout (Lucent General Science)', () => {
  const opts = { chapterHeading: /^$/, layout: 'answer-blocks' as const, partHeading: /^(Physics|Biology)$/ };
  const run = (n: number, from = 1) => Array.from({ length: n }, (_, k) => `${k + from}. Question number ${k + from} is here?\n(a) w (b) x (c) y (d) z`).join('\n');
  const key = (n: number) => Array.from({ length: n }, (_, k) => `${k + 1}. (b)`).join(' ');

  it('takes the run before each Answers block, names it by part, skips prose lists and headings inside', () => {
    const md = ['# Physics', 'Facts:', '1. Light is fast', '2. Sound is slower', run(3), '## General Science', run(2, 4), '### Answers', key(5)].join('\n');
    const { chapters, questions } = parseBook([page(md)], opts);
    expect(chapters).toEqual([{ name: 'Physics', ordinal: 1 }]);
    expect(questions.map((q) => q.questionNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(questions.every((q) => q.answerKey === 'b' && !q.quarantineReason)).toBe(true);
    expect(questions[2].options[3]).toBe('z'); // the "## General Science" header didn't glue onto an option
  });

  it('never treats the previous key table as a question run', () => {
    const md = ['# Physics', run(5), '## Answers', key(5), '# Biology', run(5), '## Answers', key(5)].join('\n');
    const { chapters, questions } = parseBook([page(md)], opts);
    expect(chapters.map((c) => c.name)).toEqual(['Physics', 'Biology']);
    expect(questions).toHaveLength(10);
  });

  it('quarantines a run that belongs to a different part than the key, instead of pairing wrong answers', () => {
    const md = ['# Physics', run(4), '# Biology', 'Cells are the unit of life.', '## Answers', key(40)].join('\n');
    const { questions } = parseBook([page(md)], opts);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((q) => q.quarantineReason === 'answer_key_mismatch')).toBe(true);
  });

  it('accepts a shorter run in the same part as the start of the keyed set (numbers align)', () => {
    const md = ['# Biology', run(4), '## Biology', '## Answers', key(40)].join('\n');
    const { questions } = parseBook([page(md)], opts);
    expect(questions.map((q) => q.quarantineReason)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('bleed guards', () => {
  it('does not treat "Direction of ..." question text as a directions block', () => {
    const md = ['10. PERCENTAGE', 'EXERCISE', '1. Which way does it flow?', 'Direction of current is from positive to negative', '(a) true (b) false (c) both (d) none', '2. Next (a) 1 (b) 2 (c) 3 (d) 4', 'ANSWERS', '1. (a) 2. (b)'].join('\n');
    const { questions } = parseBook([page(md)], { chapterHeading: CHAPTERS });
    expect(questions[0].stem).toContain('Direction of current');
    expect(questions[1].sharedDirections).toBeUndefined();
  });
  it('quarantines an implausibly long stem and truncates a runaway solution', () => {
    const long = 'x '.repeat(1000);
    const md = ['10. PERCENTAGE', 'EXERCISE', `1. ${long}`, '(a) 1 (b) 2 (c) 3 (d) 4', '2. Fine (a) 1 (b) 2 (c) 3 (d) 4', 'ANSWERS', '1. (a) 2. (b)', 'SOLUTIONS', '1. ok', `2. ${'y '.repeat(2000)}`].join('\n');
    const { questions } = parseBook([page(md)], { chapterHeading: CHAPTERS });
    expect(questions[0].quarantineReason).toBe('oversize_text');
    expect(questions[1].solution!.length).toBeLessThanOrEqual(3000);
    expect(questions[1].solutionTruncated).toBe(true);
  });
});

describe('two-column recovery', () => {
  it('recovers questions whose numbers arrive out of order, without touching the in-order run', () => {
    const md = [
      '10. PERCENTAGE', 'EXERCISE',
      '1. First question here? (a) 1 (b) 2 (c) 3 (d) 4',
      '2. Second question here, which continues',
      '5. Column-two question five? (a) 5 (b) 6 (c) 7 (d) 8',
      '(a) 9 (b) 10 (c) 11 (d) 12',
      '3. Third question here? (a) 1 (b) 2 (c) 3 (d) 4',
      '4. Fourth question here? (a) 1 (b) 2 (c) 3 (d) 4',
      'ANSWERS', '1. (a) 2. (b) 3. (c) 4. (d) 5. (a)',
    ].join('\n');
    const { questions } = parseBook([page(md)], { chapterHeading: CHAPTERS });
    const byN = new Map(questions.map((q) => [q.questionNumber, q]));
    expect([...byN.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(byN.get(5)!.options).toEqual(['5', '6', '7', '8']);
    expect(byN.get(5)!.answerKey).toBe('a');
  });
  it('quarantines items whose options collapsed into duplicates', () => {
    const md = ['10. PERCENTAGE', 'EXERCISE', '1. If a − b = 1, find a³ − b³ − 3ab (a) 3 (b) 1 (c) 1 (d) 3', 'ANSWERS', '1. (c)'].join('\n');
    expect(parseBook([page(md)], { chapterHeading: CHAPTERS }).questions[0].quarantineReason).toBe('duplicate_options');
  });
});
