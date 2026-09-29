import { detectFormat, parseAnswerBlock, errorParts, wordOverlap, parseEnglishBook } from '../../src/services/books/englishExerciseParser';
import type { OcrPage } from '../../src/services/books/bookQuestionParser';

const CH = /^(?:\d{1,2}[.)]?\s*)?(preposition|narration|articles?)\s*$/i;
const page = (markdown: string): OcrPage => ({ pdfPageStart: 1, pdfPageEnd: 2, markdown });

describe('helpers', () => {
  it('detects the exercise format from its instruction', () => {
    expect(detectFormat('Find out the error part of the following sentences:', [])).toBe('ERROR_SPOTTING');
    expect(detectFormat('Fill in the blanks with suitable prepositions', [])).toBe('FILL_BLANK');
    expect(detectFormat('Correct the following sentences:', [])).toBe('SENTENCE_CORRECTION');
    expect(detectFormat('Change into Indirect speech.', [])).toBe('TRANSFORMATION');
    expect(detectFormat('Pick out the nouns', [])).toBeNull();
  });
  it('reads both answer layouts', () => {
    expect([...parseAnswerBlock('- 1. on | 2. with | 3. of\n- 4. by')]).toEqual([[1, 'on'], [2, 'with'], [3, 'of'], [4, 'by']]);
    expect(parseAnswerBlock('1. (2) are की जगह is का प्रयोग\n2. (5) No error').get(1)).toBe('(2) are की जगह is का प्रयोग');
  });
  it('splits error-spotting parts', () => {
    expect(errorParts('Twenty miles (1)/ are (2)/ a long way (3)/ to walk (4)/ No error (5)')).toEqual(['Twenty miles', 'are', 'a long way', 'to walk', 'No error']);
  });
  it('measures word overlap of a rewritten sentence', () => {
    expect(wordOverlap('The peoples of India are marching ahead.', 'The people of India are marching ahead.')).toBeGreaterThan(0.8);
    expect(wordOverlap('The peoples of India are marching ahead.', 'She sells sea shells')).toBe(0);
  });
});

describe('parseEnglishBook', () => {
  it('pairs each exercise with its answers by Q-number and keeps formats', () => {
    const md = [
      '# PREPOSITION',
      '## Q.1. Fill in the blanks with suitable prepositions:',
      '1. He is fond ...... music.',
      '2. She sat ...... the chair. (on/at)',
      '## Q.2. Find out the error part of the following sentences:',
      '1. Twenty miles (1)/ are (2)/ a long way (3)/ to walk (4)/ No error (5)',
      'Answers With Explanation',
      '### Q. 1.',
      '- 1. of | 2. on',
      '### Q. 2.',
      '1. (2) are की जगह is का प्रयोग होगा।',
    ].join('\n');
    const { questions } = parseEnglishBook([page(md)], { chapterHeading: CH });
    const [f1, f2, e1] = questions;
    expect(f1).toMatchObject({ format: 'FILL_BLANK', answerText: 'of', chapterName: 'Preposition' });
    expect(f2).toMatchObject({ options: ['on', 'at'], answerIndex: 0 });
    expect(e1).toMatchObject({ format: 'ERROR_SPOTTING', answerIndex: 1, answerKey: 'b' });
    expect(e1.solution).toContain('is');
    expect(questions.every((q) => !q.quarantineReason)).toBe(true);
  });

  it('never gives one chapter another chapter\'s answers when a chapter prints none', () => {
    const md = [
      '# ARTICLES',
      '## Q.1. Fill in the blanks with suitable articles:',
      '1. He is ...... honest man.',
      '# PREPOSITION',
      '## Q.1. Fill in the blanks with suitable prepositions:',
      '1. He is fond ...... music.',
      'Answers With Explanation',
      '### Q. 1.',
      '- 1. of',
    ].join('\n');
    const { questions } = parseEnglishBook([page(md)], { chapterHeading: CH });
    const articles = questions.find((q) => q.chapterName === 'Articles')!;
    const prep = questions.find((q) => q.chapterName === 'Preposition')!;
    expect(articles.quarantineReason).toBe('no_answer_key');
    expect(prep.answerText).toBe('of');
  });

  it('quarantines a rewritten-sentence answer that does not belong to the question', () => {
    const md = ['# NARRATION', '## Q.1. Change into Indirect speech.', '1. He said, "I am busy."', 'Answers With Explanation', '### Q. 1.', '1. Mangoes are sweet in summer season everywhere.'].join('\n');
    const { questions } = parseEnglishBook([page(md)], { chapterHeading: CH });
    expect(questions[0].quarantineReason).toBe('answer_mismatch');
  });
});
