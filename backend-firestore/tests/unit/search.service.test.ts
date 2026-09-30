// Firestore: each collection returns canned docs for the `.where().select().limit().get()` chain.
const collections: Record<string, { id: string; data: any }[]> = {};
const failingCollections = new Set<string>();
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: jest.fn((name: string) => {
      const chain: any = {
        where: jest.fn(() => chain),
        select: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        get: jest.fn(async () => {
          if (failingCollections.has(name)) throw new Error(`index missing for ${name}`);
          return { docs: (collections[name] || []).map((d) => ({ id: d.id, data: () => d.data })) };
        }),
      };
      return chain;
    }),
  },
}));

const cache = new Map<string, any>();
jest.mock('../../src/services/cache.service', () => ({
  cacheService: {
    get: jest.fn(async (k: string) => cache.get(k) ?? null),
    set: jest.fn(async (k: string, v: any) => { cache.set(k, v); }),
  },
}));

jest.mock('../../src/services/bookLibrary.service', () => ({
  bookLibraryService: { listBooks: jest.fn(), getBookDetail: jest.fn() },
}));
jest.mock('../../src/repositories/notebook.repository', () => ({
  notebookRepository: { getNotebooksByUser: jest.fn() },
}));
jest.mock('../../src/services/rag/retrieval.service', () => ({
  retrievalService: { retrieveCurriculumContext: jest.fn() },
}));

import { SearchService } from '../../src/services/search/search.service';
import { tokenize, indexFields, scoreItem } from '../../src/services/search/textMatch';
import { chapterLabel } from '../../src/services/search/chapterLabel';
import { bookLibraryService } from '../../src/services/bookLibrary.service';
import { notebookRepository } from '../../src/repositories/notebook.repository';
import { retrievalService } from '../../src/services/rag/retrieval.service';

const chapter = (sourceId: string, chapterName: string, concepts: string[] = []) => ({
  sourceId, title: `NCERT Book - ${sourceId}`, chapterName, status: 'READY',
  headings: [], learningObjectives: [], keyConcepts: concepts.map((term) => ({ term, definition: '' })),
  importantFacts: [], keywords: [], formulae: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  cache.clear();
  failingCollections.clear();
  for (const k of Object.keys(collections)) delete collections[k];

  (bookLibraryService.listBooks as jest.Mock).mockResolvedValue([
    { notebookId: 'nb-sci10', title: 'NCERT Class 10 Science', subject: 'Science', className: 'Class 10' },
    { notebookId: 'nb-chem12', title: 'NCERT Class 12 Chemistry', subject: 'Chemistry', className: 'Class 12' },
  ]);
  (bookLibraryService.getBookDetail as jest.Mock).mockImplementation(async (id: string) => {
    if (id === 'nb-sci10') {
      return {
        notebookId: id, title: 'NCERT Class 10 Science', subject: 'Science', className: 'Class 10',
        chapters: [chapter('s1', 'Life Processes', ['Photosynthesis', 'Respiration']), chapter('s2', 'Light – Reflection and Refraction')],
      };
    }
    return {
      notebookId: id, title: 'NCERT Class 12 Chemistry', subject: 'Chemistry', className: 'Class 12',
      chapters: [chapter('s3', 'Chemical Kinetics', ['Rate law'])],
    };
  });
  (notebookRepository.getNotebooksByUser as jest.Mock).mockResolvedValue([
    { id: 'n1', title: 'Kinetics revision notes', updatedAt: 5, isArchived: false },
    { id: 'n2', title: 'Old kinetics notebook', updatedAt: 1, isArchived: true },
  ]);
});

describe('textMatch', () => {
  const fields = indexFields([{ text: 'NCERT Class 12 Mathematics', weight: 3 }, { text: 'Class 12', weight: 2 }]);

  it('matches tokens in any order and rejects partial matches', () => {
    expect(scoreItem(tokenize('mathematics 12'), fields)).not.toBeNull();
    expect(scoreItem(tokenize('mathematics 11'), fields)).toBeNull();
  });

  it('does not let a number match inside a longer number', () => {
    expect(scoreItem(tokenize('2'), fields)).toBeNull();
  });

  it('tolerates a small typo', () => {
    expect(scoreItem(tokenize('matematics'), fields)).not.toBeNull();
  });
});

