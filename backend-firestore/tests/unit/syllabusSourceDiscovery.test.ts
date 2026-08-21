/**
 * J.6 — official source discovery.
 *
 * Discovery locates candidates; it never ingests or publishes. These lock the three ways a bad
 * candidate could reach J.5: a URL that only LOOKS official, a payload that is not a document, and
 * an official document that is simply about something else.
 */
import {
  SyllabusSourceDiscoveryService, type RawDiscoveryEntry, type DocumentCandidate,
} from '../../src/services/exam/syllabusSourceDiscovery.service';
import type { ExamMaster } from '../../src/types/exam.types';

const svc = new SyllabusSourceDiscoveryService();
const exam = {
  examId: 'SSC_CGL', name: 'Combined Graduate Level', shortName: 'SSC CGL',
  conductingAuthority: 'Staff Selection Commission',
  officialDomains: ['ssc.gov.in', 'ssc.nic.in'], aliases: ['CGL'],
} as unknown as ExamMaster;

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4096, 0x20)]);
const html = Buffer.from('<!doctype html><html><head><title>Home</title></head>'.padEnd(9000, ' '));

const evaluate = (entry: RawDiscoveryEntry, bytes: Buffer | null = pdf, contentType = 'application/pdf') =>
  svc.evaluateCandidate({
    entry, exam, cycleId: '2026', discoveryMethod: 'OFFICIAL_API', probeDocument: bytes !== null,
    fetchBytes: bytes ? async () => ({ buffer: bytes, contentType }) : undefined,
  });

describe('URL shape attacks — an official-looking URL is not an official URL', () => {
  const hostile: Array<[string, string]> = [
    ['userinfo', 'https://ssc.gov.in@evil.example/syllabus.pdf'],
    ['suffix subdomain', 'https://ssc.gov.in.evil.example/syllabus.pdf'],
    ['prefix lookalike', 'https://evil-ssc.gov.in/syllabus.pdf'],
    ['open redirect param', 'https://evil.example/r?to=https://ssc.gov.in/syllabus.pdf'],
    ['unparseable', 'not a url at all'],
  ];

  for (const [name, url] of hostile) {
    it(`rejects ${name}`, async () => {
      const c = await evaluate({ url, title: 'SSC CGL 2026 Syllabus', documentType: 'SYLLABUS' });
      expect(c.status).toBe('REJECTED');
      expect(c.officialDomainVerified).toBe(false);
    });
  }

  it('accepts the genuine official host', async () => {
    const c = await evaluate({
      url: 'https://ssc.gov.in/api/attachment/CGL_2026_Syllabus.pdf',
      title: 'SSC CGL 2026 Syllabus', documentType: 'SYLLABUS',
    });
    expect(c.officialDomainVerified).toBe(true);
    expect(c.status).toBe('VERIFIED_CANDIDATE');
  });

  it('accepts a registered subdomain but not a lookalike of it', async () => {
    const sub = await evaluate({ url: 'https://regional.ssc.gov.in/CGL_2026_Syllabus.pdf',
                                 title: 'SSC CGL 2026 Syllabus', documentType: 'SYLLABUS' });
    expect(sub.officialDomainVerified).toBe(true);
  });
});

describe('document validation is reused, not reimplemented', () => {
  const entry = { url: 'https://ssc.gov.in/x/CGL_2026_Syllabus.pdf',
                  title: 'SSC CGL 2026 Syllabus', documentType: 'SYLLABUS' as const };

  it('THE REGRESSION: an official-domain soft-404 is rejected, not discovered', async () => {
    const c = await evaluate(entry, html, 'text/html');
    expect(c.status).toBe('REJECTED');
    expect(c.reasonCodes).toContain('HTML_INSTEAD_OF_DOCUMENT');
  });

  it('rejects an empty payload', async () => {
    const c = await evaluate(entry, Buffer.alloc(0));
    expect(c.status).toBe('REJECTED');
    expect(c.reasonCodes).toContain('EMPTY_RESPONSE');
  });

  it('rejects non-PDF bytes claiming to be a PDF', async () => {
    const c = await evaluate(entry, Buffer.concat([Buffer.from([0x89, 0x50]), Buffer.alloc(5000)]));
    expect(c.status).toBe('REJECTED');
    expect(c.reasonCodes).toContain('NOT_A_PDF');
  });

  it('a fetch failure is UNAVAILABLE, not REJECTED — nothing was judged', async () => {
    const c = await svc.evaluateCandidate({
      entry, exam, cycleId: '2026', discoveryMethod: 'OFFICIAL_API', probeDocument: true,
      fetchBytes: async () => { throw new Error('ECONNREFUSED'); },
    });
    expect(c.status).toBe('UNAVAILABLE');
  });
});

