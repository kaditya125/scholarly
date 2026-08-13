jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__ts__' } },
}));

/**
 * A minimal in-memory Firestore stand-in.
 *
 * Enough to exercise the consent rules honestly: documents, transactional get/set/update, and
 * `where` filtering for the roster queries. Deliberately not a full emulator — the properties
 * under test here are authorization decisions, not Firestore semantics.
 */
const store: Record<string, Record<string, any>> = {
  classes: {},
  classEnrollments: {},
  classInvitations: {},
};

const docApi = (col: string, id: string) => ({
  id,
  get: async () => ({
    exists: !!store[col][id],
    data: () => store[col][id],
  }),
  set: async (v: any) => { store[col][id] = { ...(store[col][id] || {}), ...v }; },
  update: async (v: any) => { store[col][id] = { ...(store[col][id] || {}), ...v }; },
});

const collectionApi = (col: string) => {
  const filters: [string, any][] = [];
  const q: any = {
    doc: (id: string) => docApi(col, id),
    where(field: string, _op: string, value: any) { filters.push([field, value]); return q; },
    limit() { return q; },
    get: async () => ({
      docs: Object.values(store[col])
        .filter((d: any) => filters.every(([f, v]) => d[f] === v))
        .map((d: any) => ({ data: () => d })),
    }),
  };
  return q;
};

const tx = {
  get: async (ref: any) => ref.get(),
  set: (ref: any, v: any) => { void ref.set(v); },
  update: (ref: any, v: any) => {
    // Firestore dotted paths — only counts.enrolled is used here.
    const flat: any = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === 'counts.enrolled') flat.counts = { enrolled: val };
      else flat[k] = val;
    }
    void ref.update(flat);
  },
};

jest.mock('../../src/config/firebase', () => ({
  auth: { getUser: jest.fn() },
  db: {
    collection: (c: string) => collectionApi(c),
    runTransaction: async (fn: any) => fn(tx),
  },
}));

/**
 * classResource.service.ts pulls in notebook.repository.ts, which imports directly from
 * 'firebase-admin/firestore' (a different module specifier than the bare 'firebase-admin' this
 * file mocks above) — loading it for real here would reach for an uninitialised Firebase app.
 * Mocked at the module boundary instead: this file tests the consent state machine, not
 * cross-service resource-sharing plumbing, which is covered in classResourceSync.test.ts.
 */
jest.mock('../../src/services/classResource.service', () => ({
  classResourceService: { syncAccessForEnrollment: jest.fn().mockResolvedValue(undefined) },
}));

import {
  ENROLLMENT_STATES,
  ENROLLMENT_TRANSITIONS,
  canTransitionEnrollment,
  grantsAccess,
  enrollmentId,
  isInvitationUsable,
  generateInvitationCode,
  EnrollmentState,
} from '../../src/types/enrollment';
import { enrollmentService } from '../../src/services/enrollment.service';
import { classResourceService } from '../../src/services/classResource.service';

const TEACHER = 'teacher-1';
const STUDENT = 'student-1';
const CLASS = 'class-1';

function seedClass(over: Record<string, any> = {}) {
  store.classes[CLASS] = {
    id: CLASS, ownerUid: TEACHER, title: 'Maths', status: 'published',
    pricing: { type: 'free', amountINR: 0, currency: 'INR' },
    capacity: null, counts: { enrolled: 0 }, syllabus: [], ...over,
  };
}
function seedInvite(over: Record<string, any> = {}) {
  store.classInvitations.CODE1 = {
    code: 'CODE1', classId: CLASS, createdBy: TEACHER, active: true,
    expiresAt: null, maxUses: null, uses: 0, ...over,
  };
}
function seedEdge(state: EnrollmentState, over: Record<string, any> = {}) {
  store.classEnrollments[enrollmentId(CLASS, STUDENT)] = {
    id: enrollmentId(CLASS, STUDENT), classId: CLASS, studentUid: STUDENT, teacherUid: TEACHER,
    state, source: 'invitation', activatedAt: null, blockedBy: null, ...over,
  };
}

