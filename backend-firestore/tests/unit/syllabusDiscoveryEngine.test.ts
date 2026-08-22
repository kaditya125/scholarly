/**
 * J.11 — the discovery engine.
 *
 * THE GAP THIS CLOSES: J.6 could judge candidates but nothing produced them. Its service had zero
 * production callers and no code in `src/` created a `RawDiscoveryEntry`. These lock the acquisition
 * half AND the boundary — the engine sequences and records, but every decision belongs to a service
 * that already owned it.
 */
import {
  SyllabusDiscoveryEngine,
} from '../../src/services/exam/discovery/syllabusDiscoveryEngine';
import {
  DiscoveryProviderRegistry, OfficialDiscoveryProvider,
} from '../../src/services/exam/discovery/officialDiscoveryProvider';
import {
  GenericOfficialDiscoveryProvider,
} from '../../src/services/exam/discovery/genericOfficialDiscoveryProvider';
import type { ExamMaster } from '../../src/types/exam.types';
import fs from 'fs';
import path from 'path';

const EXAM = {
  examId: 'SYN_EXAM', name: 'Synthetic Examination', shortName: 'SYN',
  conductingAuthority: 'Synthetic Authority', category: 'SSC', country: 'IN',
  aliases: ['SYN'], officialDomains: ['authority.example'],
  currentCycle: '2026',
  verifiedOfficialUrls: {
    authorityHome: 'https://authority.example',
    syllabusPage: 'https://authority.example/syllabus',
  },
  status: 'ACTIVE', createdAt: 1, updatedAt: 1,
} as unknown as ExamMaster;

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(6000, 0x20)]);
const HTML = Buffer.from('<!doctype html><html><head><title>Home</title></head></.html>'.padEnd(9000, ' '));

/** Serves a small synthetic official site. */
const makeSite = (pages: Record<string, { body: string; contentType?: string }>) =>
  async (url: string) => {
    const hit = pages[url];
    if (!hit) throw new Error(`404 ${url}`);
    return { body: hit.body, contentType: hit.contentType ?? 'text/html', finalUrl: url };
  };

