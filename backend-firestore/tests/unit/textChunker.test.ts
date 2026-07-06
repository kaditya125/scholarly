import { TextChunker } from '../../src/utils/textChunker';

describe('TextChunker.chunkPages', () => {
  it('splits paragraphs (separated by blank lines) into separate chunks', () => {
    const pages = [{ pageNumber: 1, text: 'Paragraph one.\n\nParagraph two is here.' }];
    const chunks = TextChunker.chunkPages(pages, 1000, 200);
    expect(chunks.length).toBe(2);
    expect(chunks[0].text).toContain('Paragraph one');
    expect(chunks[1].text).toContain('Paragraph two');
    expect(chunks[0].pageNumber).toBe(1);
  });

  it('sub-chunks a paragraph larger than maxChunkSize', () => {
    const big = 'word '.repeat(500); // ~2500 chars, one paragraph
    const chunks = TextChunker.chunkPages([{ pageNumber: 1, text: big }], 500, 100);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('returns no chunks for whitespace-only text', () => {
    const chunks = TextChunker.chunkPages([{ pageNumber: 1, text: '   \n\n   ' }], 1000, 200);
    expect(chunks.length).toBe(0);
  });
});
