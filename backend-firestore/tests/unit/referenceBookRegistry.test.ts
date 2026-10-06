/**
 * Phase 4/5 — book identity is unambiguous, routing only names real canonical books, duplicates are
 * excluded at query time, and exams with no in-scope book get NO_SUPPORTED_REFERENCE_BOOKS instead
 * of another exam's books.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  CANONICAL_REFERENCE_BOOKS, BOOK_ALIASES, BROKEN_REFERENCE_BOOKS, RETRIEVAL_EXCLUDED_BOOKS, CS_REFERENCE_BOOKS,
  canonicalBookId, resolveBookFilter, referenceScopeFor,
} from '../../src/services/rag/referenceBookRegistry';
import { examRelevanceCodes } from '../../src/services/rag/referenceBooks.service';

const canonical = new Set<string>(CANONICAL_REFERENCE_BOOKS);
const scope = (exam?: string, subject?: string) => referenceScopeFor(exam, subject, examRelevanceCodes);

describe('book identity', () => {
  it('canonical ids are unique', () => {
    expect(new Set(CANONICAL_REFERENCE_BOOKS).size).toBe(CANONICAL_REFERENCE_BOOKS.length);
  });

  it('an alias is never itself canonical, never chains, and points at a real book', () => {
    for (const [alias, a] of Object.entries(BOOK_ALIASES)) {
      expect(canonical.has(alias)).toBe(false);
      expect(canonical.has(a.canonical)).toBe(true);
      expect(BOOK_ALIASES[a.canonical]).toBeUndefined();
      expect(a.reason.length).toBeGreaterThan(20);
    }
  });

  it('documents the investigated duplicates', () => {
    expect(canonicalBookId('irodov_physics')).toBe('irodov_physics_problems');
    expect(canonicalBookId('m_laxmikanth_polity')).toBe('laxmikanth_polity');
    expect(canonicalBookId('jd_lee_inorganic_chemistry')).toBe('jd_lee_inorganic');
    expect(canonicalBookId('hc_verma_physics_vol1')).toBe('hc_verma_physics_vol1');
  });

  it('a filter naming an alias resolves to the canonical book once; broken books are dropped', () => {
    expect(resolveBookFilter(['irodov_physics', 'irodov_physics_problems', 'arihant_csat_reasoning'])).toEqual(['irodov_physics_problems']);
    expect(resolveBookFilter(undefined)).toBeUndefined();
  });

  it('superseded and broken ingestions are excluded from unfiltered retrieval', () => {
    expect(RETRIEVAL_EXCLUDED_BOOKS).toEqual(expect.arrayContaining(['irodov_physics', 'hc_verma_vol1', 'arihant_csat_reasoning']));
    for (const b of RETRIEVAL_EXCLUDED_BOOKS) expect(canonical.has(b)).toBe(false);
    expect(Object.keys(BROKEN_REFERENCE_BOOKS)).toContain('arihant_csat_reasoning');
  });

  it('the knowledge router only names canonical books', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/core/knowledge/knowledgeRouter.service.ts'), 'utf8');
    const named = [...src.matchAll(/books:\s*\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]));
    expect(named.length).toBeGreaterThan(20);
    expect(named.filter((b) => !canonical.has(b))).toEqual([]);
  });

  it('ingestion manifests only use canonical keys', () => {
    const dir = path.resolve(__dirname, '../../scripts/reference/books/manifests');
    for (const f of fs.readdirSync(dir)) {
      for (const b of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) expect([f, canonical.has(b.key)]).toEqual([f, true]);
    }
  });
});

describe('exam scope (UGC NET and other CS exams)', () => {
  it('CS-only exams are served by the CS books, by book list', () => {
    for (const e of ['SSC_IMD_CS', 'GATE_CS', 'ISRO_CS', 'NIC_NIELIT_CS', 'DRDO_CEPTAM_CS']) {
      expect(scope(e)).toMatchObject({ kind: 'BOOKS', books: CS_REFERENCE_BOOKS });
    }
  });

  it('UGC NET gets CS books only for a Computer Science question', () => {
    expect(scope('UGC_NET', 'computer_science')).toMatchObject({ kind: 'BOOKS' });
    expect(scope('UGC_NET', 'database_management')).toMatchObject({ kind: 'BOOKS' });
    expect(scope('UGC_NET', 'Economics').kind).toBe('NO_SUPPORTED_REFERENCE_BOOKS');
    expect(scope('UGC_NET').kind).toBe('NO_SUPPORTED_REFERENCE_BOOKS');
  });

  it('tagged exams keep tag scoping (with resolver→tag aliases), never GENERAL', () => {
    expect(scope('JEE_MAIN')).toEqual({ kind: 'TAGS', examCodes: ['JEE_MAIN'] });
    expect(scope('NEET_UG')).toEqual({ kind: 'TAGS', examCodes: ['NEET_UG', 'NEET'] });
    expect(scope('UPSC_CSE')).toEqual({ kind: 'TAGS', examCodes: ['UPSC_CSE', 'UPSC'] });
  });

  it('an exam no book is tagged for is NO_SUPPORTED_REFERENCE_BOOKS, not a fallback', () => {
    expect(scope('CUET_UG').kind).toBe('NO_SUPPORTED_REFERENCE_BOOKS');
    expect(scope(undefined)).toEqual({ kind: 'ANY' });
  });
});
