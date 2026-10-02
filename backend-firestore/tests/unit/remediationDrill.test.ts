/**
 * Checkpoint 6 — "Fix this gap": on-demand, owned, metered, verified, persisted, idempotent.
 */
const mockRepo = {
  claimRemediation: jest.fn(),
  attachRemediationDrill: jest.fn(),
  releaseRemediationClaim: jest.fn().mockResolvedValue(undefined),
};
const mockAttempts = { createFromQuestions: jest.fn() };
const mockUsage = { checkQuota: jest.fn(), consumeQuota: jest.fn().mockResolvedValue({}) };
jest.mock('../../src/repositories/quizAttempts.repository', () => ({ quizAttemptsRepository: mockRepo, REMEDIATION_CLAIM_TTL_MS: 120000 }));
jest.mock('../../src/services/tests/quizAttempts.service', () => ({ quizAttemptsService: mockAttempts }));
jest.mock('../../src/services/usage.service', () => ({ usageService: mockUsage }));
jest.mock('../../src/services/ai/gemini.provider', () => ({ GeminiProvider: jest.fn(() => ({ generateResponse: jest.fn() })) }));

import { RemediationDrillService, RemediationError, REMEDIATION_METERED_FEATURE } from '../../src/services/pedagogy/remediationDrill.service';
import { ConceptGraphService } from '../../src/services/pedagogy/conceptGraph.service';
import type { PedagogicalDiagnostic } from '../../src/types/quizAttempt.types';

const g = new ConceptGraphService();
const row = (topic: string, correct: number, total: number) => ({
  topic, correct, incorrect: total - correct, unattempted: 0, total, accuracy: Math.round((correct / total) * 100), examId: 'JEE_MAIN',
});
const rootCauseDiag = (): PedagogicalDiagnostic => g.diagnoseAttempt([row('Rotational Dynamics', 1, 5), row('Vectors', 1, 5)])![0];
const unassessedDiag = (): PedagogicalDiagnostic => g.diagnoseAttempt([row('Rotational Dynamics', 1, 5)])![0];

