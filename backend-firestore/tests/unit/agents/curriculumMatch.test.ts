/**
 * Chapter matching, exercised against the real metadata shapes in the NCERT Class 11 Physics
 * notebook (captured from Firestore): some chapters carry a proper name, others only
 * "CHAPTER FIVE" with the real name in the first heading.
 */
import {
  MIN_SCORE,
  displayChapterName,
  parseClassNumber,
  parseSubject,
  rankChapters,
  scoreBook,
  topicPhrase,
  tokenize,
} from '../../../src/agents/tools/adapters/curriculumMatch';

const chapter = (sourceId: string, title: string, chapters: string[], headings: string[] = []) => ({
  sourceId,
  title,
  chapterName: chapters[0],
  headings,
});

// Real Class 11 Physics chapters, in the order their files are numbered.
const C11_PHYSICS = [
  chapter('s2', 'NCERT Class 11 Physics (Part 1) - Chapter 2', ['CHAPTER TWO MOTION IN A STRAIGHT LINE'], ['2.1 Introduction', '2.3 Acceleration']),
  chapter('s3', 'NCERT Class 11 Physics (Part 1) - Chapter 3', ['MOTION IN A PLANE'], ['SCALARS AND VECTORS']),
  chapter('s4', 'NCERT Class 11 Physics (Part 1) - Chapter 4', ['Laws of Motion'], [
    '4.1 INTRODUCTION',
    '4.3 THE LAW OF INERTIA',
    '4.4 NEWTON’S FIRST LAW OF MOTION',
    '4.7 Conservation of momentum',
  ]),
  chapter('s5', 'NCERT Class 11 Physics (Part 1) - Chapter 5', ['CHAPTER FIVE'], ['WORK, ENERGY AND POWER', '5.1 INTRODUCTION', '5.3 WORK']),
  chapter('s6', 'NCERT Class 11 Physics (Part 1) - Chapter 6', ['CHAPTER SIX'], ['SYSTEMS OF PARTICLES AND ROTATIONAL MOTION', '6.2 Centre of mass']),
  chapter('s7', 'NCERT Class 11 Physics (Part 1) - Chapter 7', ['CHAPTER SEVEN GRAVITATION'], ['7.2 KEPLER’S LAWS']),
  chapter('p2c4', 'NCERT Class 11 Physics (Part 2) - Chapter 4', ['THERMODYNAMICS'], ['ZEROTH LAW OF THERMODYNAMICS']),
  chapter('p2c5', 'NCERT Class 11 Physics (Part 2) - Chapter 5', ['CHAPTER TWELVE: KINETIC THEORY'], ['12.4 Kinetic theory of an ideal gas']),
  chapter('p2c6', 'NCERT Class 11 Physics (Part 2) - Chapter 6', ['CHAPTER THIRTEEN OSCILLATIONS'], ['13.3 Simple harmonic motion']),
  chapter('p2c7', 'NCERT Class 11 Physics (Part 2) - Chapter 7', ['WAVES'], ['14.7 Beats']),
];

describe('displayChapterName', () => {
  it('uses the extracted name when it is a real one', () => {
    expect(displayChapterName('Laws of Motion', [])).toBe('Laws of Motion');
  });

  it('strips a "CHAPTER <number-word>" prefix', () => {
    expect(displayChapterName('CHAPTER THIRTEEN OSCILLATIONS', [])).toBe('OSCILLATIONS');
    expect(displayChapterName('CHAPTER TWELVE: KINETIC THEORY', [])).toBe('KINETIC THEORY');
  });

  it('falls back to the first real heading when only a number was captured', () => {
    expect(displayChapterName('CHAPTER FIVE', ['WORK, ENERGY AND POWER', '5.1 INTRODUCTION'])).toBe('WORK, ENERGY AND POWER');
    expect(displayChapterName('CHAPTER NINE', ['9.1 INTRODUCTION', 'MECHANICAL PROPERTIES OF FLUIDS'])).toBe('MECHANICAL PROPERTIES OF FLUIDS');
  });

  it('falls back to the file title when there is nothing else', () => {
    expect(displayChapterName(undefined, [], 'NCERT Class 11 Physics - Chapter 4.pdf')).toBe('NCERT Class 11 Physics - Chapter 4');
  });
});

