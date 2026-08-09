import { PromptBuilder } from '../../src/core/intelligence/PromptBuilder';
import { PromptLibrary } from '../../src/core/intelligence/PromptLibrary';
import { ExecutionPlan } from '../../src/core/intelligence/types';

function plan(over: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    category: 'concept_explanation',
    confidence: 0.8,
    complexity: { level: 3, factors: [] },
    workflow: { name: 'concept', retrievalStrategy: 'graphrag', modelTier: 'reasoning', promptTemplate: 'teacher', streaming: true, useMemory: true, verification: 'full' },
    retrievalStrategy: 'graphrag',
    model: { tier: 'reasoning', providerToken: 'ReasoningProvider', label: 'reasoning', reason: '' },
    personalization: {},
    cachePolicy: { cacheable: false, similarityThreshold: 1, ttlSeconds: 0 },
    estimatedLatencyMs: 4000,
    estimatedCostUsd: 0.001,
    source: 'intelligence',
    ...over,
  };
}

describe('PromptLibrary', () => {
  const lib = new PromptLibrary();
  it('selects a role template by category then workflow', () => {
    expect(lib.templateFor('problem_solving', 'problem_solving')).toBe('problem_solver');
    expect(lib.templateFor('research', 'research')).toBe('research');
    expect(lib.templateFor('quiz_generation', 'quiz')).toBe('quiz');
    expect(lib.templateFor('unknown', 'concept')).toBe('teacher'); // falls back
  });
  it('exposes bloom directives and template names', () => {
    expect(lib.bloomDirective('apply')).toMatch(/APPLY/);
    expect(lib.templateNames()).toEqual(expect.arrayContaining(['teacher', 'exam', 'tutor', 'revision', 'problem_solver', 'research', 'quiz']));
  });
});

describe('PromptBuilder', () => {
  const b = new PromptBuilder();

  it('composes a Bloom + depth directive block', () => {
    const out = b.build({ plan: plan({ bloom: { level: 'analyze', confidence: 0.8, signals: [] } }), comprehensionDepth: 'beginner' });
    expect(out.template).toBe('teacher');
    expect(out.directive).toContain('Adaptive Teaching Directives');
    expect(out.directive).toMatch(/ANALYZE/);
    expect(out.directive).toMatch(/limited background/); // beginner depth
    expect(out.signals).toEqual(expect.arrayContaining(['bloom:analyze', 'depth:beginner']));
  });

  it('adds reasoning + math scaffolds for heavy semantic complexity', () => {
    const out = b.build({
      plan: plan({
        category: 'numerical',
        bloom: { level: 'apply', confidence: 0.8, signals: [] },
        semanticComplexity: { score: 4, reasoningDepth: 0.8, conceptDependency: 0.5, prerequisiteCount: 3, graphTraversalDepth: 3, abstractionLevel: 0.5, explanationDifficulty: 0.6, mathematicalReasoning: 0.9, synthesisRequirement: 0.6, estimatedContextSize: 5000, expectedTokens: 1500, expectedLatencyMs: 9000, recommendedWorkflow: 'problem_solving', factors: [] },
      }),
    });
    expect(out.directive).toMatch(/step-by-step reasoning/i);
    expect(out.directive).toMatch(/mathematical working/i);
    expect(out.signals).toEqual(expect.arrayContaining(['reasoning-scaffold', 'math-working']));
  });

  it('honors preferences (language/brief/examples/diagrams/tables)', () => {
    const out = b.build({
      plan: plan(),
      preferences: { language: 'Hindi', depth: 'brief', preferExamples: true, preferDiagrams: true, preferTables: true },
    });
    expect(out.directive).toMatch(/Respond in Hindi/);
    expect(out.directive).toMatch(/concise/);
    expect(out.directive).toMatch(/worked example/);
    expect(out.directive).toMatch(/diagram/);
    expect(out.directive).toMatch(/table/);
    expect(out.signals).toEqual(expect.arrayContaining(['pref:language', 'pref:brief', 'pref:examples', 'pref:diagrams', 'pref:tables']));
  });

  it('reinforces weak concepts/topics and low mastery', () => {
    const withConcepts = b.build({ plan: plan(), weakConcepts: ['limits', 'derivatives'] });
    expect(withConcepts.directive).toMatch(/weak mastery of prerequisite/i);
    const withTopics = b.build({ plan: plan(), weakTopics: ['trigonometry'], masteryPercentage: 20 });
    expect(withTopics.directive).toMatch(/previously struggled/i);
    expect(withTopics.directive).toMatch(/mastery is still developing/i);
    expect(withTopics.signals).toEqual(expect.arrayContaining(['mastery:weak-topics', 'mastery:low']));
  });

  it('prefers concept-level weak mastery over free-text weak topics when both present', () => {
    const out = b.build({ plan: plan(), weakConcepts: ['limits'], weakTopics: ['trig'] });
    expect(out.signals).toContain('mastery:weak-concepts');
    expect(out.signals).not.toContain('mastery:weak-topics');
  });
});
