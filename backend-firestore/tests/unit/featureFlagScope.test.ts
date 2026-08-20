/**
 * FeatureFlagService scope resolution.
 *
 * THE BUG: every branch ended in `else { result = flag.enabled }`. A user-scoped flag with
 * enabled:true and targetUserIds:['a'] therefore returned TRUE for user 'b' as well — targeting
 * was decorative, and a "limited to a test cohort" rollout would have silently shipped to
 * everyone. Fixed generically, independent of mastery; ENABLE_MASTERY is deliberately NOT routed
 * through this service.
 */
const mockGet = jest.fn();
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: mockGet }) }) }),
}));
jest.mock('../../src/core/di/container', () => ({
  container: { resolve: () => ({ get: mockCacheGet, set: mockCacheSet }) },
  TOKENS: { CacheProvider: Symbol('CacheProvider') },
}));

import { FeatureFlagService } from '../../src/services/featureFlag.service';

const flagDoc = (over: any) => ({
  exists: true,
  data: () => ({ name: 'F', enabled: true, description: '', updatedAt: 0, updatedBy: 't', ...over }),
});

let svc: FeatureFlagService;
beforeEach(() => {
  jest.clearAllMocks();
  mockCacheGet.mockResolvedValue(null);   // always a cache miss, so every case hits resolution
  mockCacheSet.mockResolvedValue(undefined);
  svc = new FeatureFlagService();
});

describe('global scope', () => {
  it('enabled applies to everyone, with or without a userId', async () => {
    mockGet.mockResolvedValue(flagDoc({ scope: 'global', enabled: true }));
    await expect(svc.isEnabled('F', 'anyone')).resolves.toBe(true);
    await expect(svc.isEnabled('F')).resolves.toBe(true);
  });

  it('disabled applies to everyone', async () => {
    mockGet.mockResolvedValue(flagDoc({ scope: 'global', enabled: false }));
    await expect(svc.isEnabled('F', 'anyone')).resolves.toBe(false);
  });
});

describe('user scope', () => {
  it('a targeted user gets the feature', async () => {
    mockGet.mockResolvedValue(flagDoc({ scope: 'user', enabled: true, targetUserIds: ['alice'] }));
    await expect(svc.isEnabled('F', 'alice')).resolves.toBe(true);
  });

  it('THE REGRESSION: a non-targeted user does NOT fall through to the global value', async () => {
    mockGet.mockResolvedValue(flagDoc({ scope: 'user', enabled: true, targetUserIds: ['alice'] }));
    await expect(svc.isEnabled('F', 'bob')).resolves.toBe(false);
  });

  it('no userId means not targeted, so false', async () => {
    mockGet.mockResolvedValue(flagDoc({ scope: 'user', enabled: true, targetUserIds: ['alice'] }));
    await expect(svc.isEnabled('F')).resolves.toBe(false);
  });

  it('an empty target list enables it for nobody', async () => {
    mockGet.mockResolvedValue(flagDoc({ scope: 'user', enabled: true, targetUserIds: [] }));
    await expect(svc.isEnabled('F', 'alice')).resolves.toBe(false);
  });

  it('a missing target list enables it for nobody', async () => {
    mockGet.mockResolvedValue(flagDoc({ scope: 'user', enabled: true }));
    await expect(svc.isEnabled('F', 'alice')).resolves.toBe(false);
  });

  it('targeting cannot override a disabled flag', async () => {
    mockGet.mockResolvedValue(flagDoc({ scope: 'user', enabled: false, targetUserIds: ['alice'] }));
    await expect(svc.isEnabled('F', 'alice')).resolves.toBe(false);
  });
});

describe('beta scope', () => {
  it('restricts to the beta list exactly as user scope does', async () => {
    mockGet.mockResolvedValue(flagDoc({ scope: 'beta', enabled: true, targetUserIds: ['tester'] }));
    await expect(svc.isEnabled('F', 'tester')).resolves.toBe(true);
    await expect(svc.isEnabled('F', 'outsider')).resolves.toBe(false);
    await expect(svc.isEnabled('F')).resolves.toBe(false);
  });
});

describe('fails closed', () => {
  it('an unknown flag is disabled', async () => {
    mockGet.mockResolvedValue({ exists: false });
    await expect(svc.isEnabled('nope', 'alice')).resolves.toBe(false);
  });

  it('a Firestore error is disabled, never enabled', async () => {
    mockGet.mockRejectedValue(new Error('firestore down'));
    await expect(svc.isEnabled('F', 'alice')).resolves.toBe(false);
  });

  it('an unrecognised scope does not widen access', async () => {
    mockGet.mockResolvedValue(flagDoc({ scope: 'cohort' as any, enabled: true, targetUserIds: ['alice'] }));
    await expect(svc.isEnabled('F', 'alice')).resolves.toBe(false);
  });
});