beforeEach(() => {
  store.classes = {}; store.classEnrollments = {}; store.classInvitations = {};
  jest.clearAllMocks();
});

/* ── The machine ───────────────────────────────────────────────────────────────────── */

describe('enrolment state machine', () => {
  it('grants access in exactly one state', () => {
    for (const s of ENROLLMENT_STATES) expect(grantsAccess(s)).toBe(s === 'ACTIVE');
  });

  // The property that makes inviting safe.
  it('grants nothing while INVITED or REQUESTED', () => {
    expect(grantsAccess('INVITED')).toBe(false);
    expect(grantsAccess('REQUESTED')).toBe(false);
  });

  it('treats BLOCKED as terminal in both directions', () => {
    expect(ENROLLMENT_TRANSITIONS.BLOCKED).toEqual([]);
    for (const s of ENROLLMENT_STATES) expect(canTransitionEnrollment('BLOCKED', s)).toBe(false);
  });

  it('never permits a self-transition', () => {
    for (const s of ENROLLMENT_STATES) expect(canTransitionEnrollment(s, s)).toBe(false);
  });

  it('refuses undeclared transitions, exhaustively', () => {
    for (const from of ENROLLMENT_STATES) {
      for (const to of ENROLLMENT_STATES) {
        expect(canTransitionEnrollment(from, to)).toBe(ENROLLMENT_TRANSITIONS[from].includes(to));
      }
    }
  });

  it('cannot jump straight from INVITED to LEFT', () => {
    expect(canTransitionEnrollment('INVITED', 'LEFT')).toBe(false);
  });

  it('allows a declined edge to be re-invited, but never a blocked one', () => {
    expect(canTransitionEnrollment('DECLINED', 'INVITED')).toBe(true);
    expect(canTransitionEnrollment('BLOCKED', 'INVITED')).toBe(false);
  });
});

describe('invitation codes', () => {
  it('uses an unambiguous alphabet', () => {
    for (let i = 0; i < 40; i++) expect(generateInvitationCode()).not.toMatch(/[O0I1L]/);
  });

  it('rejects inactive, expired and exhausted invitations', () => {
    const base = { code: 'X', classId: CLASS, createdBy: TEACHER, uses: 0, maxUses: null, expiresAt: null, active: true, createdAt: '' } as any;
    expect(isInvitationUsable({ ...base, active: false }).ok).toBe(false);
    expect(isInvitationUsable({ ...base, expiresAt: '2000-01-01' }).ok).toBe(false);
    expect(isInvitationUsable({ ...base, maxUses: 2, uses: 2 }).ok).toBe(false);
    expect(isInvitationUsable(base).ok).toBe(true);
  });
});

/* ── Consent ───────────────────────────────────────────────────────────────────────── */