const bytesFor = (map: Record<string, Buffer>) =>
  async (url: string) => {
    const b = map[url];
    if (!b) throw new Error(`ECONNREFUSED ${url}`);
    return { buffer: b, contentType: b.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf' : 'text/html' };
  };

const engine = () => new SyllabusDiscoveryEngine(
  new DiscoveryProviderRegistry().register(new GenericOfficialDiscoveryProvider()));

describe('J.11 discovery acquires from the authority\'s own infrastructure', () => {
  it('finds a syllabus PDF linked from an official page', async () => {
    const r = await engine().discover({
      exam: EXAM, cycleId: '2026',
      fetchText: makeSite({
        'https://authority.example/robots.txt': { body: 'User-agent: *\n', contentType: 'text/plain' },
        'https://authority.example/sitemap.xml': { body: '<urlset></urlset>', contentType: 'application/xml' },
        'https://authority.example/syllabus': {
          body: '<a href="/docs/SYN_2026_Syllabus.pdf">SYN 2026 Syllabus</a>',
        },
        'https://authority.example': { body: '<html></html>' },
      }),
      fetchBytes: bytesFor({ 'https://authority.example/docs/SYN_2026_Syllabus.pdf': PDF }),
    });
    expect(r.outcome).toBe('FOUND');
    expect(r.selected?.discoveredUrl).toContain('SYN_2026_Syllabus.pdf');
    expect(r.selected?.status).toBe('VERIFIED_CANDIDATE');
    expect(r.requiresReview).toBe(false);
  });

  it('finds documents via robots.txt → sitemap', async () => {
    const r = await engine().discover({
      exam: EXAM, cycleId: '2026',
      fetchText: makeSite({
        'https://authority.example/robots.txt': {
          body: 'Sitemap: https://authority.example/sm.xml', contentType: 'text/plain' },
        'https://authority.example/sm.xml': {
          body: '<urlset><url><loc>https://authority.example/a/SYN-Syllabus-2026.pdf</loc></url></urlset>',
          contentType: 'application/xml' },
        'https://authority.example/syllabus': { body: '<html></html>' },
        'https://authority.example': { body: '<html></html>' },
      }),
      fetchBytes: bytesFor({ 'https://authority.example/a/SYN-Syllabus-2026.pdf': PDF }),
    });
    expect(r.outcome).toBe('FOUND');
    expect(r.attempts.some((a) => a.strategy === 'ROBOTS_REFERENCE' && a.outcome === 'ENTRIES_FOUND')).toBe(true);
  });

  it('an official-domain soft-404 is rejected, not discovered', async () => {
    const r = await engine().discover({
      exam: EXAM, cycleId: '2026',
      fetchText: makeSite({
        'https://authority.example/robots.txt': { body: '', contentType: 'text/plain' },
        'https://authority.example/sitemap.xml': { body: '<urlset></urlset>', contentType: 'application/xml' },
        'https://authority.example/syllabus': {
          body: '<a href="/missing/SYN_2026_Syllabus.pdf">SYN 2026 Syllabus</a>' },
        'https://authority.example': { body: '<html></html>' },
      }),
      // The "PDF" is actually the homepage — the classic government soft-404.
      fetchBytes: bytesFor({ 'https://authority.example/missing/SYN_2026_Syllabus.pdf': HTML }),
    });
    expect(r.outcome).toBe('NO_OFFICIAL_DOCUMENT_FOUND');
    expect(r.candidates[0].reasonCodes).toContain('HTML_INSTEAD_OF_DOCUMENT');
  });

  it('an answer key naming the exam AND cycle never beats a syllabus', async () => {
    const r = await engine().discover({
      exam: EXAM, cycleId: '2026',
      fetchText: makeSite({
        'https://authority.example/robots.txt': { body: '', contentType: 'text/plain' },
        'https://authority.example/sitemap.xml': { body: '<urlset></urlset>', contentType: 'application/xml' },
        'https://authority.example/syllabus': {
          body: '<a href="/d/key.pdf">SYN 2026 Answer Key</a><a href="/d/syl.pdf">SYN 2026 Syllabus</a>' },
        'https://authority.example': { body: '<html></html>' },
      }),
      fetchBytes: bytesFor({
        'https://authority.example/d/key.pdf': PDF,
        'https://authority.example/d/syl.pdf': PDF,
      }),
    });
    expect(r.outcome).toBe('FOUND');
    expect(r.selected?.discoveredUrl).toContain('syl.pdf');
    const key = r.candidates.find((c) => c.discoveredUrl.includes('key.pdf'));
    expect(key?.status).toBe('REJECTED');
  });

  it('two indistinguishable candidates are AMBIGUOUS and require review', async () => {
    const r = await engine().discover({
      exam: EXAM, cycleId: '2026',
      fetchText: makeSite({
        'https://authority.example/robots.txt': { body: '', contentType: 'text/plain' },
        'https://authority.example/sitemap.xml': { body: '<urlset></urlset>', contentType: 'application/xml' },
        'https://authority.example/syllabus': {
          body: '<a href="/d/a.pdf">SYN 2026 Syllabus</a><a href="/d/b.pdf">SYN 2026 Syllabus</a>' },
        'https://authority.example': { body: '<html></html>' },
      }),
      fetchBytes: bytesFor({
        'https://authority.example/d/a.pdf': PDF, 'https://authority.example/d/b.pdf': PDF,
      }),
    });
    expect(r.outcome).toBe('AMBIGUOUS');
    expect(r.selected).toBeNull();
    expect(r.requiresReview).toBe(true);
  });

  it('a link to a NON-official domain is rejected even when the text looks perfect', async () => {
    const r = await engine().discover({
      exam: EXAM, cycleId: '2026',
      fetchText: makeSite({
        'https://authority.example/robots.txt': { body: '', contentType: 'text/plain' },
        'https://authority.example/sitemap.xml': { body: '<urlset></urlset>', contentType: 'application/xml' },
        'https://authority.example/syllabus': {
          body: '<a href="https://authority.example.evil.test/SYN_2026_Syllabus.pdf">SYN 2026 Syllabus</a>' +
                '<a href="https://authority.example@evil.test/x.pdf">SYN 2026 Syllabus</a>' },
        'https://authority.example': { body: '<html></html>' },
      }),
      fetchBytes: bytesFor({}),
    });
    expect(r.outcome).toBe('NO_OFFICIAL_DOCUMENT_FOUND');
    expect(r.candidates.every((c) => c.status === 'REJECTED')).toBe(true);
  });

  it('unreachable authority is SOURCE_UNAVAILABLE, not "no document exists"', async () => {
    const r = await engine().discover({
      exam: EXAM, cycleId: '2026',
      fetchText: async () => { throw new Error('ETIMEDOUT'); },
      fetchBytes: bytesFor({}),
    });
    // These are different operational facts and must never collapse into one.
    expect(r.outcome).toBe('SOURCE_UNAVAILABLE');
  });

  it('an exam with no registered provider yields NO_PROVIDER', async () => {
    const engineNoProviders = new SyllabusDiscoveryEngine(new DiscoveryProviderRegistry());
    const r = await engineNoProviders.discover({ exam: EXAM, cycleId: '2026' });
    expect(r.outcome).toBe('NO_PROVIDER');
  });

  it('every attempt is recorded for audit', async () => {
    const r = await engine().discover({
      exam: EXAM, cycleId: '2026',
      fetchText: makeSite({
        'https://authority.example/robots.txt': { body: '', contentType: 'text/plain' },
        'https://authority.example/sitemap.xml': { body: '<urlset></urlset>', contentType: 'application/xml' },
        'https://authority.example/syllabus': { body: '<html></html>' },
        'https://authority.example': { body: '<html></html>' },
      }),
      fetchBytes: bytesFor({}),
    });
    expect(r.attempts.length).toBeGreaterThan(0);
    for (const a of r.attempts) {
      expect(a).toHaveProperty('strategy');
      expect(a).toHaveProperty('outcome');
      expect(typeof a.entryCount).toBe('number');
    }
    expect(r.providerId).toBe('generic-official');
  });
});

describe('J.11 provider architecture has no exam-specific branching', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '../../src', rel), 'utf8');
  const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('no engine or provider hardcodes an examId', () => {
    for (const f of ['services/exam/discovery/syllabusDiscoveryEngine.ts',
                     'services/exam/discovery/genericOfficialDiscoveryProvider.ts',
                     'services/exam/discovery/officialDiscoveryProvider.ts',
                     'services/exam/officialFetch.ts']) {
      const s = codeOnly(read(f));
      expect(s).not.toMatch(/examId\s*===\s*['"]/);
      expect(s).not.toMatch(/SSC_CGL|UPSC|NEET|BPSC|IBPS/);
    }
  });

  it('no strategy constructs a document URL from a guessed filename', () => {
    const s = codeOnly(read('services/exam/discovery/genericOfficialDiscoveryProvider.ts'));
    // Guessed document paths are the exact defect J.4 measured returning a homepage under HTTP 200.
    expect(s).not.toMatch(/\.pdf['"`]/);
    expect(s).not.toMatch(/Notice\.pdf|Syllabus\.pdf/i);
  });

  it('providers cannot validate, store, hash or publish', () => {
    const s = codeOnly(read('services/exam/discovery/genericOfficialDiscoveryProvider.ts'));
    for (const forbidden of ['examDocumentStorageService', 'createSyllabus', 'buildSyllabusGraph',
                             'canonicalNodeId', 'createHash', 'publishSyllabusVersion',
                             'verifyOfficialSource']) {
      expect(s).not.toContain(forbidden);
    }
  });

  it('the registry resolves the first claiming provider, so specific overrides generic', () => {
    const specific: OfficialDiscoveryProvider = {
      id: 'specific', canHandle: (e) => e.examId === 'SYN_EXAM',
      discover: async () => ({ entries: [], attempts: [] }),
    };
    const reg = new DiscoveryProviderRegistry()
      .register(specific)
      .register(new GenericOfficialDiscoveryProvider());
    expect(reg.resolve(EXAM)?.id).toBe('specific');
  });

  it('duplicate provider ids are rejected', () => {
    const reg = new DiscoveryProviderRegistry().register(new GenericOfficialDiscoveryProvider());
    expect(() => reg.register(new GenericOfficialDiscoveryProvider())).toThrow(/duplicate provider id/);
  });
});
