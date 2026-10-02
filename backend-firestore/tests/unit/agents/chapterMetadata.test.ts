/**
 * Chapters ingestion left unnamed (NCERT Class 11 Biology Ch. 4, 6, 8, 12): their name and headings
 * are read from their own running headers and numbered section lines — nothing guessed.
 */
import { metadataFromText } from '../../../src/agents/tools/adapters/curriculum.adapter';
import { titleCase } from '../../../src/agents/tools/adapters/curriculumMatch';

// Shaped like the real Chapter 8: a unit introduction and a biography before the chapter proper,
// then odd pages headed by the title and even pages by the book's name.
const CH8 = [
  { text: 'UNIT 3\nBiology is the study of living organisms. The detailed description of their form...' },
  { text: 'G.N. RAMACHANDRAN, an outstanding figure in the field of protein structure...' },
  { text: 'CELL: THE UNIT OF LIFE 125\n8.1 WHAT IS A CELL?\nUnicellular organisms are capable of...\n8.2 CELL THEORY\nIn 1838, Matthias Schleiden...' },
  { text: '126 BIOLOGY\n8.3 AN OVERVIEW OF CELL\nYou have earlier observed cells...\nSee also 4.2 Levels of Organisation in chapter 4.' },
  { text: 'CELL: THE UNIT OF LIFE 127\n8.4 PROKARYOTIC CELLS\n8.4.1 Cell Envelope and its Modifications\nMost prokaryotic cells...' },
  { text: '128 BIOLOGY\n8.5 EUKARYOTIC CELLS\nThe eukaryotes include all the protists...' },
];

describe('metadataFromText', () => {
  it('takes the most frequent odd-page running header as the chapter name', () => {
    expect(metadataFromText(CH8, 8).chapterName).toBe('CELL: THE UNIT OF LIFE');
  });

  it('lists the chapter’s own numbered sections, in order, and ignores other chapters’ numbers', () => {
    expect(metadataFromText(CH8, 8).headings).toEqual([
      '8.1 WHAT IS A CELL?',
      '8.2 CELL THEORY',
      '8.3 AN OVERVIEW OF CELL',
      '8.4 PROKARYOTIC CELLS',
      '8.4.1 Cell Envelope and its Modifications',
      '8.5 EUKARYOTIC CELLS',
    ]);
  });

  it('never makes a name out of the book’s own header or a lone line', () => {
    expect(metadataFromText([{ text: '126 BIOLOGY\ntext' }, { text: 'BIOLOGY 127\ntext' }]).chapterName).toBeUndefined();
    // One header on one page is enough only when it is the only candidate at all.
    expect(metadataFromText([{ text: 'RESPIRATION IN PLANTS 153\nAll of us breathe to live...' }], 12).chapterName).toBe('RESPIRATION IN PLANTS');
  });

  it('title-cases a recovered all-caps name for display', () => {
    expect(titleCase('CELL: THE UNIT OF LIFE')).toBe('Cell: The Unit of Life');
    expect(titleCase('ANATOMY OF FLOWERING PLANTS')).toBe('Anatomy of Flowering Plants');
  });
});
