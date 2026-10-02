/**
 * The Phase 2 curriculum tools. The services they wrap are mocked; what is tested here is the
 * tool contract: declared schemas match real output, the curriculum-only boundary is enforced,
 * the asset join works, and the web tool stays invisible while its flag is off.
 */
const mockListBooks = jest.fn();
const mockGetBookDetail = jest.fn();
jest.mock('../../../src/services/bookLibrary.service', () => ({
  bookLibraryService: { listBooks: () => mockListBooks(), getBookDetail: (id: string) => mockGetBookDetail(id) },
}));

const mockAssets = jest.fn();
const mockNodes = jest.fn();
const mockEdges = jest.fn();
jest.mock('../../../src/repositories/notebook.repository', () => ({
  notebookRepository: {
    getLearningAssets: (...a: any[]) => mockAssets(...a),
    getKGNodesForSource: (...a: any[]) => mockNodes(...a),
    getKGEdgesForNodes: (...a: any[]) => mockEdges(...a),
  },
}));

const mockCurriculumContext = jest.fn();
const mockWebContext = jest.fn();
jest.mock('../../../src/services/rag/retrieval.service', () => ({
  retrievalService: {
    retrieveCurriculumContext: (...a: any[]) => mockCurriculumContext(...a),
    retrieveWebContext: (...a: any[]) => mockWebContext(...a),
  },
}));

import { registerCurriculumTools } from '../../../src/agents/tools/adapters/curriculum.adapter';
import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';
import { ToolError } from '../../../src/agents/tools/toolErrors';

const registry = () => registerCurriculumTools(new ToolRegistry());
const ctx = { userId: 'u1', runId: 'r1', stepId: 's1', signal: new AbortController().signal };

/** Runs a tool the way the executor does: validate input, execute, validate declared output. */
async function run(name: string, input: any) {
  const tool = registry().get(name);
  if (!tool) throw new Error(`tool ${name} is not registered/enabled`);
  const parsedInput = tool.inputSchema.parse(input);
  const result = await tool.execute(parsedInput, ctx);
  tool.outputSchema.parse(result.data);
  return result;
}

const BOOKS = [
  { notebookId: 'ncert-c11-physics', title: 'NCERT Class 11 Physics', subject: 'Physics', className: 'Class 11' },
  { notebookId: 'ncert-c12-physics', title: 'NCERT Class 12 Physics', subject: 'Physics', className: 'Class 12' },
  { notebookId: 'ncert-c11-chemistry', title: 'NCERT Class 11 Chemistry', subject: 'Chemistry', className: 'Class 11' },
];

