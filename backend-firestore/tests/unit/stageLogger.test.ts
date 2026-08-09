import { StageLogger } from '../../src/core/workflow/logging/StageLogger';
import { logger } from '../../src/utils/logger';

// Mock factory must not reference outer variables (jest hoists it above declarations),
// so we create the fns inside and grab a typed reference from the mocked module.
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));
const mockLogger = logger as unknown as {
  info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock; log: jest.Mock;
};

describe('StageLogger', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs start (debug) and end (info with duration) around a successful stage', async () => {
    const log = new StageLogger('trace-123');
    const result = await log.stage('retrieval', async () => 42);

    expect(result).toBe(42);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('retrieval: start'),
      expect.objectContaining({ traceId: 'trace-123', stage: 'retrieval', phase: 'start' }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('retrieval: end'),
      expect.objectContaining({ traceId: 'trace-123', stage: 'retrieval', phase: 'end', durationMs: expect.any(Number) }),
    );
  });

  it('logs an error (with duration) and re-throws so control flow is unchanged', async () => {
    const log = new StageLogger('trace-err');
    const boom = new Error('kaboom');

    await expect(log.stage('generation', async () => { throw boom; })).rejects.toThrow('kaboom');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('generation: error'),
      expect.objectContaining({ traceId: 'trace-err', stage: 'generation', phase: 'error', error: 'kaboom', durationMs: expect.any(Number) }),
    );
  });

  it('streamStage yields every item unchanged and logs end', async () => {
    const log = new StageLogger('trace-stream');
    async function* gen() { yield 'a'; yield 'b'; yield 'c'; }

    const out: string[] = [];
    for await (const item of log.streamStage('graph', gen())) out.push(item);

    expect(out).toEqual(['a', 'b', 'c']);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('graph: end'),
      expect.objectContaining({ stage: 'graph', phase: 'end' }),
    );
  });

  it('event and warn emit structured logs with the traceId', () => {
    const log = new StageLogger('t9');
    log.event('intent', 'classified', { kind: 'question' });
    log.warn('memory', 'cache miss');

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('intent: classified'),
      expect.objectContaining({ traceId: 't9', stage: 'intent', kind: 'question' }),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('memory: cache miss'),
      expect.objectContaining({ traceId: 't9', stage: 'memory' }),
    );
  });
});
