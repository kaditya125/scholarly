/**
 * Coverage for the answer-key validation added to RemediationDrillService: a structural check
 * (validateStructure) and an independent LLM verification pass (verifyAnswers) sit between "the
 * LLM wrote something" and "a student sees an authoritative answer key" — this is the check that
 * was entirely absent before (correctAnswerIndex used to be trusted verbatim from generation).
 */
const mockGenerate = jest.fn();

jest.mock('../../src/services/ai/gemini.provider', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({
    generateResponse: (...args: any[]) => mockGenerate(...args),
  })),
}));

const mockCreateFromQuestions = jest.fn();
jest.mock('../../src/services/tests/quizAttempts.service', () => ({
  quizAttemptsService: { createFromQuestions: (...args: any[]) => mockCreateFromQuestions(...args) },
}));

import { RemediationDrillService } from '../../src/services/pedagogy/remediationDrill.service';
import { PedagogicalDiagnostic } from '../../src/types/quizAttempt.types';

const diagnostic: PedagogicalDiagnostic = {
  topic: 'Rotational Dynamics & Moment of Inertia',
  accuracy: 35,
  rootCauseConceptId: 'center_of_mass',
  rootCauseTitle: 'Center of Mass & Linear Momentum',
  rootCauseChapter: 'Chapter 9 (Center of Mass & Collision)',
  prerequisiteChain: [],
  diagnosticMessage: 'You scored 35%... underlying issue is Center of Mass.',
  recommendedAction: 'Review COM formulas.',
};

const geminiJson = (payload: unknown) => ({ reply: JSON.stringify(payload) });

const validRawQuestion = (overrides: Partial<Record<string, unknown>> = {}) => ({
  text: 'A shell explodes mid-flight into two fragments. What path does the center of mass follow?',
  options: ['The original parabolic trajectory', 'A straight line', 'It stops', 'A steeper parabola'],
  correctAnswerIndex: 0,
  explanation: 'No external force changes at the instant of explosion, so COM motion is unaffected.',
  ...overrides,
});

const matchingVerdict = (index: number, correctAnswerIndex: number) => ({
  index,
  unambiguous: true,
  correctAnswerIndex,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateFromQuestions.mockResolvedValue({ id: 'qa_test123', title: 'Remediation Drill: Center of Mass & Linear Momentum' });
});

describe('RemediationDrillService.validateStructure (structural check)', () => {
  const service: any = new RemediationDrillService();

  test('accepts a well-formed question', () => {
    const result = service.validateStructure(validRawQuestion());
    expect(result).not.toBeNull();
    expect(result.options).toHaveLength(4);
    expect(result.correctAnswerIndex).toBe(0);
  });

  test('rejects a malformed options array (fewer than 4 options)', () => {
    const result = service.validateStructure(validRawQuestion({ options: ['A', 'B', 'C'] }));
    expect(result).toBeNull();
  });

  test('rejects a malformed options array (more than 4 options)', () => {
    const result = service.validateStructure(validRawQuestion({ options: ['A', 'B', 'C', 'D', 'E'] }));
    expect(result).toBeNull();
  });

  test('rejects duplicate options (case-insensitive)', () => {
    const result = service.validateStructure(validRawQuestion({ options: ['Same answer', 'B', 'C', 'same answer'] }));
    expect(result).toBeNull();
  });

  test('rejects an out-of-range correctAnswerIndex', () => {
    expect(service.validateStructure(validRawQuestion({ correctAnswerIndex: 4 }))).toBeNull();
    expect(service.validateStructure(validRawQuestion({ correctAnswerIndex: -1 }))).toBeNull();
  });

  test('rejects a non-integer correctAnswerIndex', () => {
    expect(service.validateStructure(validRawQuestion({ correctAnswerIndex: 1.5 }))).toBeNull();
    expect(service.validateStructure(validRawQuestion({ correctAnswerIndex: '0' }))).toBeNull();
    expect(service.validateStructure(validRawQuestion({ correctAnswerIndex: undefined }))).toBeNull();
  });

  test('rejects a missing/empty question text', () => {
    expect(service.validateStructure(validRawQuestion({ text: '' }))).toBeNull();
    expect(service.validateStructure(validRawQuestion({ text: undefined }))).toBeNull();
  });

  test('accepts boundary indices 0 and 3', () => {
    expect(service.validateStructure(validRawQuestion({ correctAnswerIndex: 0 }))).not.toBeNull();
    expect(service.validateStructure(validRawQuestion({ correctAnswerIndex: 3 }))).not.toBeNull();
  });
});