describe('accepting an invitation', () => {
  it('activates the edge and takes a seat', async () => {
    seedClass({ capacity: 2 }); seedInvite();
    const edge = await enrollmentService.acceptInvitation('CODE1', STUDENT);
    expect(edge.state).toBe('ACTIVE');
    expect(store.classes[CLASS].counts.enrolled).toBe(1);
    expect(store.classInvitations.CODE1.uses).toBe(1);
  });

  // The rule that stops the invite flow becoming a free door into paid content.
  it('refuses a paid class outright', async () => {
    seedClass({ pricing: { type: 'paid', amountINR: 2500, currency: 'INR' } }); seedInvite();
    await expect(enrollmentService.acceptInvitation('CODE1', STUDENT)).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED' });
    expect(store.classEnrollments[enrollmentId(CLASS, STUDENT)]).toBeUndefined();
  });

  it('refuses when the class is full', async () => {
    seedClass({ capacity: 1, counts: { enrolled: 1 } }); seedInvite();
    await expect(enrollmentService.acceptInvitation('CODE1', STUDENT)).rejects.toMatchObject({ code: 'CLASS_FULL' });
  });

  it('refuses a draft class', async () => {
    seedClass({ status: 'draft' }); seedInvite();
    await expect(enrollmentService.acceptInvitation('CODE1', STUDENT)).rejects.toMatchObject({ code: 'CLASS_NOT_OPEN' });
  });

  it('refuses the teacher joining their own class', async () => {
    seedClass(); seedInvite();
    await expect(enrollmentService.acceptInvitation('CODE1', TEACHER)).rejects.toMatchObject({ code: 'SELF_ENROL' });
  });

  it('refuses an expired invitation', async () => {
    seedClass(); seedInvite({ expiresAt: '2000-01-01' });
    await expect(enrollmentService.acceptInvitation('CODE1', STUDENT)).rejects.toMatchObject({ code: 'INVITATION_UNUSABLE' });
  });

  it('cannot be used to un-block someone', async () => {
    seedClass(); seedInvite(); seedEdge('BLOCKED');
    await expect(enrollmentService.acceptInvitation('CODE1', STUDENT)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('is idempotent for an already-active student', async () => {
    seedClass({ counts: { enrolled: 1 } }); seedInvite(); seedEdge('ACTIVE');
    const edge = await enrollmentService.acceptInvitation('CODE1', STUDENT);
    expect(edge.state).toBe('ACTIVE');
    expect(store.classes[CLASS].counts.enrolled).toBe(1); // no double count
  });
});

describe('who may make which move', () => {
  it('lets the teacher accept a student request', async () => {
    seedClass(); seedEdge('REQUESTED');
    const edge = await enrollmentService.transition({ classId: CLASS, studentUid: STUDENT, actorUid: TEACHER, to: 'ACTIVE' });
    expect(edge.state).toBe('ACTIVE');
  });

  // A student must not be able to approve their own request.
  it('stops a student self-approving their request', async () => {
    seedClass(); seedEdge('REQUESTED');
    await expect(
      enrollmentService.transition({ classId: CLASS, studentUid: STUDENT, actorUid: STUDENT, to: 'ACTIVE' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // …and a teacher must not accept an invitation on the student's behalf.
  it('stops a teacher accepting an invitation for the student', async () => {
    seedClass(); seedEdge('INVITED');
    await expect(
      enrollmentService.transition({ classId: CLASS, studentUid: STUDENT, actorUid: TEACHER, to: 'ACTIVE' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets the student accept their own invitation', async () => {
    seedClass(); seedEdge('INVITED');
    const edge = await enrollmentService.transition({ classId: CLASS, studentUid: STUDENT, actorUid: STUDENT, to: 'ACTIVE' });
    expect(edge.state).toBe('ACTIVE');
    expect(store.classes[CLASS].counts.enrolled).toBe(1);
  });

  it('rejects a stranger entirely', async () => {
    seedClass(); seedEdge('ACTIVE');
    await expect(
      enrollmentService.transition({ classId: CLASS, studentUid: STUDENT, actorUid: 'nosy', to: 'REMOVED' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('frees the seat when a student leaves', async () => {
    seedClass({ counts: { enrolled: 1 } }); seedEdge('ACTIVE');
    await enrollmentService.transition({ classId: CLASS, studentUid: STUDENT, actorUid: STUDENT, to: 'LEFT' });
    expect(store.classes[CLASS].counts.enrolled).toBe(0);
  });

  it('lets either party block', async () => {
    seedClass(); seedEdge('ACTIVE', {});
    const edge = await enrollmentService.transition({ classId: CLASS, studentUid: STUDENT, actorUid: STUDENT, to: 'BLOCKED' });
    expect(edge.state).toBe('BLOCKED');
    expect(edge.blockedBy).toBe(STUDENT);
  });
});

describe('reads', () => {
  it('refuses a roster to a non-owner', async () => {
    seedClass();
    await expect(enrollmentService.listRoster(CLASS, 'someone-else')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns the roster to the owner', async () => {
    seedClass(); seedEdge('ACTIVE');
    const roster = await enrollmentService.listRoster(CLASS, TEACHER);
    expect(roster).toHaveLength(1);
    expect(roster[0].studentUid).toBe(STUDENT);
  });

  it('isActiveMember is the single access predicate', async () => {
    seedClass(); seedEdge('REQUESTED');
    expect(await enrollmentService.isActiveMember(CLASS, STUDENT)).toBe(false);
    seedEdge('ACTIVE');
    expect(await enrollmentService.isActiveMember(CLASS, STUDENT)).toBe(true);
  });
});

describe('requesting to join', () => {
  it('creates a REQUESTED edge that grants nothing', async () => {
    seedClass();
    const edge = await enrollmentService.requestToJoin(CLASS, STUDENT);
    expect(edge.state).toBe('REQUESTED');
    expect(grantsAccess(edge.state)).toBe(false);
    expect(store.classes[CLASS].counts.enrolled).toBe(0);
  });

  it('refuses a draft class', async () => {
    seedClass({ status: 'draft' });
    await expect(enrollmentService.requestToJoin(CLASS, STUDENT)).rejects.toMatchObject({ code: 'CLASS_NOT_OPEN' });
  });

  it('refuses the owner', async () => {
    seedClass();
    await expect(enrollmentService.requestToJoin(CLASS, TEACHER)).rejects.toMatchObject({ code: 'SELF_ENROL' });
  });
});

/* ── Resource access follows the edge (Phase 3F) ──────────────────────────────────────
 * classResourceService is fully mocked above — these tests assert enrollment.service calls it
 * with the right (classId, studentUid, granted) whenever ACTIVE is actually gained or lost, and
 * stays silent otherwise. The sharing/revoking mechanics themselves belong to
 * classResourceSync.test.ts, not here. */

describe('resource access follows the edge', () => {
  it('grants on accepting an invitation', async () => {
    seedClass(); seedInvite();
    await enrollmentService.acceptInvitation('CODE1', STUDENT);
    expect(classResourceService.syncAccessForEnrollment).toHaveBeenCalledWith(CLASS, STUDENT, true);
  });

  it('grants when the teacher accepts a request', async () => {
    seedClass(); seedEdge('REQUESTED');
    await enrollmentService.transition({ classId: CLASS, studentUid: STUDENT, actorUid: TEACHER, to: 'ACTIVE' });
    expect(classResourceService.syncAccessForEnrollment).toHaveBeenCalledWith(CLASS, STUDENT, true);
  });

  it('revokes when a student leaves', async () => {
    seedClass({ counts: { enrolled: 1 } }); seedEdge('ACTIVE');
    await enrollmentService.transition({ classId: CLASS, studentUid: STUDENT, actorUid: STUDENT, to: 'LEFT' });
    expect(classResourceService.syncAccessForEnrollment).toHaveBeenCalledWith(CLASS, STUDENT, false);
  });

  it('revokes when a teacher removes a student', async () => {
    seedClass({ counts: { enrolled: 1 } }); seedEdge('ACTIVE');
    await enrollmentService.transition({ classId: CLASS, studentUid: STUDENT, actorUid: TEACHER, to: 'REMOVED' });
    expect(classResourceService.syncAccessForEnrollment).toHaveBeenCalledWith(CLASS, STUDENT, false);
  });

  it('does not call sync for a move that never touches ACTIVE', async () => {
    seedClass(); seedEdge('INVITED');
    await enrollmentService.transition({ classId: CLASS, studentUid: STUDENT, actorUid: STUDENT, to: 'DECLINED' });
    expect(classResourceService.syncAccessForEnrollment).not.toHaveBeenCalled();
  });

  it('still calls sync (harmlessly) when re-accepting an already-active invitation', async () => {
    // acceptInvitation's early-return for an already-ACTIVE edge happens INSIDE the
    // transaction closure — the sync call after it is unconditional either way. That is
    // deliberately fine: shareWithUser() is itself idempotent (checks `includes()` before
    // pushing), so a redundant call costs an extra round-trip and changes nothing.
    seedClass({ counts: { enrolled: 1 } }); seedInvite(); seedEdge('ACTIVE');
    await enrollmentService.acceptInvitation('CODE1', STUDENT);
    expect(classResourceService.syncAccessForEnrollment).toHaveBeenCalledWith(CLASS, STUDENT, true);
  });
});
