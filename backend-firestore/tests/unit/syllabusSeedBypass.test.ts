/**
 * J.7.0 — the canonical syllabus seed bypass.
 *
 * THE DEFECT THESE LOCK OUT. Production deliberately quarantined SSC CGL: the syllabus record was
 * marked INVALID (LEGACY_SEED_UNVERIFIED) and both active pointers were cleared. Firestore
 * therefore held no CURRENT syllabus for SSC_CGL/2026. But `getCurrentSyllabus()` fell back to
 * `CANONICAL_EXAM_SEEDS[examId].syllabus` — an in-code object declaring `status: 'CURRENT'` with
 * `sourceDocumentHash` = SHA-256("") and a source URL proven to be a soft-404. The database said
 * "no current syllabus" and the application said "here it is".
 *
 * A second path could have made it permanent: `getExam()` → `seedExamIfMissing()` →
 * `createSyllabus(seed.syllabus)`, where `createSyllabus` was an unconditional `.set()`. One
 * missing exam document and the quarantined INVALID record would have been overwritten with a
 * fabricated CURRENT one — no error, no audit entry, no way to tell afterwards.
 *
 * The rule being enforced: absence of a verified syllabus is a first-class answer. The platform
 * must prefer "no verified syllabus available" over "a plausible syllabus we cannot prove".
 */
import fs from 'fs';
import path from 'path';
import { ExamMasterService } from '../../src/services/exam/examMaster.service';
import { OfficialSourceVerificationService } from '../../src/services/exam/officialSourceVerification.service';
import { ExamRepository } from '../../src/repositories/exam.repository';
import { CANONICAL_EXAM_SEEDS } from '../../src/services/exam/canonicalExamSeeds';
import { canTransition, EMPTY_SHA256 } from '../../src/services/exam/syllabusLifecycle';
import { ExamMaster, ExamCycle, ExamSyllabus, SyllabusStatus } from '../../src/types/exam.types';

const SRC = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '../../src', rel), 'utf8');

/** Strips comments so a rule is never "proved" by prose that merely describes it. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SSC_EXAM: ExamMaster = {
  examId: 'SSC_CGL', name: 'Staff Selection Commission — Combined Graduate Level',
  shortName: 'SSC CGL', conductingAuthority: 'Staff Selection Commission',
  category: 'SSC', country: 'IN', aliases: ['SSC CGL'], officialDomains: ['ssc.gov.in'],
  currentCycle: '2026', verifiedOfficialUrls: { authorityHome: 'https://ssc.gov.in' },
  status: 'ACTIVE', createdAt: 1, updatedAt: 1,
};

/** Mirrors the production quarantined record, empty-string hash and all. */
const quarantined = (status: SyllabusStatus = 'INVALID'): ExamSyllabus => ({
  syllabusId: 'syl_ssc_cgl_2026_v1', examId: 'SSC_CGL', cycleId: '2026', version: '2026-v1',
  authority: 'Staff Selection Commission', status,
  sourceDocumentUrl: 'https://ssc.gov.in/files/portal/latest/CGL_2026_Notice.pdf',
  sourceDocumentHash: EMPTY_SHA256,
  invalidationReason: 'LEGACY_SEED_UNVERIFIED' as any,
  extractedAt: 1, stages: [], createdAt: 1, updatedAt: 1,
});

