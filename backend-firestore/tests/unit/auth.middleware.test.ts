// Mock the Firebase config module that auth.ts imports, so we can control verifyIdToken.
jest.mock('../../src/config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: {},
}));

import { requireAuth, enforceSelf, requireCronSecret } from '../../src/middlewares/auth';
import { auth } from '../../src/config/firebase';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireAuth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no token is provided', async () => {
    const req: any = { headers: {} };
    const res = mockRes();
    const next = jest.fn();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches req.user and calls next on a valid token', async () => {
    (auth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'user-1' });
    const req: any = { headers: { authorization: 'Bearer valid' } };
    const res = mockRes();
    const next = jest.fn();
    await requireAuth(req, res, next);
    expect(req.user).toEqual({ uid: 'user-1' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 on an invalid token', async () => {
    (auth.verifyIdToken as jest.Mock).mockRejectedValue(new Error('invalid'));
    const req: any = { headers: { authorization: 'Bearer bad' } };
    const res = mockRes();
    const next = jest.fn();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('enforceSelf', () => {
  it('returns 403 when the path userId differs from the authenticated uid', () => {
    const req: any = { user: { uid: 'user-1' }, params: { userId: 'user-2' } };
    const res = mockRes();
    const next = jest.fn();
    enforceSelf('userId')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when the path userId matches the authenticated uid', () => {
    const req: any = { user: { uid: 'user-1' }, params: { userId: 'user-1' } };
    const res = mockRes();
    const next = jest.fn();
    enforceSelf('userId')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', () => {
    const req: any = { params: { userId: 'user-1' } };
    const res = mockRes();
    const next = jest.fn();
    enforceSelf('userId')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('requireCronSecret', () => {
  it('allows the request when CRON_SECRET is not configured (backward compatible)', () => {
    const req: any = { headers: {} };
    const res = mockRes();
    const next = jest.fn();
    requireCronSecret(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
