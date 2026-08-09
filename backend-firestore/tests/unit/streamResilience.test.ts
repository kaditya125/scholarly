// Verifies the fix for a real bug found via live load testing (docs/LATENCY_INVESTIGATION_REPORT.md
// §3.4): GeminiProvider/GrokVertexProvider's generateStreamResponse only protected the CONNECT
// step with retry/fallback; the token-read loop after that ran completely unprotected, so a
// mid-stream network drop (ETIMEDOUT/ECONNABORTED/"terminated") propagated as a raw, unretried
// error. These tests exercise the fixed retry-before-first-chunk / fail-clean-after-first-chunk
// contract directly against the real provider classes (network calls mocked).

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));

// llmPolicy (src/utils/resilience) wraps a REAL, process-wide Cockatiel circuit breaker +
// timeout. These tests are about the provider's own retry-boundary logic (retry before any
// output, fail clean after), not cockatiel's breaker/timeout semantics — and a real breaker is
// shared, mutable module state that would trip across unrelated test cases in this same file.
// Mock it as a transparent pass-through so each test's failure injection is fully isolated.
jest.mock('../../src/utils/resilience', () => ({
  llmPolicy: { execute: (fn: () => Promise<any>) => fn() },
  mapCockatielError: (err: any) => { throw err; },
}));

// ── GeminiProvider ────────────────────────────────────────────────────────────
describe('GeminiProvider.generateStreamResponse — mid-stream resilience', () => {
  const makeStream = (chunks: string[]) => ({
    async *[Symbol.asyncIterator]() { for (const c of chunks) yield { text: c }; },
  });
  const brokenStream = (chunksBeforeDrop: string[], err: Error) => ({
    async *[Symbol.asyncIterator]() {
      for (const c of chunksBeforeDrop) yield { text: c };
      throw err;
    },
  });

  let generateContentStream: jest.Mock;
  beforeEach(() => {
    jest.resetModules();
    generateContentStream = jest.fn();
    jest.doMock('../../src/services/ai/googleGenAIClient', () => ({
      getResilientClients: () => ({ primary: { models: { generateContentStream } }, fallback: null, primaryLabel: 'vertex' }),
      runResilient: async (clients: any, op: any) => op(clients.primary),
    }));
  });
  afterEach(() => jest.dontMock('../../src/services/ai/googleGenAIClient'));

  async function drain(gen: AsyncGenerator<string>): Promise<string[]> {
    const out: string[] = [];
    for await (const c of gen) out.push(c);
    return out;
  }

  it('streams normally on the happy path (no retry involved)', async () => {
    generateContentStream.mockResolvedValueOnce(makeStream(['Hello ', 'world']));
    const { GeminiProvider } = await import('../../src/services/ai/gemini.provider');
    const out = await drain(new GeminiProvider().generateStreamResponse([{ role: 'user', content: 'hi' } as any]));
    expect(out).toEqual(['Hello ', 'world']);
    expect(generateContentStream).toHaveBeenCalledTimes(1);
  });

  it('retries a connect-time failure with ZERO output yielded, then succeeds', async () => {
    generateContentStream
      .mockRejectedValueOnce(Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }))
      .mockResolvedValueOnce(makeStream(['recovered']));
    const { GeminiProvider } = await import('../../src/services/ai/gemini.provider');
    const out = await drain(new GeminiProvider().generateStreamResponse([{ role: 'user', content: 'hi' } as any]));
    expect(out).toEqual(['recovered']);
    expect(generateContentStream).toHaveBeenCalledTimes(2); // one failed attempt + one success
  });

  it('retries a MID-STREAM drop that happens BEFORE any chunk reaches the caller', async () => {
    generateContentStream
      .mockResolvedValueOnce(brokenStream([], Object.assign(new Error('terminated'), { code: 'ECONNABORTED' })))
      .mockResolvedValueOnce(makeStream(['fresh answer']));
    const { GeminiProvider } = await import('../../src/services/ai/gemini.provider');
    const out = await drain(new GeminiProvider().generateStreamResponse([{ role: 'user', content: 'hi' } as any]));
    expect(out).toEqual(['fresh answer']);
    expect(generateContentStream).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry once output has already reached the caller — throws a clean typed error instead', async () => {
    generateContentStream.mockResolvedValueOnce(
      brokenStream(['partial '], Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })),
    );
    const { GeminiProvider } = await import('../../src/services/ai/gemini.provider');
    const gen = new GeminiProvider().generateStreamResponse([{ role: 'user', content: 'hi' } as any]);
    const first = await gen.next();
    expect(first.value).toBe('partial ');
    await expect(gen.next()).rejects.toThrow(/ETIMEDOUT/);
    // Never re-attempted the call after partial output was already streamed to the caller.
    expect(generateContentStream).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting retries when nothing ever streams', async () => {
    generateContentStream.mockRejectedValue(Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }));
    const { GeminiProvider } = await import('../../src/services/ai/gemini.provider');
    const gen = new GeminiProvider().generateStreamResponse([{ role: 'user', content: 'hi' } as any]);
    await expect(gen.next()).rejects.toThrow();
    expect(generateContentStream).toHaveBeenCalledTimes(3); // maxAttempts
  });
});