describe('J.7.0 — runtime resolver never substitutes a seed', () => {
  let svc: ExamMasterService;
  let repo: jest.Mocked<ExamRepository>;
  let examsDb: Map<string, ExamMaster>;
  let cyclesDb: Map<string, ExamCycle>;
  let syllabiDb: Map<string, ExamSyllabus>;
  let writes: string[];

  beforeEach(() => {
    examsDb = new Map([['SSC_CGL', SSC_EXAM]]);
    cyclesDb = new Map();
    syllabiDb = new Map();
    writes = [];

    const write = (name: string) => (...args: any[]) => { writes.push(name); return undefined as any; };

    repo = {
      getExamById: jest.fn(async (id: string) => examsDb.get(id) || null),
      listExams: jest.fn(async () => Array.from(examsDb.values())),
      findExamByAlias: jest.fn(async () => null),
      listCycles: jest.fn(async (examId: string) =>
        Array.from(cyclesDb.values()).filter((c) => c.examId === examId)),
      getCycle: jest.fn(async () => null),
      listOfficialSources: jest.fn(async () => []),
      getSyllabusById: jest.fn(async (id: string) => syllabiDb.get(id) || null),
      getCurrentSyllabus: jest.fn(async (examId: string, cycleId: string) => {
        for (const s of syllabiDb.values()) {
          if (s.examId === examId && s.cycleId === cycleId && s.status === 'CURRENT') return s;
        }
        return null;
      }),
      listSyllabi: jest.fn(async (examId: string, cycleId?: string) =>
        Array.from(syllabiDb.values())
          .filter((s) => s.examId === examId && (!cycleId || s.cycleId === cycleId))),
      // Every mutating method is recorded so a "read-only" claim is measured, not asserted.
      createExam: jest.fn(async (e: ExamMaster) => { writes.push('createExam'); examsDb.set(e.examId, e); }),
      createCycle: jest.fn(async (c: ExamCycle) => { writes.push('createCycle'); cyclesDb.set(c.cycleId, c); }),
      createOfficialSource: jest.fn(async () => { writes.push('createOfficialSource'); }),
      createSyllabus: jest.fn(async (s: ExamSyllabus) => { writes.push('createSyllabus'); syllabiDb.set(s.syllabusId, s); }),
      publishSyllabusVersion: jest.fn(async () => { writes.push('publishSyllabusVersion'); }),
      updateSyllabusStatus: jest.fn(async () => { writes.push('updateSyllabusStatus'); return { previousStatus: 'DRAFT' as SyllabusStatus }; }),
      invalidateSyllabus: jest.fn(write('invalidateSyllabus')),
      updateExam: jest.fn(write('updateExam')),
      updateCycle: jest.fn(write('updateCycle')),
      logAudit: jest.fn(async () => {}),
    } as any;

    svc = new ExamMasterService(repo, new OfficialSourceVerificationService());
  });

  // ── 1–4, 20: what the resolver returns for each repository state ──────────────────────────

  it('1. a real CURRENT record is returned', async () => {
    const current = { ...quarantined('CURRENT'), syllabusId: 'syl_real_v2',
                      sourceDocumentHash: 'a'.repeat(64) };
    syllabiDb.set(current.syllabusId, current);
    const r = await svc.getCurrentSyllabus('SSC_CGL', '2026');
    expect(r?.syllabusId).toBe('syl_real_v2');
  });

  it('2. no CURRENT record → NO_CANONICAL_SYLLABUS (null)', async () => {
    expect(await svc.getCurrentSyllabus('SSC_CGL', '2026')).toBeNull();
  });

  it('3. only an INVALID record exists → null, and the seed is NOT substituted', async () => {
    syllabiDb.set('syl_ssc_cgl_2026_v1', quarantined('INVALID'));
    expect(await svc.getCurrentSyllabus('SSC_CGL', '2026')).toBeNull();
  });

  it('4. only a SUPERSEDED record exists → null', async () => {
    syllabiDb.set('syl_ssc_cgl_2026_v1', quarantined('SUPERSEDED'));
    expect(await svc.getCurrentSyllabus('SSC_CGL', '2026')).toBeNull();
  });

  it('20. no repository state produces a non-null syllabus without a CURRENT record', async () => {
    for (const s of ['DRAFT', 'DISCOVERED', 'FETCHED', 'VALIDATING', 'VERIFIED',
                     'INVALID', 'UNAVAILABLE', 'SUPERSEDED', 'ARCHIVED'] as SyllabusStatus[]) {
      syllabiDb.clear();
      syllabiDb.set('syl_ssc_cgl_2026_v1', quarantined(s));
      expect(await svc.getCurrentSyllabus('SSC_CGL', '2026')).toBeNull();
    }
  });

  // ── 5: unavailable is not absent ──────────────────────────────────────────────────────────

  it('5. a repository failure propagates as UNAVAILABLE — never null, never a seed', async () => {
    repo.getCurrentSyllabus.mockRejectedValueOnce(new Error('DEADLINE_EXCEEDED'));
    // "We could not ask" must not degrade into "the answer is no".
    await expect(svc.getCurrentSyllabus('SSC_CGL', '2026')).rejects.toThrow('DEADLINE_EXCEEDED');
  });

  it('5b. listSyllabi also propagates failure rather than returning a seeded list', async () => {
    repo.listSyllabi.mockRejectedValueOnce(new Error('UNAVAILABLE'));
    await expect(svc.listSyllabi('SSC_CGL', '2026')).rejects.toThrow('UNAVAILABLE');
  });

  // ── 6, 10, 11: the seed specifically ──────────────────────────────────────────────────────

  it('6. SSC_CGL IS a seeded exam, and the resolver still returns NO_CANONICAL_SYLLABUS', async () => {
    // Guards the premise: if this key ever disappears the test above would pass vacuously.
    expect(CANONICAL_EXAM_SEEDS.SSC_CGL).toBeDefined();
    expect(await svc.getCurrentSyllabus('SSC_CGL', '2026')).toBeNull();
    expect(await svc.listSyllabi('SSC_CGL', '2026')).toEqual([]);
  });

  it('10. with both active pointers cleared, the application agrees with Firestore', async () => {
    examsDb.set('SSC_CGL', { ...SSC_EXAM, activeSyllabusVersionId: undefined });
    cyclesDb.set('2026', { cycleId: '2026', examId: 'SSC_CGL', label: '', year: '2026',
                           status: 'ACTIVE', activeSyllabusVersionId: undefined,
                           createdAt: 1, updatedAt: 1 });
    syllabiDb.set('syl_ssc_cgl_2026_v1', quarantined('INVALID'));
    expect(await svc.getCurrentSyllabus('SSC_CGL', '2026')).toBeNull();
  });

  it('11. no seed carries a syllabus at all — the fallback has no data to return', () => {
    for (const [examId, seed] of Object.entries(CANONICAL_EXAM_SEEDS)) {
      expect(Object.keys(seed)).not.toContain('syllabus');
      expect((seed as any).syllabus).toBeUndefined();
      // A seeded pointer would advertise a version the seed cannot supply.
      expect({ examId, ptr: seed.exam.activeSyllabusVersionId })
        .toEqual({ examId, ptr: undefined });
      expect({ examId, ptr: seed.cycle?.activeSyllabusVersionId })
        .toEqual({ examId, ptr: undefined });
    }
  });

  it('11b. no seed object anywhere in the map carries the empty-document hash as a syllabus hash', () => {
    const asText = JSON.stringify(Object.values(CANONICAL_EXAM_SEEDS).map((s) => s.exam));
    expect(asText).not.toContain(EMPTY_SHA256);
  });

  // ── 7, 8, 9: the write path ───────────────────────────────────────────────────────────────

  it('7. a missing exam is seeded as metadata only — never a syllabus', async () => {
    examsDb.delete('SSC_CGL');
    const exam = await svc.getExam('SSC_CGL');
    expect(exam?.examId).toBe('SSC_CGL');
    await new Promise((r) => setImmediate(r)); // the seed is fire-and-forget
    expect(writes).not.toContain('createSyllabus');
    expect(writes).not.toContain('publishSyllabusVersion');
    expect(syllabiDb.size).toBe(0);
  });

  it('7b. after seeding a missing exam, the resolver still reports NO_CANONICAL_SYLLABUS', async () => {
    examsDb.delete('SSC_CGL');
    expect(await svc.getCurrentSyllabus('SSC_CGL', '2026')).toBeNull();
  });

  it('8. an existing INVALID record survives a missing-exam seed untouched', async () => {
    const before = quarantined('INVALID');
    syllabiDb.set(before.syllabusId, before);
    examsDb.delete('SSC_CGL');

    await svc.getExam('SSC_CGL');
    await new Promise((r) => setImmediate(r));

    // 14: byte-identical, including the invalidation history.
    expect(syllabiDb.get('syl_ssc_cgl_2026_v1')).toEqual(before);
    expect(syllabiDb.get('syl_ssc_cgl_2026_v1')!.status).toBe('INVALID');
    expect(syllabiDb.get('syl_ssc_cgl_2026_v1')!.invalidationReason).toBe('LEGACY_SEED_UNVERIFIED');
  });

  it('9. a missing active pointer does not trigger any fallback', async () => {
    examsDb.set('SSC_CGL', { ...SSC_EXAM, activeSyllabusVersionId: undefined });
    expect(await svc.getCurrentSyllabus('SSC_CGL')).toBeNull();
    expect(writes).toEqual([]);
  });

  // ── 15–19: what resolution is, and is not, allowed to do ──────────────────────────────────

  it('18. resolving mutates nothing', async () => {
    syllabiDb.set('syl_ssc_cgl_2026_v1', quarantined('INVALID'));
    await svc.getCurrentSyllabus('SSC_CGL', '2026');
    await svc.listSyllabi('SSC_CGL', '2026');
    expect(writes).toEqual([]);
  });

  it('19. repeated calls are deterministic', async () => {
    syllabiDb.set('syl_ssc_cgl_2026_v1', quarantined('INVALID'));
    const runs = await Promise.all(
      Array.from({ length: 5 }, () => svc.getCurrentSyllabus('SSC_CGL', '2026')),
    );
    expect(runs.every((r) => r === null)).toBe(true);
  });

  it('15/16/17. the resolver performs no LLM call, no generation and no outbound request', () => {
    // Source-level: these would be invisible to a mocked-repository test, because the call would
    // sit inside the service rather than behind the repo boundary.
    const src = codeOnly(SRC('services/exam/examMaster.service.ts'));
    const body = src.slice(src.indexOf('async getCurrentSyllabus'));
    const resolver = body.slice(0, body.indexOf('async listSyllabi'));
    for (const forbidden of ['axios', 'fetch(', 'generateResponse', 'Gemini', 'llm', 'buildCanonicalGraph']) {
      expect(resolver).not.toContain(forbidden);
    }
  });
});

