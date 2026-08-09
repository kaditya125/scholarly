import {
  resolveNotebookContext,
  buildVectorMetadata,
  normalizedMetadataPatch,
  EMBEDDING_VERSION,
  CHUNK_VERSION,
} from '../../src/services/vectorMetadata';

describe('resolveNotebookContext', () => {
  it('parses subject/class/board from an NCERT curriculum notebook', () => {
    const ctx = resolveNotebookContext(
      { id: 'ncert-c11-physics', title: 'NCERT Class 11 Physics', owner: 'ncert-curriculum' } as any,
      { title: 'NCERT Class 11 Physics (Part 1) - Chapter 5' } as any,
    );
    expect(ctx.class).toBe('11');
    expect(ctx.subject).toBe('Physics');
    expect(ctx.board).toBe('NCERT');
    expect(ctx.language).toBe('en');
  });

  it('detects Hindi language', () => {
    const ctx = resolveNotebookContext(
      { id: 'ncert-c11-hindi-aroh', title: 'NCERT Class 11 Hindi (Aroh)', owner: 'ncert-curriculum' } as any,
    );
    expect(ctx.language).toBe('hi');
    expect(ctx.class).toBe('11');
    expect(ctx.board).toBe('NCERT');
  });

  it('never returns undefined fields for an unknown notebook, and does not fabricate a subject from a random id', () => {
    const ctx = resolveNotebookContext({ id: 'fLTTIH7HFgqCEMCQco1b', title: 'Test Source' } as any);
    for (const v of Object.values(ctx)) expect(v).not.toBeUndefined();
    expect(ctx.subject).toBe(''); // must NOT become the notebook id
    expect(ctx.class).toBe('');
    expect(ctx.board).toBe('');
    expect(ctx.language).toBe('en'); // default
  });
});

describe('buildVectorMetadata', () => {
  const source = { id: 'src1', userId: 'u1', notebookId: 'ncert-c11-physics', title: 'NCERT Class 11 Physics - Chapter 5', createdAt: 1700000000000 };
  const ctx = { subject: 'Physics', class: '11', board: 'NCERT', language: 'en' };

  it('produces all required scoping fields with no undefined values', () => {
    const md: any = buildVectorMetadata({
      source: source as any,
      chunk: { text: 'Newton laws', pageNumber: 2, paragraphIndex: 1 },
      chunkIndex: 3,
      ctx,
      difficulty: 'Medium',
      tags: ['inertia', 'force'],
    });
    const required = ['userId', 'notebookId', 'sourceId', 'chapterId', 'subject', 'class', 'board', 'language', 'embeddingVersion', 'chunkVersion'];
    for (const key of required) {
      expect(md[key]).toBeDefined();
      expect(md[key]).not.toBeNull();
    }
    for (const v of Object.values(md)) expect(v).not.toBeUndefined();
    expect(md.embeddingVersion).toBe(EMBEDDING_VERSION);
    expect(md.chunkVersion).toBe(CHUNK_VERSION);
    expect(md.text).toBe('Newton laws');
    expect(md.chunkIndex).toBe(3);
    expect(md.sourceId).toBe('src1');
    expect(md.chapterId).toBe('src1');
  });

  it('defaults optional chunk fields instead of leaving them undefined', () => {
    const md: any = buildVectorMetadata({ source: source as any, chunk: { text: 'x' }, chunkIndex: 0, ctx });
    expect(md.pageNumber).toBe(0);
    expect(md.paragraphIndex).toBe(0);
    expect(Array.isArray(md.tags)).toBe(true);
  });
});

describe('normalizedMetadataPatch', () => {
  it('contains scoping fields and never the text/values', () => {
    const patch: any = normalizedMetadataPatch(
      { id: 'src1', userId: 'u1', notebookId: 'nb1', title: 't' } as any,
      { subject: 'Physics', class: '11', board: 'NCERT', language: 'en' },
    );
    expect(patch.text).toBeUndefined();
    expect(patch.values).toBeUndefined();
    expect(patch.sourceId).toBe('src1');
    expect(patch.embeddingVersion).toBe(EMBEDDING_VERSION);
    for (const v of Object.values(patch)) expect(v).not.toBeUndefined();
  });
});
