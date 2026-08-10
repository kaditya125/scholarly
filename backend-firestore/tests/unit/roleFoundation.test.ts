/**
 * Phase 0 + Phase 1 — security boundary tests.
 *
 * Covers the four authorization gaps closed in Phase 0 and the product-role bootstrap
 * added in Phase 1. Follows the mocking convention already used by
 * tests/unit/auth.middleware.test.ts: stub src/config/firebase so verifyIdToken,
 * getUser/setCustomUserClaims and Firestore are all controllable.
 */

const mockUserRecords: Record<string, any> = {};
const mockDocs: Record<string, any> = {};
const setCustomUserClaims = jest.fn(async (uid: string, claims: any) => {
  mockUserRecords[uid] = { ...mockUserRecords[uid], customClaims: claims };
});

jest.mock('../../src/config/firebase', () => ({
  auth: {
    verifyIdToken: jest.fn(),
    getUser: jest.fn(async (uid: string) => {
      if (!mockUserRecords[uid]) throw new Error('user not found');
      return mockUserRecords[uid];
    }),
    setCustomUserClaims: (...args: any[]) => (setCustomUserClaims as any)(...args),
  },
  db: {
    collection: (col: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: !!mockDocs[`${col}/${id}`],
          data: () => mockDocs[`${col}/${id}`],
        }),
        set: async (data: any, opts?: any) => {
          mockDocs[`${col}/${id}`] = opts?.merge
            ? { ...(mockDocs[`${col}/${id}`] || {}), ...data }
            : data;
        },
      }),
    }),
  },
  firebaseApp: {},
}));

// FieldValue.serverTimestamp() is the only firebase-admin surface the service touches.
jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__SERVER_TS__' } },
}));

import { requireProductRole, isAdmin, hasProductRole } from '../../src/middlewares/auth';
import { UserIdentityController } from '../../src/controllers/userIdentity.controller';
import { PRODUCT_ROLES, ADMIN_ROLES, isProductRole, isAdminRole } from '../../src/types/roles';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const controller = new UserIdentityController();

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockUserRecords)) delete mockUserRecords[k];
  for (const k of Object.keys(mockDocs)) delete mockDocs[k];
});

// ───────────────────────────── Role model ─────────────────────────────

describe('role model', () => {
  it('accepts only student and teacher as product roles', () => {
    expect(PRODUCT_ROLES).toEqual(['student', 'teacher']);
    expect(isProductRole('student')).toBe(true);
    expect(isProductRole('teacher')).toBe(true);
    expect(isProductRole('admin')).toBe(false);
    expect(isProductRole('')).toBe(false);
    expect(isProductRole(undefined)).toBe(false);
  });

  it('keeps every existing administrative role recognised (no admin regression)', () => {
    for (const r of ['super_admin', 'admin', 'moderator', 'content_manager', 'support', 'analytics_viewer']) {
      expect(isAdminRole(r)).toBe(true);
      // An admin role must never be usable as a product role.
      expect(isProductRole(r)).toBe(false);
    }
    expect(ADMIN_ROLES.length).toBe(6);
  });
});

// ─────────────────────── requireProductRole middleware ───────────────────────

