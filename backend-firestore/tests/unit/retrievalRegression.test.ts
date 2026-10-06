/**
 * Retrieval regression set (Phase 9). Deterministic: real knowledgeRouter + real filter builder
 * + real tier ranking; no network. The live, data-level counterpart that runs these same filters
 * against production Qdrant is scripts/reference/books/check-reference-scope-live.ts.
 */
import { knowledgeRouter } from '../../src/core/knowledge/knowledgeRouter.service';
import { buildReferenceFilter } from '../../src/services/rag/referenceBooks.service';
import { rankAcrossTiers, KnowledgeTier } from '../../src/core/knowledge/knowledgeAuthority';
import { CS_REFERENCE_BOOKS } from '../../src/services/rag/referenceBookRegistry';

const PHYSICS = ['hc_verma_physics_vol1', 'hc_verma_physics_vol2', 'irodov_physics_problems'];

type Case = { query: string; examId: string; books: string[]; examTags?: string[] };

const CASES: Case[] = [
  // Physics — JEE
  { query: 'Explain resolution of vectors into components in physics', examId: 'JEE_MAIN', books: PHYSICS, examTags: ['JEE_MAIN'] },
  { query: "Newton's laws of motion: block on a rough incline with friction", examId: 'JEE_MAIN', books: PHYSICS, examTags: ['JEE_MAIN'] },
  { query: 'work energy theorem physics for a variable force', examId: 'JEE_MAIN', books: PHYSICS, examTags: ['JEE_MAIN'] },
  { query: 'center of mass of a semicircular ring in physics mechanics', examId: 'JEE_ADVANCED', books: PHYSICS, examTags: ['JEE_ADVANCED'] },
  { query: 'rotational dynamics moment of inertia of a rod in physics', examId: 'JEE_MAIN', books: PHYSICS, examTags: ['JEE_MAIN'] },
  // Chemistry
  { query: 'organic chemistry SN1 vs SN2 reaction mechanism', examId: 'JEE_MAIN', books: ['jd_lee_inorganic', 'ms_chouhan_organic'], examTags: ['JEE_MAIN'] },
  { query: 'inorganic chemistry periodic table trends in ionisation energy', examId: 'NEET_UG', books: ['jd_lee_inorganic', 'ms_chouhan_organic'], examTags: ['NEET_UG', 'NEET'] },
  // Mathematics
  { query: 'trigonometry identities for compound angles (sl loney)', examId: 'JEE_MAIN', books: ['hall_knight_algebra', 'sl_loney_trigonometry'], examTags: ['JEE_MAIN'] },
  { query: 'binomial theorem in higher algebra (hall and knight)', examId: 'JEE_MAIN', books: ['hall_knight_algebra', 'sl_loney_trigonometry'], examTags: ['JEE_MAIN'] },
  // NEET biology
  { query: 'biology: light reaction of photosynthesis', examId: 'NEET_UG', books: ['trueman_biology_vol1', 'trueman_biology_vol2', 'campbell_biology'], examTags: ['NEET_UG', 'NEET'] },
  // UPSC polity
  { query: 'polity: fundamental rights under Article 21 of the constitution', examId: 'UPSC_CSE', books: ['laxmikanth_polity'], examTags: ['UPSC_CSE', 'UPSC'] },
];

describe('routing → reference filter, per subject and exam', () => {
  it.each(CASES)('$examId · $query', ({ query, examId, books, examTags }) => {
    const plan = knowledgeRouter.route({ query });
    expect(plan.useReferenceBooks).toBe(true);
    expect(plan.referenceBookFilters?.books).toEqual(books);
    const { scope, filter } = buildReferenceFilter({ book: plan.referenceBookFilters?.books, examCode: examId, domain: plan.targetSubject });
    expect(scope).toEqual({ kind: 'TAGS', examCodes: examTags });
    expect(filter!.book).toEqual({ $in: books });
    expect(filter!.exam_relevance).toEqual({ $in: examTags });
    expect(filter!.exam_relevance.$in).not.toContain('GENERAL');
  });
});

