// Mock the heavy service + file parser so the controller is tested in isolation.
jest.mock('../../src/services/chat.service', () => ({
  ChatService: jest.fn().mockImplementation(() => ({
    recordFeedback: jest.fn().mockResolvedValue(undefined),
    processChat: jest.fn().mockResolvedValue({ reply: 'hi' }),
    processChatStream: jest.fn().mockResolvedValue(undefined),
    getUserSessions: jest.fn().mockResolvedValue([{ id: 's1' }]),
    getSessionHistory: jest.fn().mockResolvedValue([{ role: 'user', content: 'q' }]),
    deleteSession: jest.fn().mockResolvedValue(true),
  })),
}));
jest.mock('../../src/services/fileParser.service', () => ({
  FileParserService: { extractText: jest.fn().mockResolvedValue([{ text: 'parsed doc text' }]) },
}));

import { ChatController } from '../../src/controllers/chat.controller';
import { ChatService } from '../../src/services/chat.service';
import { FileParserService } from '../../src/services/fileParser.service';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.flushHeaders = jest.fn();
  res.write = jest.fn();
  res.end = jest.fn();
  res.headersSent = false;
  return res;
}

let controller: ChatController;
let svc: any;
beforeEach(() => {
  jest.clearAllMocks();
  controller = new ChatController();
  svc = (ChatService as jest.Mock).mock.results.at(-1)!.value;
});