describe('RemediationDrillService.verifyAnswers (independent LLM verification pass)', () => {
  const service: any = new RemediationDrillService();
  const q1 = service.validateStructure(validRawQuestion());

  test('keeps a question when the verifier independently confirms the same answer', async () => {
    mockGenerate.mockResolvedValueOnce(geminiJson([matchingVerdict(0, 0)]));
    const kept = await service.verifyAnswers([q1], 'Center of Mass & Linear Momentum');
    expect(kept).toHaveLength(1);
  });

  test('drops a question when the verifier derives a different correct answer (answer-key mismatch)', async () => {
    mockGenerate.mockResolvedValueOnce(geminiJson([{ index: 0, unambiguous: true, correctAnswerIndex: 2 }]));
    const kept = await service.verifyAnswers([q1], 'Center of Mass & Linear Momentum');
    expect(kept).toHaveLength(0);
  });

  test('drops a question the verifier flags as ambiguous, even if the index matches', async () => {
    mockGenerate.mockResolvedValueOnce(geminiJson([{ index: 0, unambiguous: false, correctAnswerIndex: 0 }]));
    const kept = await service.verifyAnswers([q1], 'Center of Mass & Linear Momentum');
    expect(kept).toHaveLength(0);
  });

  test('drops a question with no returned verdict at all', async () => {
    mockGenerate.mockResolvedValueOnce(geminiJson([]));
    const kept = await service.verifyAnswers([q1], 'Center of Mass & Linear Momentum');
    expect(kept).toHaveLength(0);
  });

  test('fails closed (drops the whole batch) when the verification call itself errors', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('Gemini API unavailable'));
    const kept = await service.verifyAnswers([q1], 'Center of Mass & Linear Momentum');
    expect(kept).toHaveLength(0);
  });

  test('fails closed when the verifier returns unparseable JSON', async () => {
    mockGenerate.mockResolvedValueOnce({ reply: 'not json at all' });
    const kept = await service.verifyAnswers([q1], 'Center of Mass & Linear Momentum');
    expect(kept).toHaveLength(0);
  });

  test('returns [] immediately for an empty input without calling Gemini', async () => {
    const kept = await service.verifyAnswers([], 'Center of Mass & Linear Momentum');
    expect(kept).toHaveLength(0);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe('RemediationDrillService.generateDrillForDiagnostic (end-to-end persistence)', () => {
  const service = new RemediationDrillService();

  test('persists only verified questions — a mismatched answer key never reaches quiz_attempts', async () => {
    // Generation attempt 1: 3 raw questions, one with a verifier-mismatched answer.
    mockGenerate.mockResolvedValueOnce(geminiJson([
      validRawQuestion({ text: 'Q1: valid and will verify clean' }),
      validRawQuestion({ text: 'Q2: generator claims index 0 but verifier disagrees', correctAnswerIndex: 0 }),
      validRawQuestion({ text: 'Q3: valid and will verify clean' }),
    ]));
    // Verification pass over those 3: Q2's claimed answer (0) doesn't match the verifier's
    // independently-derived answer (2) — Q1 and Q3 verify clean.
    mockGenerate.mockResolvedValueOnce(geminiJson([
      matchingVerdict(0, 0),
      { index: 1, unambiguous: true, correctAnswerIndex: 2 },
      matchingVerdict(2, 0),
    ]));
    // Retry attempt to backfill toward 3: only 1 more question is requested (since 2 already
    // survived), and it verifies clean.
    mockGenerate.mockResolvedValueOnce(geminiJson([
      validRawQuestion({ text: 'Q4: backfilled and will verify clean' }),
    ]));
    mockGenerate.mockResolvedValueOnce(geminiJson([matchingVerdict(0, 0)]));

    const result = await service.generateDrillForDiagnostic('user-1', diagnostic);

    expect(result).not.toBeNull();
    expect(result!.totalQuestions).toBe(3);
    expect(mockCreateFromQuestions).toHaveBeenCalledTimes(1);

    const [, persistedQuestions] = mockCreateFromQuestions.mock.calls[0];
    expect(persistedQuestions).toHaveLength(3);
    // The mismatched question's text must never appear among what was persisted.
    expect(persistedQuestions.some((q: any) => q.text.startsWith('Q2:'))).toBe(false);
    persistedQuestions.forEach((q: any) => {
      expect(q.correctAnswerIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctAnswerIndex).toBeLessThanOrEqual(3);
      expect(q.options).toHaveLength(4);
    });
  });

  test('ships fewer than 3 questions rather than padding with an unverified one', async () => {
    // Attempt 1: 1 valid question, verifies clean.
    mockGenerate.mockResolvedValueOnce(geminiJson([validRawQuestion({ text: 'Only survivor' })]));
    mockGenerate.mockResolvedValueOnce(geminiJson([matchingVerdict(0, 0)]));
    // Retry attempt: the backfill question fails verification (ambiguous).
    mockGenerate.mockResolvedValueOnce(geminiJson([validRawQuestion({ text: 'Retry candidate' })]));
    mockGenerate.mockResolvedValueOnce(geminiJson([{ index: 0, unambiguous: false, correctAnswerIndex: 0 }]));

    const result = await service.generateDrillForDiagnostic('user-1', diagnostic);

    expect(result).not.toBeNull();
    expect(result!.totalQuestions).toBe(1);
    const [, persistedQuestions] = mockCreateFromQuestions.mock.calls[0];
    expect(persistedQuestions).toHaveLength(1);
    expect(persistedQuestions[0].text).toBe('Only survivor');
  });

  test('returns null and never persists when nothing survives validation across both attempts', async () => {
    // Attempt 1: structurally invalid (bad index).
    mockGenerate.mockResolvedValueOnce(geminiJson([validRawQuestion({ correctAnswerIndex: 9 })]));
    // Attempt 2 (retry): generation itself fails.
    mockGenerate.mockRejectedValueOnce(new Error('Gemini API unavailable'));

    const result = await service.generateDrillForDiagnostic('user-1', diagnostic);

    expect(result).toBeNull();
    expect(mockCreateFromQuestions).not.toHaveBeenCalled();
  });
});