describe('query parsing', () => {
  it('reads the class and subject out of a student phrase', () => {
    expect(parseClassNumber('Laws of Motion, Class 11 Physics')).toBe(11);
    expect(parseClassNumber('12th physics gravitation')).toBe(12);
    expect(parseClassNumber('laws of motion')).toBeUndefined();
    expect(parseSubject('Class 11 Physics laws of motion')).toBe('physics');
    expect(parseSubject('class 10 maths')).toBe('mathematics');
  });

  it('keeps only the topic words for chapter matching', () => {
    expect(topicPhrase('Laws of Motion, Class 11 Physics')).toBe('laws of motion');
    expect(topicPhrase('NCERT class 12 chemistry electrochemistry')).toBe('electrochemistry');
    expect(tokenize('Give me the Laws of Motion chapter')).toEqual(['laws', 'motion']);
  });
});

describe('rankChapters', () => {
  it('resolves the flagship chapter exactly', () => {
    const r = rankChapters('Laws of Motion, Class 11 Physics', C11_PHYSICS);
    expect(r.confident).toBe(true);
    expect(r.best).toMatchObject({ sourceId: 's4', chapterName: 'Laws of Motion' });
    expect(r.best!.score).toBeGreaterThanOrEqual(0.95);
  });

  it('finds a chapter whose name only exists in its headings', () => {
    const r = rankChapters('work energy and power class 11', C11_PHYSICS);
    expect(r.confident).toBe(true);
    expect(r.best).toMatchObject({ sourceId: 's5', chapterName: 'WORK, ENERGY AND POWER' });
  });

  it('finds a chapter whose name is buried behind a chapter numeral', () => {
    expect(rankChapters('oscillations', C11_PHYSICS).best).toMatchObject({ sourceId: 'p2c6' });
    expect(rankChapters('kinetic theory of gases', C11_PHYSICS).best).toMatchObject({ sourceId: 'p2c5' });
  });

  it('matches on section headings when the student names a sub-topic', () => {
    const r = rankChapters("Newton's first law of motion", C11_PHYSICS);
    expect(r.best).toMatchObject({ sourceId: 's4' });
  });

  it('asks instead of guessing when a word fits several chapters', () => {
    const r = rankChapters('motion', C11_PHYSICS);
    expect(r.confident).toBe(false);
    expect(r.reason).toBe('ambiguous');
    expect(r.alternatives.length).toBeGreaterThan(1);
  });

  it('reports no match rather than returning the least-bad chapter', () => {
    const r = rankChapters('photosynthesis in plants', C11_PHYSICS);
    expect(r.confident).toBe(false);
    expect(r.reason).toBe('no_match');
    expect(r.best).toBeUndefined();
  });

  it('treats an empty topic as a question to ask back', () => {
    expect(rankChapters('class 11 physics', C11_PHYSICS)).toMatchObject({ confident: false, reason: 'empty_query' });
  });

  it('never returns a confident match below the score floor', () => {
    const r = rankChapters('gravitation', C11_PHYSICS);
    expect(r.best!.score).toBeGreaterThanOrEqual(MIN_SCORE);
  });
});

describe('scoreBook', () => {
  const books = [
    { notebookId: 'ncert-c11-physics', title: 'NCERT Class 11 Physics', subject: 'Physics', className: 'Class 11' },
    { notebookId: 'ncert-c12-physics', title: 'NCERT Class 12 Physics', subject: 'Physics', className: 'Class 12' },
    { notebookId: 'ncert-c11-chemistry', title: 'NCERT Class 11 Chemistry', subject: 'Chemistry', className: 'Class 11' },
  ];

  it('picks the one book matching both class and subject', () => {
    const best = books.map((b) => ({ b, s: scoreBook(b, 11, 'physics') })).sort((x, y) => y.s - x.s)[0];
    expect(best.b.notebookId).toBe('ncert-c11-physics');
  });

  it('rules out the wrong class or subject completely', () => {
    expect(scoreBook(books[1], 11, 'physics')).toBe(0);
    expect(scoreBook(books[2], 11, 'physics')).toBe(0);
  });

  it('does not reject a book when the student gave only one of the two', () => {
    expect(scoreBook(books[0], 11, undefined)).toBeGreaterThan(0);
    expect(scoreBook(books[0], undefined, 'physics')).toBeGreaterThan(0);
  });
});
