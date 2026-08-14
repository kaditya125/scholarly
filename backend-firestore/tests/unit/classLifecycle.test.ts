jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__ts__' } },
}));

const mockTx = { get: jest.fn(), update: jest.fn() };
jest.mock('../../src/config/firebase', () => ({
  auth: { getUser: jest.fn() },
  db: {
    collection: jest.fn(),
    runTransaction: jest.fn((fn: any) => fn(mockTx)),
  },
}));

jest.mock('../../src/services/enrollment.service', () => ({
  enrollmentService: { isActiveMember: jest.fn().mockResolvedValue(false) },
}));

jest.mock('../../src/repositories/class.repository', () => ({
  classRepository: {
    ref: jest.fn(() => ({ id: 'c-1' })),
    newId: jest.fn(() => 'c-new'),
    create: jest.fn(),
    getById: jest.fn(),
    listByOwner: jest.fn(),
    update: jest.fn(),
  },
}));

import {
  CLASS_STATUSES,
  CLASS_TRANSITIONS,
  canTransitionClass,
  isDiscoverable,
  validateForPublish,
  ClassStatus,
} from '../../src/types/class';
import { classService } from '../../src/services/class.service';
import { classRepository } from '../../src/repositories/class.repository';
import { classController } from '../../src/controllers/class.controller';
import { enrollmentService } from '../../src/services/enrollment.service';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const OWNER = 'teacher-1';
const baseClass = (over: Record<string, any> = {}) => ({
  id: 'c-1',
  ownerUid: OWNER,
  title: 'Class 10 Maths',
  subject: 'Mathematics',
  description: null,
  syllabus: [],
  startDate: null,
  endDate: null,
  schedule: null,
  mode: 'online',
  capacity: null,
  pricing: { type: 'free', amountINR: 0, currency: 'INR' },
  status: 'draft' as ClassStatus,
  counts: { enrolled: 0 },
  publishedAt: null,
  ...over,
});

/* ── Lifecycle ─────────────────────────────────────────────────────────────────────── */

describe('class lifecycle', () => {
  it.each([
    ['draft', 'published'],
    ['draft', 'archived'],
    ['published', 'active'],
    ['published', 'archived'],
    ['active', 'completed'],
    ['active', 'archived'],
    ['completed', 'archived'],
  ] as [ClassStatus, ClassStatus][])('permits %s → %s', (from, to) => {
    expect(canTransitionClass(from, to)).toBe(true);
  });

  it('treats archived as terminal', () => {
    expect(CLASS_TRANSITIONS.archived).toEqual([]);
  });

  it('never permits a self-transition', () => {
    for (const s of CLASS_STATUSES) expect(canTransitionClass(s, s)).toBe(false);
  });

  it('refuses undeclared jumps, exhaustively', () => {
    for (const from of CLASS_STATUSES) {
      for (const to of CLASS_STATUSES) {
        expect(canTransitionClass(from, to)).toBe(CLASS_TRANSITIONS[from].includes(to));
      }
    }
  });

  it('cannot go backwards from published to draft', () => {
    expect(canTransitionClass('published', 'draft')).toBe(false);
  });

  it('exposes only published and active to non-owners', () => {
    for (const s of CLASS_STATUSES) {
      expect(isDiscoverable(s)).toBe(s === 'published' || s === 'active');
    }
  });
});

/* ── Publish validation ────────────────────────────────────────────────────────────── */

describe('validateForPublish', () => {
  it('accepts a complete free class', () => {
    expect(validateForPublish(baseClass() as any)).toEqual([]);
  });

  it('reports every problem at once rather than the first', () => {
    const problems = validateForPublish(
      baseClass({ title: '', subject: '', pricing: { type: 'paid', amountINR: 0, currency: 'INR' } }) as any,
    );
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects a paid class with no price', () => {
    const problems = validateForPublish(baseClass({ pricing: { type: 'paid', amountINR: 0, currency: 'INR' } }) as any);
    expect(problems.join(' ')).toMatch(/price above zero/i);
  });

  it('rejects a free class carrying a price', () => {
    const problems = validateForPublish(baseClass({ pricing: { type: 'free', amountINR: 500, currency: 'INR' } }) as any);
    expect(problems.join(' ')).toMatch(/free class cannot carry a price/i);
  });

  it('rejects an end date before the start date', () => {
    const problems = validateForPublish(baseClass({ startDate: '2026-09-01', endDate: '2026-08-01' }) as any);
    expect(problems.join(' ')).toMatch(/end date/i);
  });
});

/* ── Service: ownership and immutability ───────────────────────────────────────────── */

