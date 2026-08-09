import { chunkPagesStructured } from '../../src/utils/semanticChunker';

const page = (pageNumber: number, text: string) => ({ pageNumber, text });

describe('chunkPagesStructured — headings & sections', () => {
  it('creates section boundaries and tags section/subsection/heading', () => {
    const pages = [page(1,
      `5 LAWS OF MOTION\n\n` +
      `5.1 Inertia\n\n` +
      `Inertia is the tendency of a body to resist change in its state of motion when no force acts.\n\n` +
      `5.2 Momentum\n\n` +
      `Momentum is the product of the mass and the velocity of a body and is a vector quantity.`
    )];
    const chunks = chunkPagesStructured(pages, { targetChars: 1600, maxChars: 2400, overlapChars: 200 });

    expect(chunks.length).toBe(2);
    expect(chunks[0].text).toContain('Inertia is the tendency');
    expect(chunks[0].section).toBe('5 LAWS OF MOTION');
    expect(chunks[0].subsection).toBe('5.1 Inertia');
    expect(chunks[1].text).toContain('Momentum is the product');
    expect(chunks[1].section).toBe('5 LAWS OF MOTION');
    expect(chunks[1].subsection).toBe('5.2 Momentum');
  });
});

describe('chunkPagesStructured — block accumulation & preservation', () => {
  it('merges several small paragraphs under one heading into a single chunk', () => {
    const pages = [page(1,
      `Introduction to cells.\n\n` +
      `A cell is the basic structural unit of life.\n\n` +
      `Cells were first observed by Robert Hooke.`
    )];
    const chunks = chunkPagesStructured(pages, { targetChars: 1600, maxChars: 2400 });
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain('basic structural unit');
    expect(chunks[0].text).toContain('Robert Hooke');
  });

  it('keeps chunks within the max size bound and splits an oversize block', () => {
    const sentence = 'This is a reasonably long sentence used to build an oversized paragraph. ';
    const huge = sentence.repeat(120); // ~8.6k chars, single block
    const chunks = chunkPagesStructured([page(1, huge)], { targetChars: 1600, maxChars: 2400, overlapChars: 200 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(2400);
  });
});

describe('chunkPagesStructured — overlap on size boundaries', () => {
  it('carries a textual overlap from the previous chunk across a size-based split', () => {
    const para1 = 'A'.repeat(950) + ' ENDMARKER_UNIQUE';
    const para2 = 'B'.repeat(950) + ' second';
    const chunks = chunkPagesStructured([page(1, `${para1}\n\n${para2}`)], { targetChars: 1600, maxChars: 3000, overlapChars: 200 });
    expect(chunks.length).toBe(2);
    // The second chunk should begin with overlap text from the tail of the first.
    expect(chunks[1].text).toContain('ENDMARKER_UNIQUE');
    expect(chunks[1].text).toContain('second');
  });
});

describe('chunkPagesStructured — page metadata', () => {
  it('records the page number where a chunk starts', () => {
    const chunks = chunkPagesStructured([
      page(7, 'Content on page seven about photosynthesis.'),
      page(8, 'Content on page eight about respiration.'),
    ], { targetChars: 40, maxChars: 80 }); // tiny target so each page becomes its own chunk
    expect(chunks[0].pageNumber).toBe(7);
    expect(chunks.some(c => c.pageNumber === 8)).toBe(true);
  });
});