describe('chapterLabel', () => {
  it.each([
    ['Unit 7 Alcohols, Phenols and Ethers', 'x', 'Alcohols, Phenols and Ethers'],
    ['CHAPTER TWELVE: KINETIC THEORY', 'x', 'Kinetic Theory'],
    ['11 \u2015 Grassroots Democracy \u2013 Part 2', 'x', 'Grassroots Democracy \u2013 Part 2'],
    ['I. AMINES', 'x', 'Amines'],
    ['Light \u2013 Reflection and Refraction', 'x', 'Light \u2013 Reflection and Refraction'],
    ['Unit 6', 'NCERT Class 11 Chemistry (Part 2) - Chapter 6.pdf', 'Chapter 6 \u00b7 Part 2'],
    ['9', 'NCERT Class 10 Science - Chapter 9', 'Chapter 9'],
    [undefined, 'NCERT Class 11 Political Science (Part 1) - Chapter 4', 'Chapter 4 \u00b7 Part 1'],
  ])('%s → %s', (name, title, expected) => {
    expect(chapterLabel(name as string | undefined, title)).toBe(expected);
  });
});

describe('SearchService.search', () => {
  it('finds chapters by name and by key concept across the whole catalog', async () => {
    const svc = new SearchService();
    const byConcept = await svc.search('u1', 'photosynthesis', { types: ['chapter'] });
    expect(byConcept).toHaveLength(1);
    expect(byConcept[0]).toMatchObject({ type: 'chapter', notebookId: 'nb-sci10', sourceId: 's1', title: 'Life Processes' });

    const byName = await svc.search('u1', 'kinetics', { types: ['chapter'] });
    expect(byName.map((h) => h.sourceId)).toEqual(['s3']);
  });

  it('does not list every chapter of a book for a subject-only query', async () => {
    const svc = new SearchService();
    expect(await svc.search('u1', 'science', { types: ['chapter'] })).toEqual([]);
  });

  it('does not match chapters by the subject/class embedded in unnamed chapter titles', async () => {
    (bookLibraryService.getBookDetail as jest.Mock).mockImplementation(async (id: string) => ({
      notebookId: id, title: 'NCERT Class 11 Physics', subject: 'Physics', className: 'Class 11',
      chapters: [{ ...chapter('s9', ''), chapterName: undefined, title: 'NCERT Class 11 Physics (Part 1) - Chapter 4' }],
    }));
    const svc = new SearchService();
    expect(await svc.search('u1', 'physics', { types: ['chapter'] })).toEqual([]);
    expect(await svc.search('u1', 'class 11', { types: ['chapter'] })).toEqual([]);
  });

  it('collapses the same chapter ingested twice in one book', async () => {
    (bookLibraryService.listBooks as jest.Mock).mockResolvedValue([{ notebookId: 'nb-sci10', title: 'NCERT Class 10 Science', subject: 'Science' }]);
    (bookLibraryService.getBookDetail as jest.Mock).mockResolvedValue({
      notebookId: 'nb-sci10', title: 'NCERT Class 10 Science', subject: 'Science', className: 'Class 10',
      chapters: [chapter('a', 'Acids, Bases and Salts'), chapter('b', 'Acids, Bases and Salts')],
    });
    const hits = await new SearchService().search('u1', 'acids bases', { types: ['chapter'] });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ title: 'Acids, Bases and Salts', sourceTitle: 'NCERT Book - a' });
  });

  it('answers without chapters instead of waiting out a slow cold build, then serves them once built', async () => {
    jest.useFakeTimers();
    try {
      let finish!: (v: any) => void;
      (bookLibraryService.listBooks as jest.Mock).mockReturnValue(new Promise((r) => { finish = r; }));
      collections.podcasts = [{ id: 'p1', data: { title: 'Kinetics podcast' } }];
      const svc = new SearchService();
      const pending = svc.search('u1', 'kinetics', { types: ['chapter', 'podcast'] });
      await jest.advanceTimersByTimeAsync(1600);
      expect((await pending).map((h) => h.type)).toEqual(['podcast']);

      finish([{ notebookId: 'nb-chem12', title: 'NCERT Class 12 Chemistry', subject: 'Chemistry' }]);
      await jest.advanceTimersByTimeAsync(0);
      const later = await svc.search('u1', 'kinetics', { types: ['chapter'] });
      expect(later.map((h) => h.sourceId)).toEqual(['s3']);
      expect(bookLibraryService.listBooks).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('builds the chapter index once and reuses it', async () => {
    const svc = new SearchService();
    await Promise.all([svc.search('u1', 'light', { types: ['chapter'] }), svc.search('u1', 'rate law', { types: ['chapter'] })]);
    await svc.search('u1', 'kinetics', { types: ['chapter'] });
    expect(bookLibraryService.listBooks).toHaveBeenCalledTimes(1);
  });

  it("searches the caller's own content and skips archived notebooks and untitled chats", async () => {
    collections.chat_sessions = [
      { id: 'c1', data: { title: 'Kinetics doubts', createdAt: 3 } },
      { id: 'c2', data: { createdAt: 4 } },
    ];
    collections.podcasts = [{ id: 'p1', data: { title: 'Chemical kinetics explained', status: 'COMPLETED', createdAt: 2 } }];
    collections.quiz_attempts = [{ id: 'q1', data: { title: 'Kinetics quiz', topic: 'Rate law', status: 'completed', createdAt: '2026-09-01T00:00:00Z' } }];

    const hits = await new SearchService().search('u1', 'kinetics', { types: ['chat', 'notebook', 'podcast', 'quiz'] });
    expect(hits.map((h) => `${h.type}:${h.id}`).sort()).toEqual(['chat:c1', 'notebook:n1', 'podcast:p1', 'quiz:q1']);
    expect(hits.find((h) => h.type === 'quiz')).toMatchObject({ subtitle: 'Rate law' });
  });

  it('keeps other types when one collection lookup fails', async () => {
    failingCollections.add('chat_sessions');
    collections.podcasts = [{ id: 'p1', data: { title: 'Kinetics podcast' } }];
    const hits = await new SearchService().search('u1', 'kinetics', { types: ['chat', 'podcast'] });
    expect(hits.map((h) => h.id)).toEqual(['p1']);
  });

  it('returns nothing for an empty query without touching storage', async () => {
    expect(await new SearchService().search('u1', '  ')).toEqual([]);
    expect(bookLibraryService.listBooks).not.toHaveBeenCalled();
  });
});

describe('SearchService.semantic', () => {
  it('returns one hit per chapter, labelled from the catalog, with page and snippet', async () => {
    (retrievalService.retrieveCurriculumContext as jest.Mock).mockResolvedValue([
      { text: 'Autotrophs make food by photosynthesis.', source: 'x', score: 0.9, weightedScore: 1.2, metadata: { notebookId: 'nb-sci10', sourceId: 's1', pageNumber: 4 } },
      { text: 'Another passage from the same chapter.', source: 'x', score: 0.8, metadata: { notebookId: 'nb-sci10', sourceId: 's1', pageNumber: 6 } },
      { text: 'No ids — cannot be opened.', source: 'x', score: 0.7, metadata: {} },
    ]);
    const hits = await new SearchService().semantic('how do plants make food');
    expect(hits).toEqual([
      expect.objectContaining({ sourceId: 's1', title: 'Life Processes', subject: 'Science', pageNumber: 4, snippet: 'Autotrophs make food by photosynthesis.' }),
    ]);
  });

  it('skips retrieval for very short queries', async () => {
    expect(await new SearchService().semantic('ab')).toEqual([]);
    expect(retrievalService.retrieveCurriculumContext).not.toHaveBeenCalled();
  });
});