describe('ChatController.handleChat', () => {
  it('401 when unauthenticated', async () => {
    const res = mockRes();
    await controller.handleChat({ user: undefined, body: {} } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(svc.processChat).not.toHaveBeenCalled();
  });

  it('400 when required fields are missing', async () => {
    const res = mockRes();
    await controller.handleChat({ user: { uid: 'u1' }, body: { sessionId: 's1' } } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('delegates to the service with the token uid and returns the reply', async () => {
    const res = mockRes();
    await controller.handleChat({ user: { uid: 'u1' }, body: { sessionId: 's1', message: 'q', model: 'm', topicType: 't' } } as any, res, jest.fn());
    expect(svc.processChat).toHaveBeenCalledWith('u1', 's1', 'q', 'm', 't');
    expect(res.json).toHaveBeenCalledWith({ reply: 'hi' });
  });

  it('forwards errors to next()', async () => {
    const res = mockRes();
    const next = jest.fn();
    svc.processChat.mockRejectedValueOnce(new Error('boom'));
    await controller.handleChat({ user: { uid: 'u1' }, body: { sessionId: 's1', message: 'q', model: 'm', topicType: 't' } } as any, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('ChatController.handleFeedback', () => {
  it('401 unauthenticated', async () => {
    const res = mockRes();
    await controller.handleFeedback({ user: undefined, body: {} } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('400 when signal is missing', async () => {
    const res = mockRes();
    await controller.handleFeedback({ user: { uid: 'u1' }, body: {} } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('records the feedback and returns ok', async () => {
    const res = mockRes();
    await controller.handleFeedback({ user: { uid: 'u1' }, body: { signal: 'thumbs_up', sessionId: 's1' } } as any, res, jest.fn());
    expect(svc.recordFeedback).toHaveBeenCalledWith('u1', expect.objectContaining({ signal: 'thumbs_up', sessionId: 's1' }));
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

describe('ChatController.handleChatStream', () => {
  it('401 unauthenticated', async () => {
    const res = mockRes();
    await controller.handleChatStream({ user: undefined, body: {}, headers: {} } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('400 when neither message nor attachments are present', async () => {
    const res = mockRes();
    await controller.handleChatStream({ user: { uid: 'u1' }, body: { sessionId: 's1', model: 'm', topicType: 't' }, headers: {} } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('sets SSE headers and delegates to processChatStream', async () => {
    const res = mockRes();
    await controller.handleChatStream({ user: { uid: 'u1' }, body: { sessionId: 's1', message: 'q', model: 'm', topicType: 't', notebookId: 'nb1' }, headers: { 'x-trace-id': 'tr1' } } as any, res, jest.fn());
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.flushHeaders).toHaveBeenCalled();
    // learningContext + scopeSourceIds are absent from this request body, so the controller
    // delegates them as undefined (hard-scope/learning-context are opt-in).
    expect(svc.processChatStream).toHaveBeenCalledWith('u1', 's1', 'q', 'm', 't', res, 'nb1', 'tr1', undefined, undefined);
  });

  it('parses attachments and prepends the extracted text', async () => {
    const res = mockRes();
    await controller.handleChatStream({
      user: { uid: 'u1' },
      body: { sessionId: 's1', message: 'explain', model: 'm', topicType: 't', attachments: [{ data: 'b64', mimeType: 'application/pdf', name: 'a.pdf' }] },
      headers: {},
    } as any, res, jest.fn());
    expect(FileParserService.extractText).toHaveBeenCalled();
    const passedMessage = svc.processChatStream.mock.calls[0][2];
    expect(passedMessage).toContain('[File Attached: a.pdf]');
    expect(passedMessage).toContain('parsed doc text');
    expect(passedMessage).toContain('explain');
  });

  it('writes an SSE error frame when the stream throws after headers are sent', async () => {
    const res = mockRes();
    res.headersSent = true;
    svc.processChatStream.mockRejectedValueOnce(new Error('mid-stream'));
    await controller.handleChatStream({ user: { uid: 'u1' }, body: { sessionId: 's1', message: 'q', model: 'm', topicType: 't' }, headers: {} } as any, res, jest.fn());
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('Internal server error during stream'));
    expect(res.end).toHaveBeenCalled();
  });

  it('calls next() when the stream throws before headers are sent', async () => {
    const res = mockRes();
    res.headersSent = false;
    const next = jest.fn();
    svc.processChatStream.mockRejectedValueOnce(new Error('early'));
    await controller.handleChatStream({ user: { uid: 'u1' }, body: { sessionId: 's1', message: 'q', model: 'm', topicType: 't' }, headers: {} } as any, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('ChatController.getUserSessions / getSessionHistory / deleteSession', () => {
  it('getUserSessions 401 + success', async () => {
    const res1 = mockRes();
    await controller.getUserSessions({ user: undefined } as any, res1, jest.fn());
    expect(res1.status).toHaveBeenCalledWith(401);

    const res2 = mockRes();
    await controller.getUserSessions({ user: { uid: 'u1' } } as any, res2, jest.fn());
    expect(res2.json).toHaveBeenCalledWith([{ id: 's1' }]);
  });

  it('getSessionHistory 400 without sessionId, 403 on Forbidden, success otherwise', async () => {
    const res1 = mockRes();
    await controller.getSessionHistory({ user: { uid: 'u1' }, params: {} } as any, res1, jest.fn());
    expect(res1.status).toHaveBeenCalledWith(400);

    const res2 = mockRes();
    svc.getSessionHistory.mockRejectedValueOnce(new Error('Forbidden'));
    await controller.getSessionHistory({ user: { uid: 'u1' }, params: { sessionId: 's9' } } as any, res2, jest.fn());
    expect(res2.status).toHaveBeenCalledWith(403);

    const res3 = mockRes();
    await controller.getSessionHistory({ user: { uid: 'u1' }, params: { sessionId: 's1' } } as any, res3, jest.fn());
    expect(res3.json).toHaveBeenCalledWith([{ role: 'user', content: 'q' }]);
  });

  it('deleteSession 404 when not found, success when deleted', async () => {
    const res1 = mockRes();
    svc.deleteSession.mockResolvedValueOnce(false);
    await controller.deleteSession({ user: { uid: 'u1' }, params: { sessionId: 's1' } } as any, res1, jest.fn());
    expect(res1.status).toHaveBeenCalledWith(404);

    const res2 = mockRes();
    svc.deleteSession.mockResolvedValueOnce(true);
    await controller.deleteSession({ user: { uid: 'u1' }, params: { sessionId: 's1' } } as any, res2, jest.fn());
    expect(res2.json).toHaveBeenCalledWith({ message: 'Session deleted successfully' });
  });
});