describe('requireProductRole', () => {
  it('401s when unauthenticated', () => {
    const req: any = {};
    const res = mockRes();
    const next = jest.fn();
    requireProductRole('teacher')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a matching product role', () => {
    const req: any = { user: { uid: 'u1', productRole: 'teacher' } };
    const res = mockRes();
    const next = jest.fn();
    requireProductRole('teacher')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('DENIES a student reaching a teacher-only route', () => {
    const req: any = { user: { uid: 'u1', productRole: 'student' } };
    const res = mockRes();
    const next = jest.fn();
    requireProductRole('teacher')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('DENIES a role supplied in the request body (body is not identity)', () => {
    const req: any = { user: { uid: 'u1' }, body: { role: 'teacher' } };
    const res = mockRes();
    const next = jest.fn();
    requireProductRole('teacher')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets an administrator through without a product role', () => {
    const req: any = { user: { uid: 'admin1', role: 'super_admin' } };
    const res = mockRes();
    const next = jest.fn();
    requireProductRole('teacher')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('claim helpers read the verified token only', () => {
  it('isAdmin recognises admin claims and ignores product roles', () => {
    expect(isAdmin({ user: { uid: 'a', role: 'admin' } } as any)).toBe(true);
    expect(isAdmin({ user: { uid: 'a', productRole: 'teacher' } } as any)).toBe(false);
    expect(isAdmin({} as any)).toBe(false);
  });

  it('hasProductRole ignores a body-supplied role', () => {
    expect(hasProductRole({ user: { uid: 'a', productRole: 'student' } } as any, 'student')).toBe(true);
    expect(hasProductRole({ user: { uid: 'a' }, body: { role: 'student' } } as any, 'student')).toBe(false);
  });
});

// ───────────────────────────── Bootstrap ─────────────────────────────

describe('POST /users/bootstrap', () => {
  it('401s when unauthenticated', async () => {
    const res = mockRes();
    await controller.bootstrap({ body: { role: 'student' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('assigns student to an account with no product role', async () => {
    mockUserRecords['u1'] = { uid: 'u1', email: 'a@b.c', displayName: 'A', customClaims: {} };
    const res = mockRes();
    await controller.bootstrap({ user: { uid: 'u1' }, body: { role: 'student' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(setCustomUserClaims).toHaveBeenCalledWith('u1', { productRole: 'student' });
    expect(mockDocs['users/u1'].role).toBe('student');
    expect(mockDocs['users/u1'].organizationId).toBeNull();
    expect(res.json.mock.calls[0][0].requiresTokenRefresh).toBe(true);
  });

  it('assigns teacher to an account with no product role', async () => {
    mockUserRecords['u2'] = { uid: 'u2', email: 't@b.c', customClaims: {} };
    const res = mockRes();
    await controller.bootstrap({ user: { uid: 'u2' }, body: { role: 'teacher' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockDocs['users/u2'].role).toBe('teacher');
  });

  it('DENIES a student self-escalating to teacher (409, claim unchanged)', async () => {
    mockUserRecords['u3'] = { uid: 'u3', customClaims: { productRole: 'student' } };
    const res = mockRes();
    await controller.bootstrap({ user: { uid: 'u3' }, body: { role: 'teacher' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(setCustomUserClaims).not.toHaveBeenCalled();
    expect(mockUserRecords['u3'].customClaims.productRole).toBe('student');
  });

  it('DENIES a teacher switching to student', async () => {
    mockUserRecords['u4'] = { uid: 'u4', customClaims: { productRole: 'teacher' } };
    const res = mockRes();
    await controller.bootstrap({ user: { uid: 'u4' }, body: { role: 'student' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('is idempotent when the same role is requested twice', async () => {
    mockUserRecords['u5'] = { uid: 'u5', customClaims: { productRole: 'student' } };
    const res = mockRes();
    await controller.bootstrap({ user: { uid: 'u5' }, body: { role: 'student' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].assigned).toBe(false);
    expect(setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('REJECTS administrative roles through the public endpoint', async () => {
    for (const role of ADMIN_ROLES) {
      mockUserRecords['u6'] = { uid: 'u6', customClaims: {} };
      const res = mockRes();
      await controller.bootstrap({ user: { uid: 'u6' }, body: { role } } as any, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(setCustomUserClaims).not.toHaveBeenCalled();
    }
  });

  it('rejects an unknown role', async () => {
    mockUserRecords['u7'] = { uid: 'u7', customClaims: {} };
    const res = mockRes();
    await controller.bootstrap({ user: { uid: 'u7' }, body: { role: 'wizard' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('rejects a missing role', async () => {
    mockUserRecords['u8'] = { uid: 'u8', customClaims: {} };
    const res = mockRes();
    await controller.bootstrap({ user: { uid: 'u8' }, body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('PRESERVES an existing admin claim when a product role is added', async () => {
    mockUserRecords['adm'] = { uid: 'adm', customClaims: { role: 'super_admin' } };
    const res = mockRes();
    await controller.bootstrap({ user: { uid: 'adm' }, body: { role: 'teacher' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(201);
    // The admin role must survive — this is the core admin-regression guarantee.
    expect(setCustomUserClaims).toHaveBeenCalledWith('adm', {
      role: 'super_admin',
      productRole: 'teacher',
    });
  });

  it('ignores any uid supplied in the body and uses the token uid', async () => {
    mockUserRecords['victim'] = { uid: 'victim', customClaims: {} };
    mockUserRecords['attacker'] = { uid: 'attacker', customClaims: {} };
    const res = mockRes();
    await controller.bootstrap(
      { user: { uid: 'attacker' }, body: { role: 'teacher', uid: 'victim', userId: 'victim' } } as any,
      res
    );

    expect(setCustomUserClaims).toHaveBeenCalledWith('attacker', { productRole: 'teacher' });
    expect(mockDocs['users/victim']).toBeUndefined();
    expect(mockDocs['users/attacker']).toBeDefined();
  });
});

describe('GET /users/me', () => {
  it('401s when unauthenticated', async () => {
    const res = mockRes();
    await controller.me({} as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('reports exists:false for a pre-Phase-1 account rather than erroring', async () => {
    const res = mockRes();
    await controller.me({ user: { uid: 'legacy' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ exists: false, role: null });
  });

  it('returns only the caller’s own profile (no user identifier is accepted)', async () => {
    mockDocs['users/self'] = { uid: 'self', role: 'student' };
    mockDocs['users/other'] = { uid: 'other', role: 'teacher' };
    const res = mockRes();
    await controller.me({ user: { uid: 'self' }, query: { userId: 'other' } } as any, res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ exists: true, uid: 'self' });
  });
});