// ── GrokVertexProvider ────────────────────────────────────────────────────────
describe('GrokVertexProvider.generateStreamResponse — mid-stream resilience', () => {
  const sseBody = (deltas: string[]) => {
    const lines = deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n`).join('') + 'data: [DONE]\n';
    const encoder = new TextEncoder();
    let sent = false;
    return {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: encoder.encode(lines) };
        },
      }),
    };
  };
  const brokenBody = (deltas: string[], err: Error) => {
    const encoder = new TextEncoder();
    const lines = deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n`).join('');
    let sent = false;
    return {
      getReader: () => ({
        read: async () => {
          if (!sent) { sent = true; return { done: false, value: encoder.encode(lines) }; }
          throw err;
        },
      }),
    };
  };

  let fetchMock: jest.Mock;
  beforeEach(() => {
    jest.resetModules(); // same isolation as the Gemini block — Grok's fallback path dynamically
    // imports GeminiProvider, so a stale module registry here could leak state between blocks.
    process.env.GROK_VERTEX_PROJECT = 'proj';
    process.env.GROK_SA_KEY_FILE = '';
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    jest.doMock('google-auth-library', () => ({
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getClient: async () => ({ getAccessToken: async () => ({ token: 'tok' }) }),
      })),
    }));
  });
  afterEach(() => { jest.dontMock('google-auth-library'); jest.dontMock('../../src/services/ai/gemini.provider'); delete (global as any).fetch; });

  async function drain(gen: AsyncGenerator<string>): Promise<string[]> {
    const out: string[] = [];
    for await (const c of gen) out.push(c);
    return out;
  }

  it('streams normally on the happy path', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, body: sseBody(['Hi ', 'there']) });
    const { GrokVertexProvider } = await import('../../src/services/ai/grok-vertex.provider');
    const out = await drain(new GrokVertexProvider().generateStreamResponse([{ role: 'user', content: 'hi' } as any]));
    expect(out.join('')).toBe('Hi there');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a mid-stream drop that happens before any delta is yielded', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, body: brokenBody([], Object.assign(new Error('terminated'), { code: 'ECONNABORTED' })) })
      .mockResolvedValueOnce({ ok: true, body: sseBody(['recovered']) });
    const { GrokVertexProvider } = await import('../../src/services/ai/grok-vertex.provider');
    const out = await drain(new GrokVertexProvider().generateStreamResponse([{ role: 'user', content: 'hi' } as any]));
    expect(out.join('')).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry/fallback once a delta already reached the caller — throws instead', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: brokenBody(['partial'], Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })),
    });
    const { GrokVertexProvider } = await import('../../src/services/ai/grok-vertex.provider');
    const gen = new GrokVertexProvider().generateStreamResponse([{ role: 'user', content: 'hi' } as any]);
    const first = await gen.next();
    expect(first.value).toBe('partial');
    await expect(gen.next()).rejects.toThrow(/ETIMEDOUT/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to Gemini when Grok never manages to stream anything', async () => {
    fetchMock.mockRejectedValue(new Error('connect ETIMEDOUT'));
    jest.doMock('../../src/services/ai/gemini.provider', () => ({
      GeminiProvider: jest.fn().mockImplementation(() => ({
        generateStreamResponse: async function* () { yield 'gemini fallback answer'; },
      })),
    }));
    const { GrokVertexProvider } = await import('../../src/services/ai/grok-vertex.provider');
    const out = await drain(new GrokVertexProvider().generateStreamResponse([{ role: 'user', content: 'hi' } as any]));
    expect(out).toEqual(['gemini fallback answer']);
  });
});