/** An LLM that writes `n` valid questions per call and a verifier that agrees with every one. */
function honestLlm() {
  let k = 0;
  return {
    generateResponse: jest.fn(async (msgs: any[]) => {
      const prompt: string = msgs[0].content;
      if (prompt.includes('answer-key auditor')) {
        const start = prompt.indexOf('Questions:') + 'Questions:'.length;
        const qs = JSON.parse(prompt.slice(start, prompt.lastIndexOf('For each')).trim());
        return { reply: JSON.stringify(qs.map((q: any) => ({ index: q.index, unambiguous: true, correctAnswerIndex: 1 }))) };
      }
      const n = Number(/Write exactly (\d+)/.exec(prompt)![1]);
      return { reply: JSON.stringify(Array.from({ length: n }, () => ({
        text: `Question ${++k} about the concept?`, options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 1, explanation: 'Because B.', difficulty: 'medium',
      }))) };
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo.releaseRemediationClaim.mockResolvedValue(undefined);
  mockUsage.checkQuota.mockResolvedValue({ allowed: true, limit: 50, used: 1, resetsAt: 0 });
  mockUsage.consumeQuota.mockResolvedValue({});
  mockAttempts.createFromQuestions.mockImplementation(async (_u: string, qs: any[], meta: any) => ({ id: 'qa_drill', createdAt: '2026-10-02T00:00:00Z', title: meta.title, questions: qs }));
  mockRepo.attachRemediationDrill.mockImplementation(async (_u: string, _a: string, _d: string, drill: any) => drill);
});

describe('generateForDiagnostic', () => {
  it('creates a 3-question drill on the ROOT-CAUSE concept, persists it, and meters it', async () => {
    const d = rootCauseDiag();
    mockRepo.claimRemediation.mockResolvedValue({ status: 'CLAIMED', diagnostic: d, attempt: {} });
    const svc = new RemediationDrillService(honestLlm());
    const out = await svc.generateForDiagnostic('u1', 'qa_src', d.id);

    expect(out.status).toBe('CREATED');
    const [userId, questions, meta] = mockAttempts.createFromQuestions.mock.calls[0];
    expect(userId).toBe('u1');
    expect(questions).toHaveLength(3);
    expect(questions.every((q: any) => q.topic === 'Vectors & Vector Algebra' && q.examId === 'JEE_MAIN' && q.difficulty === 'medium')).toBe(true);
    expect(meta.remediationSource).toEqual({ attemptId: 'qa_src', diagnosticId: d.id, kind: 'ROOT_CAUSE' });
    expect(mockRepo.attachRemediationDrill).toHaveBeenCalledWith('u1', 'qa_src', d.id, expect.objectContaining({
      drillAttemptId: 'qa_drill', kind: 'ROOT_CAUSE', targetConceptIds: ['vectors'], targetConcept: 'Vectors & Vector Algebra', questionCount: 3,
    }));
    expect(mockUsage.consumeQuota).toHaveBeenCalledWith('u1', REMEDIATION_METERED_FEATURE, 1);
    expect(mockRepo.releaseRemediationClaim).not.toHaveBeenCalled();
  });

  it('a prerequisite check spreads 3 questions across the unassessed prerequisites', async () => {
    const d = unassessedDiag();
    mockRepo.claimRemediation.mockResolvedValue({ status: 'CLAIMED', diagnostic: d, attempt: {} });
    const svc = new RemediationDrillService(honestLlm());
    const plan = svc.planTargets(d);
    expect(plan.kind).toBe('PREREQUISITE_CHECK');
    expect(plan.targets.reduce((s, t) => s + t.count, 0)).toBe(3);
    expect(plan.targets.map((t) => t.conceptId)).not.toContain('rotational_dynamics');
    await svc.generateForDiagnostic('u1', 'qa_src', d.id);
    expect(mockAttempts.createFromQuestions.mock.calls[0][1]).toHaveLength(3);
  });

  it('returns the existing drill without generating again (duplicate click)', async () => {
    const drill = { drillAttemptId: 'qa_old' };
    mockRepo.claimRemediation.mockResolvedValue({ status: 'EXISTS', drill });
    const llm = honestLlm();
    const out = await new RemediationDrillService(llm).generateForDiagnostic('u1', 'qa_src', 'diag_x');
    expect(out).toEqual({ status: 'EXISTS', drill });
    expect(llm.generateResponse).not.toHaveBeenCalled();
    expect(mockAttempts.createFromQuestions).not.toHaveBeenCalled();
  });

  it.each([
    ['NOT_FOUND', 404, 'NOT_FOUND'],
    ['NO_DIAGNOSTIC', 404, 'DIAGNOSTIC_NOT_FOUND'],
    ['IN_PROGRESS', 409, 'REMEDIATION_IN_PROGRESS'],
  ])('claim %s → %d %s, no generation', async (status, http, code) => {
    mockRepo.claimRemediation.mockResolvedValue({ status });
    const llm = honestLlm();
    await expect(new RemediationDrillService(llm).generateForDiagnostic('u1', 'qa', 'diag_x')).rejects.toMatchObject({ status: http, code });
    expect(llm.generateResponse).not.toHaveBeenCalled();
  });

  it('quota exhausted → 403 QUOTA_EXCEEDED, claim released, nothing generated', async () => {
    const d = rootCauseDiag();
    mockRepo.claimRemediation.mockResolvedValue({ status: 'CLAIMED', diagnostic: d, attempt: {} });
    mockUsage.checkQuota.mockResolvedValue({ allowed: false, limit: 50, used: 50, resetsAt: 123 });
    const llm = honestLlm();
    await expect(new RemediationDrillService(llm).generateForDiagnostic('u1', 'qa', d.id)).rejects.toMatchObject({ status: 403, code: 'QUOTA_EXCEEDED' });
    expect(llm.generateResponse).not.toHaveBeenCalled();
    expect(mockRepo.releaseRemediationClaim).toHaveBeenCalledWith('qa', d.id);
  });

  it('ineligible diagnosis → 422 DIAGNOSTIC_UNSUPPORTED', async () => {
    const d = { ...rootCauseDiag(), remediationEligible: false };
    mockRepo.claimRemediation.mockResolvedValue({ status: 'CLAIMED', diagnostic: d, attempt: {} });
    await expect(new RemediationDrillService(honestLlm()).generateForDiagnostic('u1', 'qa', d.id)).rejects.toMatchObject({ status: 422, code: 'DIAGNOSTIC_UNSUPPORTED' });
  });

  it('fails CLOSED when the verifier disagrees: nothing saved, no quota spent, claim released', async () => {
    const d = rootCauseDiag();
    mockRepo.claimRemediation.mockResolvedValue({ status: 'CLAIMED', diagnostic: d, attempt: {} });
    const llm = honestLlm();
    const inner = llm.generateResponse.getMockImplementation()!;
    llm.generateResponse.mockImplementation(async (msgs: any[]) => {
      const res: any = await inner(msgs);
      if (msgs[0].content.includes('answer-key auditor')) {
        res.reply = res.reply.replace(/"correctAnswerIndex":1/g, '"correctAnswerIndex":2'); // verifier derives a different key
      }
      return res;
    });
    await expect(new RemediationDrillService(llm).generateForDiagnostic('u1', 'qa', d.id))
      .rejects.toMatchObject({ status: 502, code: 'REMEDIATION_GENERATION_FAILED' });
    expect(mockAttempts.createFromQuestions).not.toHaveBeenCalled();
    expect(mockUsage.consumeQuota).not.toHaveBeenCalled();
    expect(mockRepo.releaseRemediationClaim).toHaveBeenCalledWith('qa', d.id);
  });

  it('a verifier outage drops the batch rather than trusting unverified keys', async () => {
    const svc = new RemediationDrillService({ generateResponse: jest.fn().mockRejectedValue(new Error('down')) });
    const kept = await svc.verifyAnswers([{ text: 't', options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 0, explanation: 'e', difficulty: 'easy' }], 'X');
    expect(kept).toEqual([]);
  });

  it('structural validation rejects malformed questions', () => {
    const svc = new RemediationDrillService(honestLlm());
    expect(svc.validateStructure({ text: 'q', options: ['a', 'a', 'b', 'c'], correctAnswerIndex: 0, explanation: 'e' })).toBeNull();
    expect(svc.validateStructure({ text: 'q', options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 4, explanation: 'e' })).toBeNull();
    expect(svc.validateStructure({ text: 'q', options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 1, explanation: '' })).toBeNull();
    expect(svc.validateStructure({ text: 'q', options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 1, explanation: 'e', difficulty: 'weird' })!.difficulty).toBe('medium');
  });
});

// ── Ported from the original suite (637de95c): validation and verification unit cases ─────────
describe('validateStructure (structural check)', () => {
  const svc = new RemediationDrillService(honestLlm());
  const ok = { text: 'Q?', options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 2, explanation: 'why' };
  it('accepts a well-formed question', () => expect(svc.validateStructure(ok)).toMatchObject({ text: 'Q?', correctAnswerIndex: 2 }));
  it('rejects fewer or more than 4 options', () => {
    expect(svc.validateStructure({ ...ok, options: ['a', 'b', 'c'] })).toBeNull();
    expect(svc.validateStructure({ ...ok, options: ['a', 'b', 'c', 'd', 'e'] })).toBeNull();
  });
  it('rejects duplicate options case-insensitively', () => expect(svc.validateStructure({ ...ok, options: ['a', 'A', 'c', 'd'] })).toBeNull());
  it('rejects out-of-range and non-integer indices', () => {
    expect(svc.validateStructure({ ...ok, correctAnswerIndex: -1 })).toBeNull();
    expect(svc.validateStructure({ ...ok, correctAnswerIndex: 1.5 })).toBeNull();
    expect(svc.validateStructure({ ...ok, correctAnswerIndex: '1' as any })).toBeNull();
  });
  it('rejects empty question text', () => expect(svc.validateStructure({ ...ok, text: '   ' })).toBeNull());
  it('accepts boundary indices 0 and 3', () => {
    expect(svc.validateStructure({ ...ok, correctAnswerIndex: 0 })).not.toBeNull();
    expect(svc.validateStructure({ ...ok, correctAnswerIndex: 3 })).not.toBeNull();
  });
});

describe('verifyAnswers (independent verification pass)', () => {
  const q = { text: 'Q?', options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 1, explanation: 'e', difficulty: 'easy' as const };
  const withVerdicts = (reply: string) => new RemediationDrillService({ generateResponse: jest.fn().mockResolvedValue({ reply }) });
  it('keeps a question the verifier confirms', async () =>
    expect(await withVerdicts('[{"index":0,"unambiguous":true,"correctAnswerIndex":1}]').verifyAnswers([q], 'X')).toHaveLength(1));
  it('drops an answer-key mismatch', async () =>
    expect(await withVerdicts('[{"index":0,"unambiguous":true,"correctAnswerIndex":2}]').verifyAnswers([q], 'X')).toEqual([]));
  it('drops an ambiguous question even when the index matches', async () =>
    expect(await withVerdicts('[{"index":0,"unambiguous":false,"correctAnswerIndex":1}]').verifyAnswers([q], 'X')).toEqual([]));
  it('drops a question with no verdict', async () =>
    expect(await withVerdicts('[]').verifyAnswers([q], 'X')).toEqual([]));
  it('fails closed on unparseable verifier JSON', async () =>
    expect(await withVerdicts('not json').verifyAnswers([q], 'X')).toEqual([]));
  it('returns [] for empty input without calling Gemini', async () => {
    const llm = { generateResponse: jest.fn() };
    expect(await new RemediationDrillService(llm).verifyAnswers([], 'X')).toEqual([]);
    expect(llm.generateResponse).not.toHaveBeenCalled();
  });
});
