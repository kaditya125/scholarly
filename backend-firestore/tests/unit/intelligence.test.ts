import { IntentAnalyzer } from '../../src/core/intelligence/IntentAnalyzer';
import { ComplexityAnalyzer } from '../../src/core/intelligence/ComplexityAnalyzer';
import { WorkflowRouter } from '../../src/core/intelligence/WorkflowRouter';
import { RetrievalRouter } from '../../src/core/intelligence/RetrievalRouter';
import { ModelRouter } from '../../src/core/intelligence/ModelRouter';
import { IntelligenceService } from '../../src/core/intelligence/IntelligenceService';
import { IntelligenceInput, QueryCategory } from '../../src/core/intelligence/types';

const input = (query: string, over: Partial<IntelligenceInput> = {}): IntelligenceInput =>
  ({ query, history: [], ...over });

describe('IntentAnalyzer — query categorization', () => {
  const a = new IntentAnalyzer();
  const cat = (q: string, over?: Partial<IntelligenceInput>) => a.analyze(input(q, over)).category;

  it('classifies the core categories', () => {
    expect(cat('hello')).toBe('greeting');
    expect(cat('What is Newton\'s first law?')).toBe('definition');
    expect(cat('Explain how photosynthesis works')).toBe('concept_explanation');
    expect(cat('difference between mitosis and meiosis')).toBe('comparison');
    expect(cat('solve for x in 2x + 3 = 9')).toBe('numerical');
    expect(cat('give me a quiz on thermodynamics')).toBe('quiz_generation');
    expect(cat('help me revise organic chemistry before my exam')).toBe('revision');
    expect(cat('summarize this chapter')).toBe('summary');
    expect(cat('translate this to hindi')).toBe('translation');
    expect(cat('make a study plan for NEET')).toBe('planning');
    expect(cat('which career should I choose after 12th')).toBe('career_guidance');
    expect(cat('this is my homework: explain gravity')).toBe('homework_help');
    expect(cat('latest research on CRISPR')).toBe('research');
    expect(cat('write python code to sort a list')).toBe('coding');
  });

  it('detects follow-ups (short + pronoun-led + prior turns)', () => {
    const c = a.analyze(input('why?', { history: [
      { role: 'user', content: 'what is inertia' }, { role: 'ai', content: '...' },
    ] })).category;
    expect(c).toBe('follow_up');
  });

  it('detects attached document vs image questions', () => {
    expect(cat('[File Attached: notes.pdf] summarize this')).not.toBe('summary'); // file marker wins first
    expect(a.analyze(input('[File Attached: notes.pdf] what does page 2 say')).category).toBe('document_question');
    expect(a.analyze(input('[File Attached: diagram.png] explain this image')).category).toBe('image_explanation');
  });

  it('every result carries a confidence in [0,1]', () => {
    const r = a.analyze(input('explain quantum tunneling'));
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

describe('ComplexityAnalyzer — 1..5 scoring', () => {
  const c = new ComplexityAnalyzer();
  it('scores by category base (normal-length queries)', () => {
    expect(c.score(input('hello there'), 'greeting').level).toBe(1);
    expect(c.score(input('what is the definition of inertia'), 'definition').level).toBe(2);
    expect(c.score(input('explain how photosynthesis works in plants'), 'concept_explanation').level).toBe(3);
    expect(c.score(input('solve this physics problem for me'), 'problem_solving').level).toBe(4);
    expect(c.score(input('research the latest advances in fusion energy'), 'research').level).toBe(5);
  });
  it('bumps complexity for reasoning markers', () => {
    const base = c.score(input('explain entropy'), 'concept_explanation').level;
    const harder = c.score(input('derive the entropy equation step by step from first principles'), 'concept_explanation').level;
    expect(harder).toBeGreaterThan(base);
  });
  it('always returns 1..5', () => {
    for (const cat of ['greeting', 'research', 'coding'] as QueryCategory[]) {
      const lvl = c.score(input('x'), cat).level;
      expect(lvl).toBeGreaterThanOrEqual(1);
      expect(lvl).toBeLessThanOrEqual(5);
    }
  });
});

describe('RetrievalRouter — adaptive retrieval matrix', () => {
  const r = new RetrievalRouter();
  it('routes categories to strategies', () => {
    expect(r.route('greeting')).toBe('none');
    expect(r.route('definition')).toBe('vector');
    expect(r.route('concept_explanation')).toBe('graphrag');
    expect(r.route('problem_solving')).toBe('graphrag_reasoning');
    expect(r.route('research')).toBe('graph_web');
  });
  it('falls back to non-notebook strategy when no notebook attached', () => {
    expect(r.route('notebook_search', { hasNotebook: false })).toBe('vector');
    expect(r.route('notebook_search', { hasNotebook: true })).toBe('notebook');
    expect(r.route('revision', { hasNotebook: false })).toBe('graphrag');
  });
});

describe('WorkflowRouter + ModelRouter', () => {
  it('maps categories to workflows with a profile', () => {
    const wf = new WorkflowRouter().route('problem_solving');
    expect(wf.name).toBe('problem_solving');
    expect(wf.retrievalStrategy).toBe('graphrag_reasoning');
    expect(wf.verification).toBe('full');
  });
  it('routes model tier by complexity and maps to a provider token', () => {
    const m = new ModelRouter();
    expect(m.route({ category: 'definition', complexity: 2 }).tier).toBe('fast');
    expect(m.route({ category: 'concept_explanation', complexity: 3 }).tier).toBe('balanced');
    expect(m.route({ category: 'research', complexity: 5 }).providerToken).toBe('ReasoningProvider');
    expect(m.route({ category: 'concept_explanation', complexity: 5, providerHealthy: false }).tier).toBe('fast');
  });
});

describe('IntelligenceService — ExecutionPlan', () => {
  const svc = new IntelligenceService();

  it('produces a coherent plan for a concept question', () => {
    const plan = svc.plan(input('explain how neural networks learn'));
    expect(plan.source).toBe('intelligence');
    expect(plan.category).toBe('concept_explanation');
    expect(plan.retrievalStrategy).toBe('graphrag');
    expect(plan.workflow.name).toBe('concept');
    expect(plan.estimatedLatencyMs).toBeGreaterThan(0);
  });

  it('marks stable categories as cacheable and volatile ones as not', () => {
    expect(svc.plan(input('define osmosis')).cachePolicy.cacheable).toBe(true);
    expect(svc.plan(input('hello')).cachePolicy.cacheable).toBe(false);
    expect(svc.plan(input('latest research on fusion')).cachePolicy.cacheable).toBe(false);
  });

  it('defaultPlan reproduces today\'s pipeline (behavior-preserving)', () => {
    const plan = svc.defaultPlan(input('anything'));
    expect(plan.source).toBe('default');
    expect(plan.retrievalStrategy).toBe('graphrag');
    expect(plan.workflow.name).toBe('concept');
    expect(plan.model.providerToken).toBe('ReasoningProvider');
  });
});
