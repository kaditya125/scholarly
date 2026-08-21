/**
 * J.7.0 — `createSyllabus` must refuse to overwrite an existing version.
 *
 * Separated from the rest of the J.7.0 suite because it mocks the Firestore module itself: the
 * behaviour under test IS the write primitive, so a mocked repository would assert nothing. No
 * network and no credentials are involved — `config/firebase` never loads.
 *
 * The failure this prevents is silent, which is what makes it dangerous: `.set()` would have
 * replaced production's quarantined `syl_ssc_cgl_2026_v1` (INVALID, LEGACY_SEED_UNVERIFIED) with a
 * fabricated CURRENT record and reported success. Nothing downstream could have detected it — the
 * invalidation history it overwrote was the only record that the quarantine ever happened.
 */

const store = new Map<string, any>();
const created: string[] = [];

class AlreadyExists extends Error {
  code = 6; // Firestore ALREADY_EXISTS
  constructor(id: string) { super(`Document already exists: ${id}`); }
}

const docRef = (id: string) => ({
  id,
  create: jest.fn(async (data: any) => {
    if (store.has(id)) throw new AlreadyExists(id);
    store.set(id, data);
    created.push(id);
  }),
  set: jest.fn(async () => { throw new Error('set() must not be used to create a syllabus'); }),
  get: jest.fn(async () => ({ exists: store.has(id), data: () => store.get(id) })),
});

jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn((id: string) => docRef(id)),
      where: jest.fn(() => ({ where: jest.fn(), limit: jest.fn(), get: jest.fn() })),
    })),
    runTransaction: jest.fn(),
    settings: jest.fn(),
  },
  auth: {},
  firebaseApp: {},
}));

import { ExamRepository } from '../../src/repositories/exam.repository';
import { EMPTY_SHA256 } from '../../src/services/exam/syllabusLifecycle';
import { ExamSyllabus, SyllabusStatus } from '../../src/types/exam.types';

const syllabus = (status: SyllabusStatus, extra: Partial<ExamSyllabus> = {}): ExamSyllabus => ({
  syllabusId: 'syl_ssc_cgl_2026_v1', examId: 'SSC_CGL', cycleId: '2026', version: '2026-v1',
  authority: 'Staff Selection Commission', status,
  sourceDocumentUrl: 'https://ssc.gov.in/x.pdf', sourceDocumentHash: EMPTY_SHA256,
  extractedAt: 1, stages: [], createdAt: 1, updatedAt: 1, ...extra,
});

describe('J.7.0 — a syllabus version is immutable once created', () => {
  let repo: ExamRepository;

  beforeEach(() => {
    store.clear();
    created.length = 0;
    repo = new ExamRepository();
  });

  it('creates a version that does not exist yet', async () => {
    await repo.createSyllabus(syllabus('FETCHED'));
    expect(created).toEqual(['syl_ssc_cgl_2026_v1']);
    expect(store.get('syl_ssc_cgl_2026_v1').status).toBe('FETCHED');
  });

  it('8. refuses to overwrite an existing INVALID (quarantined) record', async () => {
    const quarantined = syllabus('INVALID', {
      invalidationReason: 'LEGACY_SEED_UNVERIFIED' as any, invalidatedAt: 123,
    });
    store.set(quarantined.syllabusId, quarantined);

    // Exactly the call the seed path used to make.
    await expect(repo.createSyllabus(syllabus('CURRENT'))).rejects.toThrow(/refusing to overwrite/i);

    // 14: the quarantine survives byte-identical.
    expect(store.get('syl_ssc_cgl_2026_v1')).toEqual(quarantined);
    expect(store.get('syl_ssc_cgl_2026_v1').status).toBe('INVALID');
  });

  it('refuses to overwrite a CURRENT record with an unverified object', async () => {
    store.set('syl_ssc_cgl_2026_v1', syllabus('CURRENT', { sourceDocumentHash: 'a'.repeat(64) }));
    await expect(repo.createSyllabus(syllabus('DRAFT'))).rejects.toThrow(/refusing to overwrite/i);
    expect(store.get('syl_ssc_cgl_2026_v1').sourceDocumentHash).toBe('a'.repeat(64));
  });

  it('refuses to overwrite SUPERSEDED history that evidence may still point at', async () => {
    store.set('syl_ssc_cgl_2026_v1', syllabus('SUPERSEDED'));
    await expect(repo.createSyllabus(syllabus('VERIFIED'))).rejects.toThrow(/refusing to overwrite/i);
    expect(store.get('syl_ssc_cgl_2026_v1').status).toBe('SUPERSEDED');
  });

  it('the refusal names the version, so the caller can tell WHAT it tried to clobber', async () => {
    store.set('syl_ssc_cgl_2026_v1', syllabus('INVALID'));
    await expect(repo.createSyllabus(syllabus('CURRENT')))
      .rejects.toThrow(/syl_ssc_cgl_2026_v1/);
  });

  it('a non-ALREADY_EXISTS failure is NOT relabelled as an overwrite attempt', async () => {
    // Misreporting an outage as "this already exists" would send the caller down the wrong path.
    const boom = new Error('DEADLINE_EXCEEDED');
    (repo as any).syllabiCol = {
      doc: () => ({ create: async () => { throw boom; } }),
    };
    await expect(repo.createSyllabus(syllabus('FETCHED'))).rejects.toThrow('DEADLINE_EXCEEDED');
  });
});