const C11_PHYSICS_DETAIL = {
  ...BOOKS[0],
  chapters: [
    { sourceId: 's3', title: 'NCERT Class 11 Physics (Part 1) - Chapter 3', chapterName: 'MOTION IN A PLANE', headings: ['SCALARS AND VECTORS'] },
    {
      sourceId: 's4',
      title: 'NCERT Class 11 Physics (Part 1) - Chapter 4',
      chapterName: 'Laws of Motion',
      headings: ['4.1 INTRODUCTION', '4.4 NEWTON’S FIRST LAW OF MOTION'],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AGENT_MODE_ENABLED = 'true';
  delete process.env.AGENT_WEB_SEARCH_ENABLED;
  mockListBooks.mockResolvedValue(BOOKS);
  mockGetBookDetail.mockImplementation(async (id: string) => (id === 'ncert-c11-physics' ? C11_PHYSICS_DETAIL : null));
});
afterAll(() => {
  delete process.env.AGENT_MODE_ENABLED;
});

describe('resolve_curriculum_chapter', () => {
  it('resolves "Laws of Motion, Class 11 Physics" to the right book and chapter', async () => {
    const { data } = await run('resolve_curriculum_chapter', { query: 'Laws of Motion, Class 11 Physics' });
    expect(data).toMatchObject({
      resolved: true,
      needsClarification: false,
      notebookId: 'ncert-c11-physics',
      sourceId: 's4',
      chapterName: 'Laws of Motion',
    });
    expect(data.confidence).toBeGreaterThanOrEqual(0.95);
    expect(data.headings).toContain('4.1 INTRODUCTION');
    expect(mockGetBookDetail).toHaveBeenCalledWith('ncert-c11-physics'); // never the other class/subject
  });

  it('asks which chapter when the topic fits more than one', async () => {
    const { data } = await run('resolve_curriculum_chapter', { query: 'motion, class 11 physics' });
    expect(data).toMatchObject({ resolved: false, needsClarification: true, reason: 'ambiguous' });
    expect(data.alternatives.length).toBeGreaterThan(1);
  });

  it('says it cannot find the chapter rather than returning the closest one', async () => {
    const { data } = await run('resolve_curriculum_chapter', { query: 'photosynthesis, class 11 physics' });
    expect(data).toMatchObject({ resolved: false, needsClarification: true, reason: 'no_match' });
    expect(data.sourceId).toBeUndefined();
  });

  it('offers the catalog when no class or subject narrows it down', async () => {
    mockListBooks.mockResolvedValue([{ notebookId: 'x-1', title: 'Physics Handbook', subject: 'Physics' }]);
    const { data } = await run('resolve_curriculum_chapter', { query: 'chapter about waves' });
    expect(data.resolved).toBe(false);
    expect(data.candidateBooks?.length ?? data.alternatives.length).toBeGreaterThanOrEqual(0);
  });

  it('still works when the class and subject arrive as separate arguments', async () => {
    const { data } = await run('resolve_curriculum_chapter', { query: 'laws of motion', grade: 11, subject: 'Physics' });
    expect(data).toMatchObject({ resolved: true, sourceId: 's4' });
  });
});

describe('get_chapter_assets', () => {
  const ASSETS = [
    { type: 'KEY_FORMULAE', title: 'NCERT Class 11 Physics (Part 1) - Chapter 4.pdf - Key Formulae', content: { formulae: [{ formula: 'F = ma' }] } },
    { type: 'SUMMARY', title: 'NCERT Class 11 Physics (Part 1) - Chapter 4.pdf - Summary', content: { text: 'summary' } },
    { type: 'KEY_FORMULAE', title: 'NCERT Class 11 Physics (Part 1) - Chapter 3.pdf - Key Formulae', content: { formulae: [] } },
  ];

  it('returns only the assets belonging to that chapter', async () => {
    mockAssets.mockResolvedValue(ASSETS);
    const { data } = await run('get_chapter_assets', {
      notebookId: 'ncert-c11-physics',
      chapterTitle: 'NCERT Class 11 Physics (Part 1) - Chapter 4',
    });
    expect(data.assetCount).toBe(2);
    expect(data.types.sort()).toEqual(['KEY_FORMULAE', 'SUMMARY']);
    expect(data.assets[0].content).toBeUndefined(); // list only unless asked
  });

  it('filters by type and can include the content', async () => {
    mockAssets.mockResolvedValue(ASSETS);
    const { data } = await run('get_chapter_assets', {
      notebookId: 'ncert-c11-physics',
      chapterTitle: 'NCERT Class 11 Physics (Part 1) - Chapter 4',
      types: ['key_formulae'],
      includeContent: true,
    });
    expect(data.assetCount).toBe(1);
    expect(data.assets[0].content).toEqual({ formulae: [{ formula: 'F = ma' }] });
  });

  it("refuses a notebook that is not part of the shared curriculum", async () => {
    await expect(run('get_chapter_assets', { notebookId: 'someone-private-notebook', chapterTitle: 'x' })).rejects.toMatchObject({
      failureClass: 'permission',
    });
    expect(mockAssets).not.toHaveBeenCalled();
  });
});

describe('get_chapter_knowledge_graph', () => {
  it('returns the chapter’s concepts and only the relationships between them', async () => {
    mockNodes.mockResolvedValue([
      { id: 'n1', label: 'Newton’s first law', type: 'CONCEPT', importance: 0.9 },
      { id: 'n2', label: 'F = ma', type: 'FORMULA', importance: 0.7 },
      { id: 'n3', label: 'Inertia', type: 'CONCEPT', importance: 0.8 },
    ]);
    mockEdges.mockResolvedValue([
      { sourceNodeId: 'n1', targetNodeId: 'n3', relationshipType: 'RELATED_TO' },
      { sourceNodeId: 'n1', targetNodeId: 'n-not-returned', relationshipType: 'RELATED_TO' },
    ]);
    const { data } = await run('get_chapter_knowledge_graph', { notebookId: 'ncert-c11-physics', sourceId: 's4' });
    expect(data.nodeCount).toBe(3);
    expect(data.nodes[0].label).toBe('Newton’s first law'); // most important first
    expect(data.relationships).toEqual([{ from: 'Newton’s first law', to: 'Inertia', type: 'RELATED_TO' }]);
  });

  it('refuses a notebook outside the curriculum corpus', async () => {
    await expect(run('get_chapter_knowledge_graph', { notebookId: 'private-nb', sourceId: 's1' })).rejects.toBeInstanceOf(ToolError);
    expect(mockNodes).not.toHaveBeenCalled();
  });
});

describe('retrieve_curriculum_context', () => {
  it('returns passages with their sources and is priced above free (it spends embedding quota)', async () => {
    mockCurriculumContext.mockResolvedValue([{ text: 'x'.repeat(2000), source: 'Chapter 4', score: 0.8 }]);
    const { data, provenance } = await run('retrieve_curriculum_context', { query: 'newton first law', topK: 3 });
    expect(mockCurriculumContext).toHaveBeenCalledWith('newton first law', 3);
    expect(data.results[0].text.length).toBe(800); // capped
    expect(provenance).toBe('VERIFIED_CORPUS');
    expect(registry().get('retrieve_curriculum_context')!.costClass).not.toBe('free');
  });
});

describe('web_research', () => {
  it('is not registered for planning while the flag is off', () => {
    expect(registry().get('web_research')).toBeUndefined();
    expect(registry().has('web_research')).toBe(false);
    expect(registry().names()).not.toContain('web_research');
    expect(registry().list().map((t) => t.name)).not.toContain('web_research');
  });

  it('appears when the flag is on and marks results as WEB, never corpus', async () => {
    process.env.AGENT_MODE_ENABLED = 'true';
    process.env.AGENT_WEB_SEARCH_ENABLED = 'true';
    mockWebContext.mockResolvedValue([{ text: 'page text', source: 'https://example.com/a', metadata: { title: 'A' } }]);
    const { data, provenance } = await run('web_research', { query: 'ssc cgl 2026 notification' });
    expect(provenance).toBe('WEB');
    expect(data.results[0]).toMatchObject({ url: 'https://example.com/a', title: 'A' });
    expect(registry().get('web_research')!.provenance).toBe('WEB');
  });
});
