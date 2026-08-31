/**
 * The production DI graph, and the probe contract that guards it.
 *
 * WHY THIS EXISTS. A diagnostic probe ran studentContext.service under `tsx` without calling
 * bootstrapDI(). The container was empty, fetchAnalytics threw
 * "Dependency not found for token: Symbol(IMemoryProvider)", the service caught it and returned
 * null — its correct degradation — and the probe's "analytics: null" was reported as a production
 * defect affecting every student. It wasn't: server.ts bootstraps before routes load, and the
 * running server has never logged that error.
 *
 * These tests pin both halves: the production graph really does resolve, and a probe that forgets
 * to bootstrap fails loudly instead of producing a plausible wrong answer.
 *
 * No network calls, no real student data.
 */

import { container, TOKENS } from '../../src/core/di/container';

/*
 * Providers construct API clients in their constructors, so the modules they pull in are stubbed.
 * The subject under test is the WIRING — that every token the application resolves has something
 * registered against it — not the providers' own behaviour, which their own suites cover.
 */
jest.mock('../../src/services/ai/gemini.provider', () => ({ GeminiProvider: class {} }));
jest.mock('../../src/services/ai/providers/google-embedding.provider', () => ({
  GoogleEmbeddingProvider: class {},
}));
jest.mock('../../src/services/ai/providers/cohere-reranker.provider', () => ({
  CohereRerankerProvider: class {},
}));

describe('the production DI graph initializes', () => {
  beforeAll(() => {
    // Deliberately the PRODUCTION entry point, not a test-only registration set. A smoke test
    // against a bespoke container would prove nothing about what server.ts actually builds.
    const { bootstrapForProbe } = require('../../src/core/di/probeBootstrap');
    bootstrapForProbe();
  });

  it('resolves MemoryProvider — the token whose absence caused the false diagnosis', () => {
    const provider = container.resolve(TOKENS.MemoryProvider);
    expect(provider).toBeDefined();
    expect(provider).not.toBeNull();
  });

  it('exposes the analytics call studentContext depends on', () => {
    // fetchAnalytics calls getLearningAnalytics; if that method vanished, analytics would go
    // silently null again for every student and look exactly like "no data yet".
    const provider = container.resolve<any>(TOKENS.MemoryProvider);
    expect(typeof provider.getLearningAnalytics).toBe('function');
  });

  it.each([
    ['AIProvider', TOKENS.AIProvider],
    ['EmbeddingProvider', TOKENS.EmbeddingProvider],
    ['RerankerProvider', TOKENS.RerankerProvider],
    ['CacheProvider', TOKENS.CacheProvider],
    ['GraphProvider', TOKENS.GraphProvider],
    ['MemoryProvider', TOKENS.MemoryProvider],
    ['AnalyticsProvider', TOKENS.AnalyticsProvider],
  ])('resolves %s without a dependency-resolution failure', (_name, token) => {
    expect(() => container.resolve(token as any)).not.toThrow();
  });

  it('is idempotent — a second bootstrap does not replace live singletons', () => {
    const { bootstrapForProbe } = require('../../src/core/di/probeBootstrap');
    const before = container.resolve(TOKENS.MemoryProvider);
    bootstrapForProbe();
    // bootstrapDI() constructs fresh instances every call, so a non-guarded wrapper would swap
    // the object out from under any caller already holding it.
    expect(container.resolve(TOKENS.MemoryProvider)).toBe(before);
  });
});

describe('an unbootstrapped probe fails loudly, not plausibly', () => {
  /*
   * These run against a cleared container to reproduce the original conditions exactly. The
   * production graph is restored afterwards so ordering cannot leak into the suite above.
   */
  afterEach(() => {
    const { bootstrapDI } = require('../../src/core/di/registry');
    bootstrapDI();
  });

  it('isDIReady reports false on an empty container', () => {
    const { isDIReady } = require('../../src/core/di/probeBootstrap');
    container.clear();
    expect(isDIReady()).toBe(false);
  });

  it('assertDIReady throws, and says the failure is not about production', () => {
    const { assertDIReady } = require('../../src/core/di/probeBootstrap');
    container.clear();
    try {
      assertDIReady('the analytics probe');
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.message).toContain('DI BOOTSTRAP REQUIRED');
      expect(e.message).toContain('the analytics probe');
      // The sentence that would have prevented the false diagnosis.
      expect(e.message).toContain('DOES NOT REPRESENT PRODUCTION HEALTH');
      expect(e.message).toContain('bootstrapForProbe');
    }
  });

  it('assertDIReady is silent once the graph is up', () => {
    const { bootstrapDI } = require('../../src/core/di/registry');
    const { assertDIReady } = require('../../src/core/di/probeBootstrap');
    bootstrapDI();
    expect(() => assertDIReady()).not.toThrow();
  });
});

describe('every DI-dependent script bootstraps', () => {
  const fs = require('fs');
  const path = require('path');
  const SCRIPTS = path.join(__dirname, '../../src/scripts');

  /** Modules that resolve from the container, directly or through what they construct. */
  const DI_DEPENDENT = [
    'studentContext.service', 'studentDigitalTwin.service', 'WorkflowEngine',
    'NotificationWorker', 'ProactiveCompanion', 'GenerationOrchestrator',
    'DeliveryOrchestrator', 'MetricsEngine', 'WhatsAppConversationRouter',
  ];

  it('no script imports a DI-dependent service without initializing the container', () => {
    const offenders: string[] = [];
    for (const f of fs.readdirSync(SCRIPTS).filter((n: string) => n.endsWith('.ts'))) {
      const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
      // Only a real import counts — a mention in a comment or string does not reach the container.
      const imports = DI_DEPENDENT.some((d) =>
        new RegExp(`(^import[^\\n]*|require\\()[^\\n]*${d.replace('.', '\\.')}`, 'm').test(src));
      if (!imports) continue;
      if (!/bootstrapDI\s*\(|bootstrapForProbe\s*\(/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
