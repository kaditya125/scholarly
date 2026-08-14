// The service module pulls in config/firebase at import time, so stub it before importing.
jest.mock('../../src/config/firebase', () => ({
  auth: { getUser: jest.fn() },
  db: { collection: jest.fn(), batch: jest.fn(), runTransaction: jest.fn() },
}));

jest.mock('../../src/services/teacherProfile.service', () => ({
  teacherProfileService: {
    transitionStatus: jest.fn(),
    getVerificationHistory: jest.fn(),
    getReviewQueue: jest.fn(),
    get: jest.fn(),
  },
}));

import {
  TEACHER_STATUSES,
  TEACHER_STATUS_TRANSITIONS,
  canTransition,
  isTeacherStatus,
  isVerifiedStatus,
  normalizeTeacherStatus,
  TeacherStatus,
} from '../../src/types/teacher';
import { teacherVerificationController } from '../../src/admin/controllers/teacher-verification.controller';
import { teacherProfileService } from '../../src/services/teacherProfile.service';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

/* ── The state machine ─────────────────────────────────────────────────────────────── */

describe('teacher verification state machine', () => {
  it('defines exactly the six specified states', () => {
    expect([...TEACHER_STATUSES].sort()).toEqual(
      ['approved', 'draft', 'pending', 'rejected', 'suspended', 'under_review'].sort(),
    );
  });

  it.each([
    ['draft', 'pending'],
    ['pending', 'under_review'],
    ['under_review', 'approved'],
    ['under_review', 'rejected'],
    ['approved', 'suspended'],
    ['suspended', 'under_review'],
  ] as [TeacherStatus, TeacherStatus][])('permits %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  // The headline security property: no admin request can skip review.
  it('refuses to jump straight to approved', () => {
    expect(canTransition('draft', 'approved')).toBe(false);
    expect(canTransition('pending', 'approved')).toBe(false);
    expect(canTransition('rejected', 'approved')).toBe(false);
    expect(canTransition('suspended', 'approved')).toBe(false);
  });

  it('treats rejected as terminal', () => {
    expect(TEACHER_STATUS_TRANSITIONS.rejected).toEqual([]);
  });

  it('never permits a self-transition', () => {
    for (const s of TEACHER_STATUSES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });

  it('rejects every transition that is not explicitly declared', () => {
    for (const from of TEACHER_STATUSES) {
      for (const to of TEACHER_STATUSES) {
        const declared = TEACHER_STATUS_TRANSITIONS[from].includes(to);
        expect(canTransition(from, to)).toBe(declared);
      }
    }
  });
});

/* ── Status coercion ───────────────────────────────────────────────────────────────── */

describe('normalizeTeacherStatus', () => {
  it('maps the legacy "active" value forward to approved', () => {
    expect(normalizeTeacherStatus('active')).toBe('approved');
  });

  it('passes current-model values through unchanged', () => {
    for (const s of TEACHER_STATUSES) {
      expect(normalizeTeacherStatus(s)).toBe(s);
    }
  });

  // An unreadable status must never resolve to a privileged one.
  it.each([undefined, null, '', 'bogus', 42, {}, []])(
    'falls back to the least-privileged state for %p',
    (input) => {
      expect(normalizeTeacherStatus(input)).toBe('draft');
    },
  );
});

describe('isVerifiedStatus', () => {
  it('is true only for approved', () => {
    for (const s of TEACHER_STATUSES) {
      expect(isVerifiedStatus(s)).toBe(s === 'approved');
    }
  });

  it('does not treat the legacy value as verified without normalisation', () => {
    expect(isTeacherStatus('active')).toBe(false);
  });
});

/* ── Admin controller ──────────────────────────────────────────────────────────────── */

describe('POST /admin/teacher/:uid/status', () => {
  const actor = { uid: 'admin-1', role: 'admin' };
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unknown status with 400 and does not touch the service', async () => {
    const req: any = { user: actor, params: { uid: 't-1' }, body: { status: 'verified' } };
    const res = mockRes();
    await teacherVerificationController.setStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(teacherProfileService.transitionStatus).not.toHaveBeenCalled();
  });

  it('refuses an admin reviewing their own teacher account', async () => {
    const req: any = { user: actor, params: { uid: actor.uid }, body: { status: 'under_review' } };
    const res = mockRes();
    await teacherVerificationController.setStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(teacherProfileService.transitionStatus).not.toHaveBeenCalled();
  });

  it('rejects a non-string reason', async () => {
    const req: any = { user: actor, params: { uid: 't-1' }, body: { status: 'under_review', reason: { x: 1 } } };
    const res = mockRes();
    await teacherVerificationController.setStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(teacherProfileService.transitionStatus).not.toHaveBeenCalled();
  });

  it('passes the actor through to the service and returns 200', async () => {
    (teacherProfileService.transitionStatus as jest.Mock).mockResolvedValue({
      previousState: 'pending',
      newState: 'under_review',
    });
    const req: any = { user: actor, params: { uid: 't-1' }, body: { status: 'under_review', reason: 'looks ok' } };
    const res = mockRes();
    await teacherVerificationController.setStatus(req, res);

    expect(teacherProfileService.transitionStatus).toHaveBeenCalledWith({
      teacherUid: 't-1',
      to: 'under_review',
      actorUid: 'admin-1',
      actorRole: 'admin',
      reason: 'looks ok',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('maps an invalid transition to 409', async () => {
    (teacherProfileService.transitionStatus as jest.Mock).mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'INVALID_TRANSITION', from: 'draft', to: 'approved' }),
    );
    const req: any = { user: actor, params: { uid: 't-1' }, body: { status: 'approved' } };
    const res = mockRes();
    await teacherVerificationController.setStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('maps a missing profile to 404', async () => {
    (teacherProfileService.transitionStatus as jest.Mock).mockRejectedValue(
      Object.assign(new Error('gone'), { code: 'NOT_FOUND' }),
    );
    const req: any = { user: actor, params: { uid: 'nobody' }, body: { status: 'under_review' } };
    const res = mockRes();
    await teacherVerificationController.setStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 401 when the request carries no actor', async () => {
    const req: any = { params: { uid: 't-1' }, body: { status: 'under_review' } };
    const res = mockRes();
    await teacherVerificationController.setStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

/* ── Review queue ──────────────────────────────────────────────────────────────────── */

describe('GET /admin/teacher/queue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the queue with a count', async () => {
    const rows = [{ uid: 't-1', teacherStatus: 'pending' }, { uid: 't-2', teacherStatus: 'under_review' }];
    (teacherProfileService.getReviewQueue as jest.Mock).mockResolvedValue(rows);
    const req: any = {};
    const res = mockRes();
    await teacherVerificationController.listQueue(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ queue: rows, count: 2 });
  });

  it('maps a service failure to 500 rather than throwing', async () => {
    (teacherProfileService.getReviewQueue as jest.Mock).mockRejectedValue(new Error('firestore down'));
    const req: any = {};
    const res = mockRes();
    await teacherVerificationController.listQueue(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
