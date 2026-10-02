/**
 * Checkpoint 5 wiring — quiz submission runs the prerequisite graph and persists the result on
 * the attempt; unsupported exams persist null (no invented diagnosis); history is used as evidence.
 */
const mockRepo = { getById: jest.fn(), update: jest.fn().mockResolvedValue(undefined), create: jest.fn() };
const mockStats = { getUserStats: jest.fn(), awardXP: jest.fn().mockResolvedValue(undefined) };
jest.mock('../../src/repositories/quizAttempts.repository', () => ({ quizAttemptsRepository: mockRepo }));
jest.mock('../../src/services/userStats.service', () => ({ UserStatsService: jest.fn(() => mockStats) }));
jest.mock('../../src/repositories/userStats.repository', () => ({ UserStatsRepository: jest.fn(() => ({ upsertUserStats: jest.fn().mockResolvedValue(undefined) })) }));
jest.mock('../../src/services/planner.service', () => ({ PlannerService: jest.fn(() => ({ addTask: jest.fn().mockResolvedValue(undefined) })) }));
jest.mock('../../src/core/events/EventBus', () => ({ eventBus: { publish: jest.fn().mockResolvedValue(undefined) } }));

import { QuizAttemptsService } from '../../src/services/tests/quizAttempts.service';

const q = (id: string, topic: string, examId: string) => ({ id, text: id, topic, options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 0, explanation: '', examId });
const attempt = (questions: any[]) => ({
  id: 'qa_1', userId: 'u1', title: 'T', source: 'topic', mode: 'exam', questions, totalQuestions: questions.length,
  durationMinutes: 30, positiveMark: 1, negativeMark: 0.25, status: 'in-progress', createdAt: '2026-10-01T00:00:00Z',
});
const wrongAll = (qs: any[]) => Object.fromEntries(qs.map((x) => [x.id, 1]));

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo.update.mockResolvedValue(undefined);
  mockStats.getUserStats.mockResolvedValue({ weakTopicDetails: [] });
});

it('JEE attempt: diagnosis is persisted on the attempt and summarised in feedback', async () => {
  const qs = [q('a', 'Rotational Dynamics', 'JEE_MAIN'), q('b', 'Rotational Dynamics', 'JEE_MAIN'), q('c', 'Vectors', 'JEE_MAIN'), q('d', 'Vectors', 'JEE_MAIN')];
  mockRepo.getById.mockResolvedValue(attempt(qs));
  const out = await new QuizAttemptsService().submitAttempt('u1', 'qa_1', { answers: wrongAll(qs) });
  const patch = mockRepo.update.mock.calls[0][1];
  const rd = patch.pedagogicalDiagnostics.find((d: any) => d.targetConceptId === 'rotational_dynamics');
  expect(rd).toMatchObject({ status: 'ROOT_CAUSE_IDENTIFIED', rootCauseConceptId: 'vectors', remediationEligible: true });
  expect(patch.feedback).toContain('Prerequisite check');
  expect(out.pedagogicalDiagnostics).toEqual(patch.pedagogicalDiagnostics); // returned to the client
});

it('SSC attempt with "Compound Interest" persists null — no Center of Mass, no invented diagnosis', async () => {
  const qs = [q('a', 'Compound Interest', 'SSC_CGL'), q('b', 'Computer Awareness', 'SSC_CGL')];
  mockRepo.getById.mockResolvedValue(attempt(qs));
  await new QuizAttemptsService().submitAttempt('u1', 'qa_1', { answers: wrongAll(qs) });
  const patch = mockRepo.update.mock.calls[0][1];
  expect(patch.pedagogicalDiagnostics).toBeNull();
  expect(patch.feedback).not.toMatch(/Center of Mass|Prerequisite check/);
});

it('a prerequisite measured weak in an EARLIER test (stored history) becomes the root cause', async () => {
  mockStats.getUserStats.mockResolvedValue({
    weakTopicDetails: [{ examId: 'JEE_MAIN', topicName: "Newton's Laws of Motion", attempts: 1, correct: 1, incorrect: 4, total: 5, accuracy: 20, confidence: 0.6 }],
  });
  const qs = [q('a', 'Rotational Dynamics', 'JEE_MAIN'), q('b', 'Rotational Dynamics', 'JEE_MAIN')];
  mockRepo.getById.mockResolvedValue(attempt(qs));
  await new QuizAttemptsService().submitAttempt('u1', 'qa_1', { answers: wrongAll(qs) });
  expect(mockRepo.update.mock.calls[0][1].pedagogicalDiagnostics[0].rootCauseConceptId).toBe('newtons_laws');
});

it('a diagnosis failure never fails the submission: scored, persisted, diagnostics left unset', async () => {
  mockStats.getUserStats.mockRejectedValue(new Error('firestore down'));
  const qs = [q('a', 'Rotational Dynamics', 'JEE_MAIN')];
  mockRepo.getById.mockResolvedValue(attempt(qs));
  const out = await new QuizAttemptsService().submitAttempt('u1', 'qa_1', { answers: wrongAll(qs) });
  expect(out.status).toBe('completed');
  expect(mockRepo.update.mock.calls[0][1].pedagogicalDiagnostics).toBeUndefined();
});
