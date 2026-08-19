import {
  answersMatch, gradeBaselineResponse, gradeBaselineSubmission,
} from '../../src/services/baselineGrading';

/**
 * The central property: the SERVER decides correctness from its own persisted question set, and
 * the client's `isCorrect` is never consulted — not even as a fallback.
 */

const QUESTIONS: any[] = [
  { id: 'q1', subject: 'Physics', topic: 'Kinematics', difficulty: 'Easy', correctAnswer: 'Velocity' },
  { id: 'q2', subject: 'Maths', topic: 'Algebra', difficulty: 'Medium', correctAnswer: 5 },
  { id: 'q3', subject: 'Chemistry', topic: 'Reactions', difficulty: 'Easy', correctAnswer: 'Respiration' },
  { id: 'q4', subject: 'Maths', topic: 'Calculus', difficulty: 'Hard' }, // no answer key
];

describe('answersMatch', () => {
  it('is case- and whitespace-insensitive (preserving prior client semantics)', () => {
    expect(answersMatch('Velocity', ' velocity ')).toBe(true);
    expect(answersMatch('Velocity', 'VELOCITY')).toBe(true);
  });
  it('compares numerically when both sides are numeric', () => {
    expect(answersMatch(5, '5')).toBe(true);
    expect(answersMatch(5, '5.0')).toBe(true);
    expect(answersMatch(5, '6')).toBe(false);
  });
  it('rejects empty and nullish answers', () => {
    expect(answersMatch('Velocity', '')).toBe(false);
    expect(answersMatch('Velocity', null)).toBe(false);
    expect(answersMatch(null, 'Velocity')).toBe(false);
  });
});

describe('ADVERSARIAL: client isCorrect must be ignored', () => {
  it('client claims CORRECT but the answer is wrong → server says false', () => {
    const g = gradeBaselineResponse(
      { questionId: 'q1', userAnswer: 'Distance', isCorrect: true }, QUESTIONS,
    );
    expect(g.correct).toBe(false);
    expect(g.graded).toBe(true);
    expect(g.reason).toBe('INCORRECT');
  });

  it('client claims INCORRECT but the answer is right → server says true', () => {
    const g = gradeBaselineResponse(
      { questionId: 'q1', userAnswer: 'Velocity', isCorrect: false }, QUESTIONS,
    );
    expect(g.correct).toBe(true);
    expect(g.reason).toBe('CORRECT');
  });

  it('a submission of all-lies grades to the truth', () => {
    const s = gradeBaselineSubmission([
      { questionId: 'q1', userAnswer: 'Distance', isCorrect: true },     // actually wrong
      { questionId: 'q2', userAnswer: 5, isCorrect: false },             // actually right
      { questionId: 'q3', userAnswer: 'Photosynthesis', isCorrect: true }, // actually wrong
    ], QUESTIONS);
    expect(s.correctCount).toBe(1);   // not the 2 the client claimed
    expect(s.attempted).toBe(3);
    expect(s.accuracyPct).toBe(33);
  });
});

describe('question ownership', () => {
  it('rejects a questionId that is not in this session', () => {
    const g = gradeBaselineResponse({ questionId: 'q_not_mine', userAnswer: 'x', isCorrect: true }, QUESTIONS);
    expect(g.graded).toBe(false);
    expect(g.reason).toBe('QUESTION_NOT_IN_SESSION');
    expect(g.correct).toBe(false);
  });

  it('an unknown question is NOT counted as an incorrect answer', () => {
    const s = gradeBaselineSubmission([{ questionId: 'nope', userAnswer: 'x' }], QUESTIONS);
    expect(s.attempted).toBe(0);      // not gradeable, so not an attempt
    expect(s.ungradable).toBe(1);
    expect(s.accuracyPct).toBeNull(); // no fabricated 0%
  });

  it('rejects a missing/blank questionId', () => {
    expect(gradeBaselineResponse({ userAnswer: 'x' }, QUESTIONS).reason).toBe('QUESTION_NOT_IN_SESSION');
    expect(gradeBaselineResponse({ questionId: '', userAnswer: 'x' }, QUESTIONS).reason).toBe('QUESTION_NOT_IN_SESSION');
  });

  it('refuses to grade a question with no answer key rather than marking it wrong', () => {
    const g = gradeBaselineResponse({ questionId: 'q4', userAnswer: 'anything' }, QUESTIONS);
    expect(g.graded).toBe(false);
    expect(g.reason).toBe('NO_ANSWER_KEY');
  });
});

describe('skips', () => {
  it('treats an absent answer as skipped, not incorrect', () => {
    const g = gradeBaselineResponse({ questionId: 'q1', userAnswer: '' }, QUESTIONS);
    expect(g.skipped).toBe(true);
    expect(g.graded).toBe(false);
    expect(g.reason).toBe('SKIPPED');
  });

  it('skips do not inflate attempts', () => {
    const s = gradeBaselineSubmission([
      { questionId: 'q1', userAnswer: 'Velocity' },
      { questionId: 'q2', userAnswer: null },
      { questionId: 'q3', userAnswer: undefined },
    ], QUESTIONS);
    expect(s.attempted).toBe(1);
    expect(s.skipped).toBe(2);
    expect(s.correctCount).toBe(1);
    expect(s.accuracyPct).toBe(100); // over graded attempts only
  });
});

describe('denominator', () => {
  it('totalQuestions comes from the SERVED assessment, not the responses', () => {
    const s = gradeBaselineSubmission([{ questionId: 'q1', userAnswer: 'Velocity' }], QUESTIONS);
    expect(s.totalQuestions).toBe(4); // the assessment
    expect(s.attempted).toBe(1);      // what the student actually did
  });

  it('an EMPTY submission does not fabricate a denominator of 20', () => {
    const s = gradeBaselineSubmission([], QUESTIONS);
    expect(s.totalQuestions).toBe(4);
    expect(s.attempted).toBe(0);
    expect(s.correctCount).toBe(0);
    expect(s.accuracyPct).toBeNull(); // NOT 0% — nothing was measured
  });

  it('an empty session yields zero total rather than a guess', () => {
    const s = gradeBaselineSubmission([{ questionId: 'q1', userAnswer: 'x' }], []);
    expect(s.totalQuestions).toBe(0);
    expect(s.attempted).toBe(0);
    expect(s.accuracyPct).toBeNull();
  });
});

describe('determinism', () => {
  it('grading the same submission twice yields identical results', () => {
    const input = [
      { questionId: 'q1', userAnswer: 'Velocity' },
      { questionId: 'q2', userAnswer: '5' },
      { questionId: 'q3', userAnswer: 'Wrong' },
    ];
    const a = gradeBaselineSubmission(input, QUESTIONS);
    const b = gradeBaselineSubmission(input, QUESTIONS);
    expect(a.correctCount).toBe(b.correctCount);
    expect(a.accuracyPct).toBe(b.accuracyPct);
    expect(a.correctCount).toBe(2);
  });
});