describe('relevance — an official document is not automatically a syllabus', () => {
  const rel = (title: string, documentType?: any) =>
    svc.assessRelevance({ url: 'https://ssc.gov.in/d.pdf', title, documentType }, exam, '2026');

  it('accepts a genuine syllabus for this exam', () => {
    expect(rel('SSC CGL 2026 Syllabus', 'SYLLABUS').verdict).toBe('RELEVANT');
  });

  it('THE TRAP: rejects an answer key that mentions the exam AND the cycle', () => {
    // Scores well on every naive signal — exam name, year, official domain.
    const r = rel('SSC CGL 2026 Answer Key');
    expect(r.verdict).toBe('NOT_RELEVANT');
    expect(r.signals[0]).toMatch(/EXCLUDED_DOCUMENT_TYPE/);
  });

  for (const t of ['SSC CGL 2026 Result', 'SSC CGL 2026 Admit Card', 'SSC CGL Cut Off 2026',
                   'Examination Calendar 2026', 'Press Release regarding CGL']) {
    it(`rejects "${t}"`, () => expect(rel(t).verdict).toBe('NOT_RELEVANT'));
  }

  it('a syllabus for a DIFFERENT exam is only AMBIGUOUS, never relevant', () => {
    expect(rel('SSC CHSL 2026 Syllabus').verdict).toBe('AMBIGUOUS');
  });

  it('an exam-named document with no syllabus signal is AMBIGUOUS', () => {
    expect(rel('SSC CGL 2026 Notice').verdict).toBe('AMBIGUOUS');
  });

  it('an unrelated document is NOT_RELEVANT', () => {
    expect(rel('Office order regarding holidays').verdict).toBe('NOT_RELEVANT');
  });
});

describe('selection is deterministic and refuses to guess', () => {
  const cand = (over: Partial<DocumentCandidate>): DocumentCandidate => ({
    examId: 'SSC_CGL', discoveredUrl: 'https://ssc.gov.in/a.pdf', discoveredAt: 0,
    discoveryMethod: 'OFFICIAL_API', officialDomainVerified: true,
    status: 'VERIFIED_CANDIDATE', reasonCodes: [],
    relevance: { verdict: 'RELEVANT', signals: ['TITLE_MENTIONS_SYLLABUS', 'EXAM_NAME_MATCH:ssc cgl'] },
    ...over,
  });

  it('prefers the declared SYLLABUS type with a cycle match', () => {
    const r = svc.select([
      cand({ discoveredUrl: 'https://ssc.gov.in/generic.pdf' }),
      cand({ discoveredUrl: 'https://ssc.gov.in/exact.pdf', documentType: 'SYLLABUS',
             relevance: { verdict: 'RELEVANT', signals: ['DECLARED_TYPE_SYLLABUS', 'CYCLE_MATCH:2026', 'EXAM_NAME_MATCH:ssc cgl'] } }),
    ], '2026');
    expect(r.outcome).toBe('CANDIDATE_SELECTED');
    expect(r.selected!.discoveredUrl).toBe('https://ssc.gov.in/exact.pdf');
  });

  it('THE RULE: two indistinguishable candidates yield AMBIGUOUS, not the first one', () => {
    const r = svc.select([
      cand({ discoveredUrl: 'https://ssc.gov.in/one.pdf' }),
      cand({ discoveredUrl: 'https://ssc.gov.in/two.pdf' }),
    ], '2026');
    expect(r.outcome).toBe('AMBIGUOUS');
    expect(r.selected).toBeNull();
  });

  it('reports NO_OFFICIAL_DOCUMENT_FOUND rather than inventing one', () => {
    const r = svc.select([cand({ status: 'REJECTED' })], '2026');
    expect(r.outcome).toBe('NO_OFFICIAL_DOCUMENT_FOUND');
    expect(r.selected).toBeNull();
  });

  it('unconfirmed candidates surface as AMBIGUOUS, never as nothing-found', () => {
    // Discovery failure and "this exam has no syllabus" are different facts.
    const r = svc.select([cand({ status: 'AMBIGUOUS' })], '2026');
    expect(r.outcome).toBe('AMBIGUOUS');
  });

  it('selection explains itself', () => {
    const r = svc.select([cand({ documentType: 'SYLLABUS' }), cand({ discoveredUrl: 'https://ssc.gov.in/b.pdf' })], '2026');
    expect(r.rationale.join(' ')).toMatch(/selected on signals/);
  });
});

describe('idempotency', () => {
  const c = (url: string, status: any = 'VERIFIED_CANDIDATE'): DocumentCandidate => ({
    examId: 'SSC_CGL', discoveredUrl: url, discoveredAt: 0, discoveryMethod: 'OFFICIAL_API',
    officialDomainVerified: true, status, reasonCodes: [],
  });

  it('the same URL discovered twice yields one candidate', () => {
    expect(svc.dedupe([c('https://ssc.gov.in/a.pdf'), c('https://ssc.gov.in/a.pdf')])).toHaveLength(2 - 1);
  });

  it('keeps the more-resolved judgement when a URL repeats', () => {
    const out = svc.dedupe([c('https://ssc.gov.in/a.pdf', 'DISCOVERED'), c('https://ssc.gov.in/a.pdf')]);
    expect(out[0].status).toBe('VERIFIED_CANDIDATE');
  });

  it('does NOT merge different documents that merely look similar', () => {
    // Official endpoints routinely identify the file through a query parameter.
    const out = svc.dedupe([
      c('https://ssc.gov.in/get?doc=cgl_syllabus'),
      c('https://ssc.gov.in/get?doc=chsl_syllabus'),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('discovery never publishes', () => {
  it('exposes no ingest/publish capability', () => {
    for (const m of ['ingest', 'publish', 'createSyllabus', 'buildSyllabusGraph']) {
      expect((svc as any)[m]).toBeUndefined();
    }
  });

  it('does not import the orchestrator or the repository', () => {
    const fs = require('fs'); const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/exam/syllabusSourceDiscovery.service.ts'), 'utf8');
    expect(src).not.toMatch(/syllabusIngestionOrchestrator|examRepository|buildSyllabusGraph/);
  });
});