// ── 11/12/13: CURRENT is reachable only through publication ─────────────────────────────────

describe('J.7.0 — CURRENT cannot be reached by any shortcut', () => {
  it('12. SUPERSEDED is terminal and cannot be reactivated', () => {
    for (const to of ['CURRENT', 'VERIFIED', 'FETCHED', 'DRAFT'] as SyllabusStatus[]) {
      expect(canTransition('SUPERSEDED', to).allowed).toBe(false);
    }
  });

  it('13. only VERIFIED may become CURRENT', () => {
    const reachable = (['DRAFT', 'DISCOVERED', 'FETCHED', 'VALIDATING', 'VERIFIED',
                        'INVALID', 'UNAVAILABLE', 'SUPERSEDED', 'ARCHIVED'] as SyllabusStatus[])
      .filter((s) => canTransition(s, 'CURRENT').allowed);
    expect(reachable).toEqual(['VERIFIED']);
  });

  it('13b. a plain status write cannot reach CURRENT — it is excluded at the type level', () => {
    const repoSrc = codeOnly(SRC('repositories/exam.repository.ts'));
    expect(repoSrc).toContain(`next: Exclude<SyllabusStatus, 'CURRENT'>`);
  });

  it('11c. the quarantined record cannot be published even if someone tries', () => {
    expect(canTransition('INVALID', 'CURRENT').allowed).toBe(false);
  });
});

