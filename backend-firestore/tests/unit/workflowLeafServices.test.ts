import { IntentService } from '../../src/core/workflow/services/IntentService';
import { ContextService } from '../../src/core/workflow/services/ContextService';
import { MemoryService } from '../../src/core/workflow/services/MemoryService';
import { MemoryUpdateService } from '../../src/core/workflow/services/MemoryUpdateService';
import { VerificationService } from '../../src/core/workflow/services/VerificationService';
import { WorkflowTelemetryService } from '../../src/core/workflow/services/TelemetryService';
import { Telemetry } from '../../src/lib/telemetry';
import { ChatMessage } from '../../src/types';

const msg = (role: string, content: string): ChatMessage => ({ role, content, timestamp: Date.now() } as any);

describe('IntentService', () => {
  const svc = new IntentService();

  it('classifies a short greeting as the greeting flow', () => {
    const r = svc.classify('hello', [msg('user', 'hello')]);
    expect(r.isGreeting).toBe(true);
    expect(r.isGreetingFlow).toBe(true);
    expect(r.mode).toBe('TEACHER');
    expect(r.kind).toContain('greeting');
  });

  it('classifies a learning question as a question (not greeting flow)', () => {
    const r = svc.classify('Explain Newton\'s second law with an example', [], 'RESEARCH');
    expect(r.isGreetingFlow).toBe(false);
    expect(r.mode).toBe('RESEARCH');
    expect(r.wordCount).toBeGreaterThan(3);
    expect(svc.buildDetailMessage(r)).toContain('RESEARCH mode');
  });

  it('a greeting with long history is NOT the greeting flow', () => {
    const history = [msg('user', 'a'), msg('ai', 'b'), msg('user', 'c'), msg('ai', 'd')];
    const r = svc.classify('thanks', history);
    expect(r.isGreeting).toBe(true);
    expect(r.isShortHistory).toBe(false);
    expect(r.isGreetingFlow).toBe(false);
  });
});

describe('ContextService', () => {
  it('returns aggregated context on success', async () => {
    const fake = { aggregateContext: jest.fn().mockResolvedValue({ userId: 'u1', isOnboarded: true, profile: { targetExam: 'UPSC' } }) };
    const svc = new ContextService(fake as any);
    const ctx = await svc.load('u1');
    expect(ctx.isOnboarded).toBe(true);
    expect(fake.aggregateContext).toHaveBeenCalledWith('u1');
  });

  it('falls back to a safe default context when aggregation throws', async () => {
    const fake = { aggregateContext: jest.fn().mockRejectedValue(new Error('firestore down')) };
    const svc = new ContextService(fake as any);
    const ctx = await svc.load('u2');
    expect(ctx.userId).toBe('u2');
    expect(ctx.isOnboarded).toBe(false);
    expect(ctx.isFirstTimeUser).toBe(true);
    expect(ctx.profile).toBeNull();
  });

  it('builds a profile detail line', () => {
    const svc = new ContextService({ aggregateContext: jest.fn() } as any);
    const line = svc.buildDetailMessage({ profile: { targetExam: 'SSC CGL', preparationLevel: 'beginner' }, isOnboarded: true } as any);
    expect(line).toContain('SSC CGL');
    expect(line).toContain('beginner');
  });
});

describe('MemoryService', () => {
  it('loads only session memory via the provider (analytics dedupe — no getLearningAnalytics)', async () => {
    const provider = {
      getSessionMemory: jest.fn().mockResolvedValue({ contextWindow: ['q1', 'q2'] }),
      getLearningAnalytics: jest.fn().mockResolvedValue({ masteryPercentage: 40 }),
    };
    const svc = new MemoryService(provider as any);
    const sessionMemory = await svc.loadSessionMemory('u1', 's1');
    expect(sessionMemory.contextWindow).toHaveLength(2);
    expect(provider.getSessionMemory).toHaveBeenCalledWith('u1', 's1');
    // Dedupe: analytics are loaded by aggregateContext, so MemoryService must NOT re-fetch them.
    expect(provider.getLearningAnalytics).not.toHaveBeenCalled();
  });

  it('builds a memory detail line reflecting recalled turns + mastery', () => {
    const svc = new MemoryService({} as any);
    const line = svc.buildDetailMessage(
      { memory: { weakTopics: ['t1'], strongTopics: [] }, analytics: { masteryPercentage: 55 } } as any,
      { contextWindow: ['a', 'b'] },
    );
    expect(line).toContain('recalled 2 recent turn(s)');
    expect(line).toContain('55% mastery');
    expect(line).toContain('1 weak');
  });
});