describe('no contamination', () => {
  it('reference retrieval never queries PYQ / generated / mock vectors', () => {
    const { filter } = buildReferenceFilter({ examCode: 'JEE_MAIN' });
    expect(filter).toMatchObject({ corpusBucket: 'REFERENCE_BOOK', is_pyq: false, is_generated: false, is_mock: false });
  });

  it('an SSC CGL physics doubt cannot reach JEE-only physics books (exam tags do the isolating)', () => {
    const { filter } = buildReferenceFilter({ book: PHYSICS, examCode: 'SSC_CGL' });
    expect(filter!.exam_relevance).toEqual({ $in: ['SSC_CGL'] }); // H.C. Verma / Irodov are tagged JEE/NEET only
  });

  it('a physics doubt is not routed to humanities books, and polity is not routed to physics', () => {
    const phys = knowledgeRouter.route({ query: 'physics kinematics projectile range formula' }).referenceBookFilters?.books ?? [];
    expect(phys.some((b) => /laxmikanth|spectrum|lucent|ramesh/.test(b))).toBe(false);
    const pol = knowledgeRouter.route({ query: 'polity: powers of the governor under the constitution' }).referenceBookFilters?.books ?? [];
    expect(pol.some((b) => /verma|irodov|jd_lee/.test(b))).toBe(false);
  });

  it('CS exams search only CS books; UGC NET outside CS searches nothing', () => {
    expect(buildReferenceFilter({ examCode: 'SSC_IMD_CS' }).filter!.book).toEqual({ $in: CS_REFERENCE_BOOKS });
    expect(buildReferenceFilter({ examCode: 'UGC_NET', domain: 'Economics' })).toMatchObject({ scope: { kind: 'NO_SUPPORTED_REFERENCE_BOOKS' }, filter: null });
    // A CS exam asking for a non-CS book gets nothing rather than the non-CS book.
    expect(buildReferenceFilter({ examCode: 'GATE_CS', book: ['lucent_gk'] }).filter).toBeNull();
  });

  it('points flagged superseded (older duplicate ingestions) are excluded from every query', () => {
    const { toQdrantFilter } = require('../../src/services/rag/qdrantFilter');
    for (const opts of [{}, { examCode: 'JEE_MAIN', book: PHYSICS }, { examCode: 'SSC_IMD_CS' }]) {
      const { filter } = buildReferenceFilter(opts);
      expect(filter!.superseded).toEqual({ $ne: true });
      expect(toQdrantFilter(filter, 'reference_books').must_not).toContainEqual({ key: 'superseded', match: { value: true } });
    }
  });

  it('superseded duplicates are excluded from unfiltered retrieval', () => {
    expect(buildReferenceFilter({}).filter!.book).toEqual({ $nin: expect.arrayContaining(['irodov_physics', 'arihant_csat_reasoning']) });
  });
});

describe('authority ordering holds at comparable relevance, for every subject above', () => {
  const tiers: KnowledgeTier[] = ['AI_GENERATED', 'REFERENCE_BOOK', 'VERIFIED_PYQ', 'OFFICIAL_PRIMARY'];
  it.each(CASES.map((c) => c.query))('%s', (query) => {
    const r = 0.55 + (query.length % 17) / 100; // per-case relevance, identical across tiers
    const ranked = rankAcrossTiers(tiers.map((tier) => ({ tier, relevance: r, item: `${tier}:${query}` })));
    expect(ranked.map((x) => x.tier)).toEqual(['OFFICIAL_PRIMARY', 'VERIFIED_PYQ', 'REFERENCE_BOOK', 'AI_GENERATED']);
  });

  it('within 10% relevance, a lower tier still never overtakes a higher one', () => {
    const ranked = rankAcrossTiers([
      { tier: 'REFERENCE_BOOK' as KnowledgeTier, relevance: 0.66, item: 'ref' },
      { tier: 'VERIFIED_PYQ' as KnowledgeTier, relevance: 0.6, item: 'pyq' },
    ]);
    expect(ranked[0].item).toBe('pyq'); // 0.6×1.2 = 0.72 > 0.66×0.9 = 0.594
  });
});