// ── Structural proof: the removed fallback is unreachable, not merely unused ────────────────

describe('J.7.0 — the seed fallback is structurally gone', () => {
  const examMasterSrc = codeOnly(SRC('services/exam/examMaster.service.ts'));

  it('getCurrentSyllabus and listSyllabi contain no reference to any seed', () => {
    const from = examMasterSrc.indexOf('async getCurrentSyllabus');
    const to = examMasterSrc.indexOf('\n}', examMasterSrc.indexOf('async listSyllabi'));
    const region = examMasterSrc.slice(from, to);
    expect(region).not.toContain('CANONICAL_EXAM_SEEDS');
    expect(region).not.toContain('seed');
  });

  it('seedExamIfMissing never creates or publishes a syllabus', () => {
    const from = examMasterSrc.indexOf('private async seedExamIfMissing');
    const region = examMasterSrc.slice(from, examMasterSrc.indexOf('async updateExam', from));
    expect(region).not.toContain('createSyllabus');
    expect(region).not.toContain('publishSyllabusVersion');
  });

  it('the seed module exports no syllabus data whatsoever', () => {
    const seedSrc = codeOnly(SRC('services/exam/canonicalExamSeeds.ts'));
    expect(seedSrc).not.toContain('syllabus:');
    expect(seedSrc).not.toContain('ExamSyllabus');
    expect(seedSrc).not.toContain('activeSyllabusVersionId');
  });

  it('the pilot seed no longer creates or publishes a syllabus either', () => {
    const pilotSrc = codeOnly(SRC('seed/examSeeds.ts'));
    const from = pilotSrc.indexOf('export async function seedPilotExams');
    expect(from).toBeGreaterThan(-1);
    const region = pilotSrc.slice(from);
    expect(region).not.toContain('createSyllabus');
    expect(region).not.toContain('publishSyllabusVersion');
  });

  it('createSyllabus uses create() semantics, never an overwriting set()', () => {
    const repoSrc = codeOnly(SRC('repositories/exam.repository.ts'));
    const from = repoSrc.indexOf('async createSyllabus');
    const region = repoSrc.slice(from, repoSrc.indexOf('async getSyllabusById', from));
    expect(region).toContain('.create(syllabus)');
    expect(region).not.toContain('.set(syllabus)');
  });
});