describe('MemoryUpdateService', () => {
  it('appends the context window via the provider', async () => {
    const provider = { updateSessionMemory: jest.fn().mockResolvedValue(undefined) };
    const svc = new MemoryUpdateService(provider as any, {} as any);
    await svc.updateSessionMemory('u1', 's1', ['q1', 'q2']);
    expect(provider.updateSessionMemory).toHaveBeenCalledWith('u1', 's1', { contextWindow: ['q1', 'q2'] });
  });

  it('fires profile extraction without throwing (fire-and-forget)', () => {
    const profileService = { extractProfileFromConversation: jest.fn().mockResolvedValue(undefined) };
    const svc = new MemoryUpdateService({} as any, profileService as any);
    expect(() => svc.extractProfile('u1', 'msg', 'reply')).not.toThrow();
    expect(profileService.extractProfileFromConversation).toHaveBeenCalledWith('u1', 'msg', 'reply');
  });

  it('extractProfileTask returns the underlying promise (errors propagate for executor retry)', async () => {
    const profileService = { extractProfileFromConversation: jest.fn().mockRejectedValue(new Error('boom')) };
    const svc = new MemoryUpdateService({} as any, profileService as any);
    await expect(svc.extractProfileTask('u1', 'msg', 'reply')).rejects.toThrow('boom');
  });
});

describe('VerificationService', () => {
  it('computes hallucination/coverage/confidence + warnings from the verifier', async () => {
    const retrieval = {
      verifyClaimsAndCalculateConfidence: jest.fn().mockResolvedValue({
        supportedClaims: [{ claim: 'a' }, { claim: 'b' }, { claim: 'c' }],
        unsupportedClaims: [{ claim: 'd' }],
        confidenceScore: 0.75,
        isValid: false,
      }),
    };
    const svc = new VerificationService(retrieval as any);
    const r = await svc.verify('answer text', [{ text: 't', source: 's', score: 0.9 }]);
    expect(r).not.toBeNull();
    expect(r!.confidence).toBe(0.75);
    expect(r!.hallucinationRate).toBeCloseTo(0.25);
    expect(r!.citationCoverage).toBeCloseTo(0.75);
    expect(r!.warnings).toEqual(['d']);
  });

  it('returns null (non-fatal) when the verifier throws', async () => {
    const retrieval = { verifyClaimsAndCalculateConfidence: jest.fn().mockRejectedValue(new Error('boom')) };
    const svc = new VerificationService(retrieval as any);
    const r = await svc.verify('answer', [{ text: 't', source: 's', score: 1 }]);
    expect(r).toBeNull();
  });

  it('leaves hallucination/coverage undefined when there are zero claims', async () => {
    const retrieval = {
      verifyClaimsAndCalculateConfidence: jest.fn().mockResolvedValue({
        supportedClaims: [], unsupportedClaims: [], confidenceScore: 0.9, isValid: true,
      }),
    };
    const svc = new VerificationService(retrieval as any);
    const r = await svc.verify('answer', [{ text: 't', source: 's', score: 1 }]);
    expect(r!.confidence).toBe(0.9);
    expect(r!.hallucinationRate).toBeUndefined();
    expect(r!.citationCoverage).toBeUndefined();
    expect(r!.warnings).toEqual([]);
  });
});

describe('WorkflowTelemetryService.deriveGenCost', () => {
  it('sums token/cost spans recorded after the cost mark', () => {
    const svc = new WorkflowTelemetryService();
    const mark = Telemetry.costs.length;
    Telemetry.costs.push({ provider: 'gemini', type: 'input', tokens: 100, cost: 0.01, model: 'gemini-2.5-flash' } as any);
    Telemetry.costs.push({ provider: 'gemini', type: 'output', tokens: 200, cost: 0.02 } as any);

    const gen = svc.deriveGenCost(mark);
    expect(gen.provider).toBe('gemini');
    expect(gen.promptTokens).toBe(100);
    expect(gen.completionTokens).toBe(200);
    expect(gen.totalCostUSD).toBeCloseTo(0.03);
  });
});