describe('classService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (require('../../src/config/firebase').db.runTransaction as jest.Mock).mockImplementation((fn: any) => fn(mockTx));
  });

  it('always creates a draft, never a published class', async () => {
    await classService.create(OWNER, { title: 'X', status: 'published' } as any);
    const written = (classRepository.create as jest.Mock).mock.calls[0][0];
    expect(written.status).toBe('draft');
    expect(written.ownerUid).toBe(OWNER);
  });

  it('ignores a client-supplied ownerUid', async () => {
    await classService.create(OWNER, { title: 'X', ownerUid: 'someone-else' } as any);
    const written = (classRepository.create as jest.Mock).mock.calls[0][0];
    expect(written.ownerUid).toBe(OWNER);
  });

  it('normalises a free class to zero price', async () => {
    await classService.create(OWNER, { title: 'X', pricing: { type: 'free', amountINR: 900 } });
    const written = (classRepository.create as jest.Mock).mock.calls[0][0];
    expect(written.pricing).toEqual({ type: 'free', amountINR: 0, currency: 'INR' });
  });

  it("refuses to update another teacher's class", async () => {
    (classRepository.getById as jest.Mock).mockResolvedValue(baseClass({ ownerUid: 'other' }));
    await expect(classService.update('c-1', OWNER, { title: 'Hijack' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(classRepository.update).not.toHaveBeenCalled();
  });

  it('never writes status through the update path', async () => {
    (classRepository.getById as jest.Mock).mockResolvedValue(baseClass());
    await classService.update('c-1', OWNER, { title: 'New', status: 'published' } as any);
    const patch = (classRepository.update as jest.Mock).mock.calls[0][1];
    expect(patch).not.toHaveProperty('status');
    expect(patch.title).toBe('New');
  });

  it('allows a pricing change while the class is a draft', async () => {
    (classRepository.getById as jest.Mock).mockResolvedValue(baseClass({ status: 'draft' }));
    await classService.update('c-1', OWNER, { pricing: { type: 'paid', amountINR: 2500 } });
    const patch = (classRepository.update as jest.Mock).mock.calls[0][1];
    expect(patch.pricing).toEqual({ type: 'paid', amountINR: 2500, currency: 'INR' });
  });

  // The bait-and-switch guard: a price a student may already have seen must not move.
  it('refuses a pricing change once the class is published', async () => {
    (classRepository.getById as jest.Mock).mockResolvedValue(baseClass({ status: 'published' }));
    await expect(
      classService.update('c-1', OWNER, { pricing: { type: 'paid', amountINR: 1 } }),
    ).rejects.toMatchObject({ code: 'PRICING_LOCKED' });
    expect(classRepository.update).not.toHaveBeenCalled();
  });

  it('treats an archived class as read-only', async () => {
    (classRepository.getById as jest.Mock).mockResolvedValue(baseClass({ status: 'archived' }));
    await expect(classService.update('c-1', OWNER, { title: 'x' })).rejects.toMatchObject({ code: 'READ_ONLY' });
  });

  it('hides another teacher’s draft behind 404, not 403', async () => {
    (classRepository.getById as jest.Mock).mockResolvedValue(baseClass({ ownerUid: 'other', status: 'draft' }));
    await expect(classService.getForViewer('c-1', 'viewer')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('shows a published class to a non-owner', async () => {
    (classRepository.getById as jest.Mock).mockResolvedValue(baseClass({ ownerUid: 'other', status: 'published' }));
    await expect(classService.getForViewer('c-1', 'viewer')).resolves.toMatchObject({ status: 'published' });
  });

  it('shows the owner their own draft', async () => {
    (classRepository.getById as jest.Mock).mockResolvedValue(baseClass({ status: 'draft' }));
    await expect(classService.getForViewer('c-1', OWNER)).resolves.toMatchObject({ status: 'draft' });
  });

  // Phase 3E: an accepted edge must outlive the teaching period, or a completed class would
  // vanish from the view of the students who took it.
  it('still shows a completed class to an enrolled student', async () => {
    (classRepository.getById as jest.Mock).mockResolvedValue(baseClass({ ownerUid: 'other', status: 'completed' }));
    (enrollmentService.isActiveMember as jest.Mock).mockResolvedValueOnce(true);
    await expect(classService.getForViewer('c-1', 'student-1')).resolves.toMatchObject({ status: 'completed' });
  });

  it('hides a completed class from someone who was never enrolled', async () => {
    (classRepository.getById as jest.Mock).mockResolvedValue(baseClass({ ownerUid: 'other', status: 'completed' }));
    (enrollmentService.isActiveMember as jest.Mock).mockResolvedValueOnce(false);
    await expect(classService.getForViewer('c-1', 'stranger')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('blocks publishing an incomplete class', async () => {
    mockTx.get.mockResolvedValue({ exists: true, data: () => baseClass({ title: '', subject: '' }) });
    await expect(classService.transition('c-1', OWNER, 'published')).rejects.toMatchObject({ code: 'NOT_PUBLISHABLE' });
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it('publishes a complete class and stamps publishedAt', async () => {
    mockTx.get.mockResolvedValue({ exists: true, data: () => baseClass() });
    const out = await classService.transition('c-1', OWNER, 'published');
    expect(out.status).toBe('published');
    expect(mockTx.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'published', publishedAt: '__ts__' }));
  });

  it("refuses to transition another teacher's class", async () => {
    mockTx.get.mockResolvedValue({ exists: true, data: () => baseClass({ ownerUid: 'other' }) });
    await expect(classService.transition('c-1', OWNER, 'published')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it('refuses an undeclared transition', async () => {
    mockTx.get.mockResolvedValue({ exists: true, data: () => baseClass({ status: 'archived' }) });
    await expect(classService.transition('c-1', OWNER, 'published')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

/* ── Controller mapping ────────────────────────────────────────────────────────────── */

describe('ClassController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a status change sent to the update endpoint', async () => {
    const res = mockRes();
    await classController.update({ user: { uid: OWNER }, params: { id: 'c-1' }, body: { status: 'published' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects an unknown status', async () => {
    const res = mockRes();
    await classController.setStatus({ user: { uid: OWNER }, params: { id: 'c-1' }, body: { status: 'live' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 without an authenticated caller', async () => {
    const res = mockRes();
    await classController.create({ body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a non-object body', async () => {
    const res = mockRes();
    await classController.create({ user: { uid: OWNER }, body: [] } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
