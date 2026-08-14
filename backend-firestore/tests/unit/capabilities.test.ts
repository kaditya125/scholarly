jest.mock('../../src/config/firebase', () => ({
  auth: { getUser: jest.fn() },
  db: { collection: jest.fn(), batch: jest.fn(), runTransaction: jest.fn() },
}));

jest.mock('../../src/services/teacherProfile.service', () => ({
  teacherProfileService: { get: jest.fn() },
}));

import {
  CAPABILITIES,
  APPROVAL_GATED,
  deriveCapabilities,
  hasCapability,
  Capability,
} from '../../src/types/capabilities';
import { TEACHER_STATUSES, TeacherStatus } from '../../src/types/teacher';
import { PRODUCT_ROLE_CLAIM } from '../../src/types/roles';
import { requireCapability, loadCapabilities } from '../../src/middlewares/capability';
import { teacherProfileService } from '../../src/services/teacherProfile.service';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const teacherReq = (uid = 't-1') => ({ user: { uid, [PRODUCT_ROLE_CLAIM]: 'teacher' } } as any);
const studentReq = (uid = 's-1') => ({ user: { uid, [PRODUCT_ROLE_CLAIM]: 'student' } } as any);

/* ── Derivation ────────────────────────────────────────────────────────────────────── */

describe('deriveCapabilities', () => {
  it('always returns every declared capability key', () => {
    const set = deriveCapabilities({ productRole: null, teacherStatus: null });
    expect(Object.keys(set).sort()).toEqual([...CAPABILITIES].sort());
  });

  it('never withdraws AI access, in any state', () => {
    for (const status of [...TEACHER_STATUSES, null] as (TeacherStatus | null)[]) {
      for (const role of ['student', 'teacher', null] as any[]) {
        expect(deriveCapabilities({ productRole: role, teacherStatus: status }).useAI).toBe(true);
      }
    }
  });

  // A student must never obtain a teaching capability, whatever else is true of them.
  it('denies every approval-gated capability to students', () => {
    for (const status of [...TEACHER_STATUSES, null] as (TeacherStatus | null)[]) {
      const set = deriveCapabilities({ productRole: 'student', teacherStatus: status });
      for (const cap of APPROVAL_GATED) expect(set[cap]).toBe(false);
      expect(set.editTeacherProfile).toBe(false);
    }
  });

  it('denies approval-gated capabilities to a role-less account', () => {
    const set = deriveCapabilities({ productRole: null, teacherStatus: null });
    for (const cap of APPROVAL_GATED) expect(set[cap]).toBe(false);
  });

  it('grants approval-gated capabilities only when the teacher is approved', () => {
    for (const status of TEACHER_STATUSES) {
      const set = deriveCapabilities({ productRole: 'teacher', teacherStatus: status });
      for (const cap of APPROVAL_GATED) {
        expect(set[cap]).toBe(status === 'approved');
      }
    }
  });

  it('treats draft, pending and under_review as equally unapproved', () => {
    const sets = (['draft', 'pending', 'under_review'] as TeacherStatus[]).map((s) =>
      deriveCapabilities({ productRole: 'teacher', teacherStatus: s }),
    );
    for (const set of sets) {
      expect(set.createClass).toBe(false);
      expect(set.earn).toBe(false);
      // ...but onboarding must remain possible.
      expect(set.editTeacherProfile).toBe(true);
      expect(set.createPrivateContent).toBe(true);
    }
  });

  // Suspension is a pause, not an eviction: writes stop, learning does not.
  it('makes a suspended teacher read-only while keeping AI access', () => {
    const set = deriveCapabilities({ productRole: 'teacher', teacherStatus: 'suspended' });
    expect(set.useAI).toBe(true);
    expect(set.editTeacherProfile).toBe(false);
    expect(set.createPrivateContent).toBe(false);
    expect(set.connectPeers).toBe(false);
    expect(set.createClass).toBe(false);
    expect(set.earn).toBe(false);
  });

  it('leaves a rejected teacher with full learner access but no teaching powers', () => {
    const set = deriveCapabilities({ productRole: 'teacher', teacherStatus: 'rejected' });
    expect(set.useAI).toBe(true);
    expect(set.createPrivateContent).toBe(true);
    expect(set.connectPeers).toBe(true);
    for (const cap of APPROVAL_GATED) expect(set[cap]).toBe(false);
  });

  it('lets a teacher with no profile yet start onboarding but nothing more', () => {
    const set = deriveCapabilities({ productRole: 'teacher', teacherStatus: null });
    expect(set.editTeacherProfile).toBe(true);
    expect(set.createClass).toBe(false);
  });

  it('hasCapability agrees with the full set', () => {
    const input = { productRole: 'teacher' as const, teacherStatus: 'approved' as TeacherStatus };
    const set = deriveCapabilities(input);
    for (const cap of CAPABILITIES) {
      expect(hasCapability(input, cap)).toBe(set[cap as Capability]);
    }
  });
});

/* ── Middleware ────────────────────────────────────────────────────────────────────── */

describe('requireCapability', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without an authenticated caller', async () => {
    const res = mockRes();
    const next = jest.fn();
    await requireCapability('createClass')({} as any, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows an approved teacher through', async () => {
    (teacherProfileService.get as jest.Mock).mockResolvedValue({ teacherStatus: 'approved' });
    const res = mockRes();
    const next = jest.fn();
    await requireCapability('createClass')(teacherReq(), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks a pending teacher from creating a class, and says why', async () => {
    (teacherProfileService.get as jest.Mock).mockResolvedValue({ teacherStatus: 'pending' });
    const res = mockRes();
    const next = jest.fn();
    await requireCapability('createClass')(teacherReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ capability: 'createClass', teacherStatus: 'pending' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks a suspended teacher from editing their profile', async () => {
    (teacherProfileService.get as jest.Mock).mockResolvedValue({ teacherStatus: 'suspended' });
    const res = mockRes();
    const next = jest.fn();
    await requireCapability('editTeacherProfile')(teacherReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('normalises the legacy "active" status to approved', async () => {
    (teacherProfileService.get as jest.Mock).mockResolvedValue({ teacherStatus: 'active' });
    const res = mockRes();
    const next = jest.fn();
    await requireCapability('createClass')(teacherReq(), res, next);
    expect(next).toHaveBeenCalled();
  });

  it('never reads the teacher profile for a student', async () => {
    const res = mockRes();
    const next = jest.fn();
    await requireCapability('createClass')(studentReq(), res, next);
    expect(teacherProfileService.get).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  // A lookup failure must deny, not fall through.
  it('fails closed when the status lookup throws', async () => {
    (teacherProfileService.get as jest.Mock).mockRejectedValue(new Error('firestore down'));
    const res = mockRes();
    const next = jest.fn();
    await requireCapability('createClass')(teacherReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('memoises so repeated checks on one request read the profile once', async () => {
    (teacherProfileService.get as jest.Mock).mockResolvedValue({ teacherStatus: 'approved' });
    const req = teacherReq();
    const res = mockRes();

    await requireCapability('createClass')(req, res, jest.fn());
    const again = await loadCapabilities(req);

    expect(again.createClass).toBe(true);
    expect(teacherProfileService.get).toHaveBeenCalledTimes(1);
  });
});
