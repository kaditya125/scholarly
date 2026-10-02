/**
 * Phase 6 — grounded generation checks: a model-written question survives only when its quoted
 * evidence is in the source, supports the marked answer, and supports no other option.
 */
const mockGenerate = jest.fn();
jest.mock('../../../src/services/ai/gemini.provider', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({ generateResponse: (...a: any[]) => mockGenerate(...a) })),
}));

import {
  batchSections,
  callJson,
  checkCard,
  checkMcq,
  checkNote,
  contentWords,
  evidenceKey,
  sectionOfEvidence,
  sectionsFromPages,
  similarity,
  solveFromEvidence,
  supportOf,
} from '../../../src/agents/tools/adapters/grounded';

describe('model calls', () => {
  beforeEach(() => mockGenerate.mockReset());
  const noSleep = async () => undefined;

  it('retries a throttled call with spaced backoff, then gives up honestly', async () => {
    mockGenerate
      .mockRejectedValueOnce(Object.assign(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'), { status: 429 }))
      .mockResolvedValueOnce({ reply: '{"ok":true}', usage: { promptTokens: 10, completionTokens: 2 } });
    const out = await callJson('p', 's', { userId: 'u', operation: 'op', sleep: noSleep });
    expect(out.json).toEqual({ ok: true });
    expect(mockGenerate).toHaveBeenCalledTimes(2);

    mockGenerate.mockReset().mockRejectedValue(Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 }));
    await expect(callJson('p', 's', { userId: 'u', operation: 'op', sleep: noSleep })).rejects.toThrow(/RESOURCE_EXHAUSTED/);
    expect(mockGenerate).toHaveBeenCalledTimes(4);

    mockGenerate.mockReset().mockRejectedValue(new Error('invalid argument'));
    await expect(callJson('p', 's', { userId: 'u', operation: 'op', sleep: noSleep })).rejects.toThrow(/invalid argument/);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('asks the solver without the key, and reads NONE as unsettled', async () => {
    mockGenerate.mockResolvedValue({ reply: JSON.stringify({ answers: [{ id: 'q1', answer: 'A' }, { id: 'q2', answer: 'NONE' }, { id: 'q3', answer: 'c' }] }), usage: { promptTokens: 100, completionTokens: 20 } });
    const { answers, usage } = await solveFromEvidence(
      [
        { id: 'q1', question: 'Who?', options: ['Virchow', 'Schleiden', 'Schwann', 'Hooke'], evidence: 'Rudolf Virchow (1855) first explained that cells divided' },
        { id: 'q2', question: 'Which?', options: ['a', 'b', 'c', 'd'], evidence: 'e' },
        { id: 'q3', question: 'What?', options: ['a', 'b', 'c', 'd'], evidence: 'e' },
      ],
      { userId: 'u', operation: 'op' },
    );
    expect([...answers.entries()]).toEqual([['q1', 0], ['q2', -1], ['q3', 2]]);
    expect(usage.tokens).toBe(120);
    const prompt: string = mockGenerate.mock.calls[0][0][0].content;
    expect(prompt).toContain('A. Virchow');
    expect(prompt).not.toMatch(/correct(Index)?\s*[:=]/i);
  });
});

describe('batching', () => {
  const section = (id: string, chars: number) => ({ id, heading: id, text: 'x'.repeat(chars), pages: [1] });
  it('groups sections into a few calls without splitting one, in order', () => {
    const batches = batchSections([
      { section: section('a', 5000), count: 3 },
      { section: section('b', 5000), count: 3 },
      { section: section('c', 5000), count: 3 },
      { section: section('d', 1000), count: 12 },
    ]);
    expect(batches.map((b) => b.map((x) => x.section.id))).toEqual([['a', 'b'], ['c'], ['d']]);
  });
});

const CHAPTER = [
  'CHAPTER 8 CELL: THE UNIT OF LIFE 8.1 What is a Cell? 8.2 Cell Theory 8.3 An Overview of Cell 8.4 Prokaryotic Cells',
  '8.1 WHAT IS A CELL? Unicellular organisms are capable of (i) independent existence and (ii) performing the essential functions of life. Anything less than a complete structure of a cell does not ensure independent living.',
  '8.2 CELL THEORY In 1838, Matthias Schleiden, a German botanist, examined a large number of plants and observed that all plants are composed of different kinds of cells which form the tissues of the plant. Rudolf Virchow (1855) first explained that cells divided and new cells are formed from pre-existing cells (Omnis cellula-e cellula).',
  '8.4 PROKARYOTIC CELLS The prokaryotic cells are represented by bacteria, blue-green algae, mycoplasma and PPLO (Pleuro Pneumonia Like Organisms). They are generally smaller and multiply more rapidly than the eukaryotic cells. Ribosomes of prokaryotes are 70S while those of eukaryotes are 80S. SUMMARY All organisms are made of cells or aggregates of cells. EXERCISES 1. Which of the following is not correct?',
].map((text, i) => ({ pageNumber: i + 1, text }));
const HEADINGS = ['8.1 What is a Cell?', '8.2 Cell Theory', '8.4 Prokaryotic Cells', 'Summary', 'Exercises'];
const SOURCE = evidenceKey(CHAPTER.map((p) => p.text).join('\n'));

const mcq = (over: Partial<Parameters<typeof checkMcq>[0]> = {}) => ({
  question: 'Who first explained that new cells are formed from pre-existing cells?',
  options: ['Rudolf Virchow', 'Matthias Schleiden', 'Theodore Schwann', 'Robert Hooke'],
  correctIndex: 0,
  evidence: 'Rudolf Virchow (1855) first explained that cells divided and new cells are formed from pre-existing cells',
  sectionId: 's2',
  ...over,
});

describe('evidenceKey and support', () => {
  it('matches across PDF line breaks, hyphenation, spacing and quotes', () => {
    expect(evidenceKey('pre-existing\ncells')).toBe(evidenceKey('pre existing cells'));
    expect(SOURCE.includes(evidenceKey('new cells are formed from pre- existing cells'))).toBe(true);
  });

  it('measures how much of a claim the evidence states, across word endings', () => {
    expect(supportOf('70S', 'Ribosomes of prokaryotes are 70S while those of eukaryotes are 80S')).toBe(1);
    expect(supportOf('Mitochondria', 'Ribosomes of prokaryotes are 70S')).toBe(0);
    expect(supportOf('Packaging materials for delivery', 'the function of packaging materials, to be delivered either to the intra-cellular targets')).toBe(1);
    expect(contentWords('The cells are formed')).toEqual(['cells', 'formed']);
  });
});

describe('checkMcq', () => {
  it('accepts a question whose quote is in the chapter and states the answer', () => {
    expect(checkMcq(mcq(), SOURCE)).toBeNull();
  });

  it('does not mistake distinct terms for restatements (Sub-metacentric / Metacentric, chromatin / chromatid)', () => {
    const evidence = 'In case of acrocentric chromosome the centromere is situated close to its end forming one extremely short and one very long arm';
    const chromosome = mcq({ question: 'Which chromosome has its centromere close to one end?', options: ['Metacentric', 'Sub-metacentric', 'Acrocentric', 'Telocentric'], correctIndex: 2, evidence });
    const source = evidenceKey(`${CHAPTER.map((p) => p.text).join('\n')} ${evidence}`);
    expect(checkMcq(chromosome, source)).toBeNull();
    expect(checkMcq({ ...chromosome, options: ['Chromatin', 'Chromatid', 'Acrocentric', 'Centromere'] }, source)).toBeNull();
  });

  it('leaves distractors drawn from the proving sentence to the independent solver, not to string rules', () => {
    // "70S while those of eukaryotes are 80S" names a distractor, yet the key is right.
    expect(
      checkMcq(mcq({ question: 'What size are prokaryotic ribosomes?', options: ['70S', '80S', '60S', '90S'], correctIndex: 0, evidence: 'Ribosomes of prokaryotes are 70S while those of eukaryotes are 80S' }), SOURCE),
    ).toBeNull();
  });

  it.each([
    ['a quote the chapter does not contain', { evidence: 'Rudolf Virchow proved in 1858 that all cells arise by free cell formation' }, 'evidence_not_in_source'],
    ['a quote that does not support the marked answer', { correctIndex: 1 }, 'answer_not_supported'],
    ['one option restating another (Schwann / Theodor Schwann)', { options: ['Rudolf Virchow', 'Schwann', 'Matthias Schleiden', 'Theodor Schwann'] }, 'overlapping_options'],
    ['a NOT/EXCEPT stem', { question: 'Which of these did NOT study plant cells?' }, 'negative_stem'],
    ['repeated options', { options: ['Rudolf Virchow', 'rudolf  virchow', 'Theodore Schwann', 'Robert Hooke'] }, 'duplicate_options'],
    ['an “all of the above” option', { options: ['Rudolf Virchow', 'Matthias Schleiden', 'Theodore Schwann', 'All of the above'] }, 'lazy_option'],
    ['three options', { options: ['Rudolf Virchow', 'Matthias Schleiden', 'Theodore Schwann'] }, 'malformed'],
    ['a too-short quote', { evidence: 'Rudolf Virchow' }, 'evidence_not_in_source'],
  ])('rejects %s', (_label, over, reason) => {
    expect(checkMcq(mcq(over as any), SOURCE)).toBe(reason);
  });
});

describe('checkCard and checkNote', () => {
  it('keep a card or note only when its quote is in the source and states it', () => {
    const evidence = 'The prokaryotic cells are represented by bacteria, blue-green algae, mycoplasma and PPLO';
    expect(checkCard({ front: 'Name two kinds of prokaryotic cells', back: 'bacteria and blue-green algae', evidence, sectionId: 's3' }, SOURCE)).toBeNull();
    expect(checkCard({ front: 'Name two kinds of prokaryotic cells', back: 'yeast and amoeba', evidence, sectionId: 's3' }, SOURCE)).toBe('answer_not_supported');
    expect(checkNote({ point: 'Prokaryotic cells include bacteria, blue-green algae, mycoplasma and PPLO.', evidence, sectionId: 's3' }, SOURCE)).toBeNull();
    expect(checkNote({ point: 'Prokaryotes have a well-defined nucleus.', evidence: 'Prokaryotes have a well-defined nucleus bounded by a membrane', sectionId: 's3' }, SOURCE)).toBe('evidence_not_in_source');
  });
});

describe('similarity', () => {
  it('spots a reworded duplicate and leaves distinct questions alone', () => {
    expect(similarity('Who first explained that new cells are formed from pre-existing cells?', 'Who first explained that new cells are formed from pre existing cells')).toBeGreaterThanOrEqual(0.6);
    expect(similarity('Who first explained that new cells are formed from pre-existing cells?', 'What size are the ribosomes of prokaryotes?')).toBeLessThan(0.2);
  });
});

describe('sectionsFromPages', () => {
  const sections = sectionsFromPages(CHAPTER, HEADINGS);

  it('cuts the chapter at its headings, skipping the contents list, the summary and the exercises', () => {
    expect(sections.map((s) => s.heading)).toEqual(['What is a Cell?', 'Cell Theory', 'Prokaryotic Cells']);
    expect(sections[1].text.startsWith('8.2 CELL THEORY')).toBe(true);
    expect(sections[2].text).not.toMatch(/EXERCISES/);
  });

  it('knows which pages each section spans, and which section holds a quote', () => {
    expect(sections[1].pages).toEqual([3]);
    expect(sections[0].pages).toEqual([2]);
    expect(sectionOfEvidence(sections, 'Ribosomes of prokaryotes are 70S while those of eukaryotes are 80S')?.heading).toBe('Prokaryotic Cells');
  });

  it('falls back to page-aligned chunks when the text has no headings to cut at', () => {
    const chunks = sectionsFromPages(CHAPTER, []);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].heading).toMatch(/^Pages 1/);
  });
});
