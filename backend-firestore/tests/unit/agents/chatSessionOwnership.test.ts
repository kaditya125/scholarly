/**
 * Security fix: a chat session id from the request body must never let one account read or write
 * another account's conversation.
 */
const mockDocs = new Map<string, any>();
const mockSet = jest.fn(async () => undefined);

jest.mock('../../../src/config/firebase', () => ({
  db: {
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({ exists: mockDocs.has(id), id, data: () => mockDocs.get(id) }),
        set: (...args: any[]) => (mockSet as any)(id, ...args),
        collection: () => ({}),
      }),
    }),
  },
}));

jest.mock('../../../src/services/usage.service', () => ({
  usageService: { consumeQuota: jest.fn(async () => ({ allowed: true })) },
}));
jest.mock('../../../src/services/entitlement.service', () => ({
  entitlementService: { getUserPlan: jest.fn(async () => ({ plan: 'free' })) },
  PLAN_LIMITS: { free: { maxDocumentSizeMB: 10 }, pro: { maxDocumentSizeMB: 50 } },
}));
jest.mock('../../../src/services/fileParser.service', () => ({ FileParserService: { extractText: jest.fn() } }));
jest.mock('../../../src/core/workflow/WorkflowEngine', () => ({ workflowEngine: { executeStream: jest.fn() } }));

import { ChatRepository, SessionAccessError, isForeignSession } from '../../../src/repositories/chat.repository';
import { ChatService } from '../../../src/services/chat.service';
import { ChatController } from '../../../src/controllers/chat.controller';
import { usageService } from '../../../src/services/usage.service';

function mockRes() {
  const res: any = { headersSent: false, writableEnded: false, writableFinished: false };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  res.flushHeaders = jest.fn(() => {
    res.headersSent = true;
  });
  res.write = jest.fn();
  res.end = jest.fn();
  res.on = jest.fn();
  return res;
}

beforeEach(() => {
  mockDocs.clear();
  jest.clearAllMocks();
});

describe('isForeignSession', () => {
  it('is foreign only when a different owner is recorded', () => {
    expect(isForeignSession({ userId: 'b' }, 'a')).toBe(true);
    expect(isForeignSession({ userId: 'a' }, 'a')).toBe(false);
    expect(isForeignSession({}, 'a')).toBe(false);
    expect(isForeignSession(null, 'a')).toBe(false);
  });
});

describe('ChatRepository.getOrCreateSession', () => {
  it("refuses another user's session", async () => {
    mockDocs.set('s1', { userId: 'victim', topicType: 'TEACHER' });
    await expect(new ChatRepository().getOrCreateSession('s1', 'attacker', 'TEACHER', 'm')).rejects.toBeInstanceOf(SessionAccessError);
  });

  it('returns the caller’s own session and creates a missing one with the caller as owner', async () => {
    mockDocs.set('mine', { userId: 'u1' });
    await expect(new ChatRepository().getOrCreateSession('mine', 'u1', 'TEACHER', 'm')).resolves.toMatchObject({ sessionId: 'mine', userId: 'u1' });
    await new ChatRepository().getOrCreateSession('fresh', 'u1', 'TEACHER', 'm');
    expect(mockSet).toHaveBeenCalledWith('fresh', expect.objectContaining({ userId: 'u1', sessionId: 'fresh' }));
  });
});

describe('ChatService.assertSessionAccess', () => {
  it('throws for a foreign session and passes for own or new sessions', async () => {
    mockDocs.set('theirs', { userId: 'someone' });
    mockDocs.set('mine', { userId: 'u1' });
    const svc = new ChatService();
    await expect(svc.assertSessionAccess('theirs', 'u1')).rejects.toBeInstanceOf(SessionAccessError);
    await expect(svc.assertSessionAccess('mine', 'u1')).resolves.toBeUndefined();
    await expect(svc.assertSessionAccess('new-id', 'u1')).resolves.toBeUndefined();
  });
});

describe('ChatController refuses foreign sessions before charging quota', () => {
  const body = { sessionId: 'theirs', message: 'hi', model: 'm', topicType: 'TEACHER' };

  it('stream endpoint: 403, no quota, no SSE headers', async () => {
    mockDocs.set('theirs', { userId: 'someone-else' });
    const res = mockRes();
    await new ChatController().handleChatStream({ user: { uid: 'u1' }, body, headers: {} } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_FORBIDDEN' }));
    expect(usageService.consumeQuota).not.toHaveBeenCalled();
    expect(res.flushHeaders).not.toHaveBeenCalled();
  });

  it('non-stream endpoint: 403, no quota', async () => {
    mockDocs.set('theirs', { userId: 'someone-else' });
    const res = mockRes();
    await new ChatController().handleChat({ user: { uid: 'u1' }, body } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(usageService.consumeQuota).not.toHaveBeenCalled();
  });
});
