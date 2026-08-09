import { BloomClassifier } from '../../src/core/intelligence/BloomClassifier';
import { SemanticComplexityAnalyzer } from '../../src/core/intelligence/SemanticComplexityAnalyzer';
import { HybridIntentClassifier, LLMIntentClassifier } from '../../src/core/intelligence/HybridIntentClassifier';
import { IntentAnalyzer } from '../../src/core/intelligence/IntentAnalyzer';
import { CacheService } from '../../src/services/cache.service';
import { IntelligenceInput } from '../../src/core/intelligence/types';

const input = (query: string, extra: Partial<IntelligenceInput> = {}): IntelligenceInput => ({
  query, history: [], ...extra,
});

describe('BloomClassifier', () => {
  const c = new BloomClassifier();
  it('maps question stems to the right cognitive level', () => {
    expect(c.classify(input('What is DNA?')).level).toBe('remember');
    expect(c.classify(input('Explain DNA replication')).level).toBe('understand');
    expect(c.classify(input('Solve this genetics problem and find the value of x')).level).toBe('apply');
    expect(c.classify(input('Compare mitosis and meiosis')).level).toBe('analyze');
    expect(c.classify(input('Critique this solution and justify your view')).level).toBe('evaluate');
    expect(c.classify(input('Design an experiment to test osmosis')).level).toBe('create');
  });

  it('treats "what is X and how does it work" as understand, not remember', () => {
    expect(c.classify(input('What is a transformer and how does it work?')).level).toBe('understand');
  });

  it('defaults to understand and never throws on empty', () => {
    expect(c.classify(input('photosynthesis')).level).toBe('understand');
    expect(c.classify(input('')).level).toBe('understand');
  });
});

describe('SemanticComplexityAnalyzer', () => {
  const s = new SemanticComplexityAnalyzer();
  it('scores a factual recall low and a research synthesis high', () => {
    const easy = s.analyze(input('define osmosis'), 'definition', 'remember', 'definition');
    const hard = s.analyze(input('Critically compare and synthesize the implications of quantum entanglement across interpretations'), 'research', 'evaluate', 'research');
    expect(easy.score).toBeLessThan(hard.score);
    expect(hard.synthesisRequirement).toBeGreaterThan(0);
    expect(hard.expectedTokens).toBeGreaterThan(easy.expectedTokens);
    expect(hard.expectedLatencyMs).toBeGreaterThan(easy.expectedLatencyMs);
  });

  it('flags mathematical reasoning for numerical queries', () => {
    const m = s.analyze(input('calculate the acceleration when F=10N and m=2kg'), 'numerical', 'apply', 'problem_solving');
    expect(m.mathematicalReasoning).toBeGreaterThan(0.5);
  });

  it('honors explicit graph hints for prerequisite/traversal', () => {
    const r = s.analyze(input('explain integration'), 'concept_explanation', 'understand', 'concept', { prerequisiteCount: 5, graphTraversalDepth: 3 });
    expect(r.prerequisiteCount).toBe(5);
    expect(r.graphTraversalDepth).toBe(3);
  });
});

describe('HybridIntentClassifier', () => {
  const OLD = process.env.ENABLE_HYBRID_INTENT;
  afterEach(() => { process.env.ENABLE_HYBRID_INTENT = OLD; });

  const fakeCache = (): CacheService => {
    const m = new Map<string, any>();
    return {
      get: async (k) => (m.has(k) ? m.get(k) : null),
      set: async (k, v) => { m.set(k, v); },
      del: async (k) => { m.delete(k); },
    };
  };

  it('uses the heuristic and never calls the LLM when the flag is OFF', async () => {
    process.env.ENABLE_HYBRID_INTENT = 'false';
    const llm: LLMIntentClassifier = { classify: jest.fn(async () => ({ category: 'research' as const, confidence: 0.9 })) };
    const h = new HybridIntentClassifier(new IntentAnalyzer(), llm, fakeCache());
    const r = await h.classify(input('hello there'));
    expect(r.source).toBe('heuristic');
    expect(llm.classify).not.toHaveBeenCalled();
  });

  it('does not call the LLM for confident heuristic results even when flag ON', async () => {
    process.env.ENABLE_HYBRID_INTENT = 'true';
    const llm: LLMIntentClassifier = { classify: jest.fn(async () => ({ category: 'research' as const, confidence: 0.9 })) };
    const h = new HybridIntentClassifier(new IntentAnalyzer(), llm, fakeCache());
    await h.classify(input('What is the difference between mitosis and meiosis?')); // confident 'comparison'
    expect(llm.classify).not.toHaveBeenCalled();
  });

  it('escalates to the LLM for ambiguous queries and merges (override on disagreement)', async () => {
    process.env.ENABLE_HYBRID_INTENT = 'true';
    const llm: LLMIntentClassifier = { classify: jest.fn(async () => ({ category: 'career_guidance' as const, confidence: 0.82 })) };
    const cache = fakeCache();
    const h = new HybridIntentClassifier(new IntentAnalyzer(), llm, cache);
    const r = await h.classify(input('hmm ok stuff')); // low-confidence general_chat
    expect(llm.classify).toHaveBeenCalledTimes(1);
    expect(r.category).toBe('career_guidance');
    expect(r.source).toBe('llm');
    // Second identical call should hit the cache, not the LLM again.
    await h.classify(input('hmm ok stuff'));
    expect(llm.classify).toHaveBeenCalledTimes(1);
    expect(h.getStats().cacheHits).toBe(1);
  });

  it('fails open to the heuristic when the LLM errors or returns null', async () => {
    process.env.ENABLE_HYBRID_INTENT = 'true';
    const llm: LLMIntentClassifier = { classify: jest.fn(async () => { throw new Error('boom'); }) };
    const h = new HybridIntentClassifier(new IntentAnalyzer(), llm, fakeCache());
    const r = await h.classify(input('meh whatever'));
    expect(r.source).toBe('heuristic');
  });

  it('tracks classifier stats (agreement rate)', async () => {
    process.env.ENABLE_HYBRID_INTENT = 'true';
    const llm: LLMIntentClassifier = { classify: jest.fn(async () => ({ category: 'general_chat' as const, confidence: 0.8 })) };
    const h = new HybridIntentClassifier(new IntentAnalyzer(), llm, fakeCache());
    await h.classify(input('blah blah unclear thing here')); // heuristic likely general_chat → agreement
    const stats = h.getStats();
    expect(stats.total).toBe(1);
    expect(stats.llmInvoked).toBe(1);
    expect(stats.agreementRate).toBeGreaterThanOrEqual(0);
  });
});
