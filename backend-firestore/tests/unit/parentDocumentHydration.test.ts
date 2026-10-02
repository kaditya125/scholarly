/**
 * Checkpoint 2 — small-to-big: child chunks hydrate to parent context, honestly labelled.
 */
const mockGetAll = jest.fn();
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: (name: string) => ({ doc: (id: string) => ({ __col: name, id }) }),
    getAll: (...refs: any[]) => mockGetAll(...refs),
  },
}));

import { ParentDocumentService, ParentDocument, hasRealSectionTitle } from '../../src/services/rag/parentDocument.service';
import { buildParentContexts } from '../../src/services/rag/parentChunking';

const parent = (id: string, extra: Partial<ParentDocument> = {}): ParentDocument => ({
  id, book: 'hc_verma_physics_vol2', bookTitle: 'Concepts of Physics (Volume 2)', pageStart: 41, pageEnd: 44,
  fullText: 'full parent context text with many words', childChunkIds: [], totalChildren: 0, ...extra,
});
const snapsFor = (docs: ParentDocument[]) => async (...refs: any[]) =>
  refs.map((r) => {
    const d = docs.find((x) => x.id === r.id);
    return { id: r.id, exists: !!d, data: () => d };
  });
const child = (text: string, parentDocId?: string, score = 0.8) => ({ text, source: 'HCV', score, metadata: { parentDocId, pageNumber: 42 } });

beforeEach(() => mockGetAll.mockReset());

describe('hydrateParentContext', () => {
  it('extracts unique parent ids, ignores blanks, dedupes children of one parent at the best rank', async () => {
    mockGetAll.mockImplementation(snapsFor([parent('p1'), parent('p2')]));
    const out = await new ParentDocumentService().hydrateParentContext([
      child('c1', 'p1', 0.9), child('c2', 'p1', 0.7), child('c3', ' '), child('c4', 'p2', 0.6),
    ] as any);
    expect(mockGetAll).toHaveBeenCalledTimes(1);
    expect(mockGetAll.mock.calls[0].map((r: any) => r.id)).toEqual(['p1', 'p2']);
    expect(out.map((r) => r.metadata.childText ?? r.text)).toEqual(['c1', 'c3', 'c4']);
  });

  it('returns the documented fields and preserves the original metadata', async () => {
    mockGetAll.mockImplementation(snapsFor([parent('p1')]));
    const [r] = await new ParentDocumentService().hydrateParentContext([child('the child', 'p1')] as any);
    expect(r.metadata).toMatchObject({
      childText: 'the child', parentDocId: 'p1', parentText: 'full parent context text with many words',
      pageStart: 41, pageEnd: 44, parentWordCount: 7, isParentExpanded: true, pageNumber: 42,
    });
    expect(r.metadata.parentTitle).toBe('Concepts of Physics (Volume 2) (pp. 41–44)');
    expect(r.score).toBe(0.8);
  });

  it('labels a page window "PARENT CONTEXT", never a section', async () => {
    mockGetAll.mockImplementation(snapsFor([parent('p1', { chapter: 'Section (Pages 41–44)', sectionTitle: 'Concepts of Physics (Volume 2) — pp. 41–44' })]));
    const [r] = await new ParentDocumentService().hydrateParentContext([child('c', 'p1')] as any);
    expect(r.text.startsWith('--- PARENT CONTEXT:')).toBe(true);
    expect(r.text).not.toMatch(/SECTION/);
  });

  it('uses real chapter/section titles when the source has them', async () => {
    const real = parent('p1', { chapter: 'Rotational Mechanics', sectionTitle: 'Moment of Inertia' });
    expect(hasRealSectionTitle(real)).toBe(true);
    mockGetAll.mockImplementation(snapsFor([real]));
    const [r] = await new ParentDocumentService().hydrateParentContext([child('c', 'p1')] as any);
    expect(r.text).toMatch(/^--- SECTION: .*Rotational Mechanics › Moment of Inertia/);
    expect(r.metadata.parentTitle).toBe('Moment of Inertia');
  });

  it('keeps a child whose parent is missing (and reads nothing for chunks without parents)', async () => {
    mockGetAll.mockImplementation(snapsFor([]));
    const svc = new ParentDocumentService();
    const out = await svc.hydrateParentContext([child('orphan', 'gone')] as any);
    expect(out[0].text).toBe('orphan');
    expect(out[0].metadata.isParentExpanded).toBeUndefined();
    mockGetAll.mockClear();
    await svc.hydrateParentContext([child('legacy')] as any);
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it('caches parents: a second hydration of the same parent does no Firestore read', async () => {
    mockGetAll.mockImplementation(snapsFor([parent('p1')]));
    const svc = new ParentDocumentService();
    await svc.hydrateParentContext([child('a', 'p1')] as any);
    await svc.hydrateParentContext([child('b', 'p1')] as any);
    expect(mockGetAll).toHaveBeenCalledTimes(1);
  });

  it('batches reads at 100 ids per getAll', async () => {
    const docs = Array.from({ length: 230 }, (_, i) => parent(`p${i}`));
    mockGetAll.mockImplementation(snapsFor(docs));
    await new ParentDocumentService().hydrateParentContext(docs.map((d) => child(d.id, d.id)) as any);
    expect(mockGetAll.mock.calls.map((c) => c.length)).toEqual([100, 100, 30]);
  });
});

describe('buildParentContexts', () => {
  const page = (n: number, words: number, extra: any = {}) => ({ pageNumber: n, text: Array.from({ length: words }, (_, i) => `w${n}_${i}`).join(' '), ...extra });

  it('makes ~1,200-word page-window parents and 250-word children with parentDocId', () => {
    const { parents, children } = buildParentContexts([page(1, 500), page(2, 500), page(3, 500)], { bookKey: 'bk', bookTitle: 'Book' });
    expect(parents).toHaveLength(2);
    expect(parents[0]).toMatchObject({ pageStart: 1, pageEnd: 2, book: 'bk' });
    expect(parents[0].chapter).toBeUndefined();          // a window is not a chapter
    expect(parents[0].sectionTitle).toBeUndefined();
    expect(parents[0].metadata?.boundary).toBe('page_window');
    expect(children.every((c) => parents.some((p) => p.id === c.parentDocId))).toBe(true);
    expect(Math.max(...children.map((c) => c.text.split(' ').length))).toBeLessThanOrEqual(250);
  });

  it('keeps the frozen id format so re-ingesting an existing book is idempotent', () => {
    const { parents, children } = buildParentContexts([page(7, 300)], { bookKey: 'hc_verma_physics_vol2', bookTitle: 'B' });
    expect(parents[0].id).toBe('parent_hc_verma_physics_vol2_p007_sec0001');
    expect(children[0].id).toBe('ref_hc_verma_physics_vol2_p0007_sec1_c0');
  });

  it('starts a new parent at a real chapter boundary and carries the titles', () => {
    const { parents } = buildParentContexts([
      page(1, 100, { chapter: 'Kinematics' }), page(2, 100, { chapter: 'Kinematics' }), page(3, 100, { chapter: 'Laws of Motion' }),
    ], { bookKey: 'b', bookTitle: 'B' });
    expect(parents.map((p) => p.chapter)).toEqual(['Kinematics', 'Laws of Motion']);
    expect(parents[0].metadata?.boundary).toBe('heading');
  });
});
