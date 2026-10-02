import { routeGoal } from '../../../src/agents/runtime/GoalRouter';

describe('GoalRouter', () => {
  it.each([
    ['What is osmosis?', 'ANSWER'],
    ['Explain photosynthesis', 'EXPLAIN'],
    ['Why is the sky blue', 'ANSWER'],
  ])('keeps questions in chat: %s', (msg, intent) => {
    const d = routeGoal(msg);
    expect(d.mode).toBe('chat');
    expect(d.intent).toBe(intent);
    expect(d.agentCandidate).toBe(false);
  });

  it.each([
    ['Create flashcards for photosynthesis', 'CREATE_ARTIFACT'],
    ['Prepare me for NEET Biology chapter 5', 'STUDY_PLAN'],
  ])('recognises goals that have no workflow yet and keeps them in chat honestly: %s', (msg, intent) => {
    const d = routeGoal(msg);
    expect(d.intent).toBe(intent);
    expect(d.agentCandidate).toBe(true);
    expect(d.mode).toBe('chat');
    expect(d.reason).toMatch(/no agent workflow/);
  });

  it('routes an exam overview request to the exam_overview workflow', () => {
    const d = routeGoal('Give me an overview of the SSC CGL exam');
    expect(d).toMatchObject({ mode: 'agent', workflowId: 'exam_overview', intent: 'EXAM_OVERVIEW' });
  });

  it('leaves a plain syllabus question in chat unless the student chose Agent mode', () => {
    expect(routeGoal('What is the SSC CGL syllabus?').mode).toBe('chat');
    expect(routeGoal('What is the SSC CGL syllabus?', { explicitAgent: true })).toMatchObject({
      mode: 'agent',
      workflowId: 'exam_overview',
    });
  });

  it('does not treat artifact requests about an exam as an overview', () => {
    const d = routeGoal('Create revision notes for the SSC CGL syllabus');
    expect(d.intent).toBe('CREATE_ARTIFACT');
    expect(d.workflowId).toBeUndefined();
  });

  it('handles empty input', () => {
    expect(routeGoal('').mode).toBe('chat');
  });

  it.each([
    'Brief me on Laws of Motion, Class 11 Physics',
    'What’s in Chapter 4 of Class 11 Physics?',
    'Give me an overview of the NCERT Class 10 Science chapter on acids and bases',
    'Tell me about the Class 12 Chemistry electrochemistry chapter',
  ])('routes a curriculum chapter request to the chapter_briefing workflow: %s', (msg) => {
    expect(routeGoal(msg)).toMatchObject({ mode: 'agent', workflowId: 'chapter_briefing', intent: 'CHAPTER_BRIEFING' });
  });

  it('keeps a plain chapter question in chat unless the student chose Agent mode', () => {
    expect(routeGoal('What is Newton’s third law?').mode).toBe('chat');
    expect(routeGoal('Laws of Motion Class 11 Physics', { explicitAgent: true })).toMatchObject({
      mode: 'agent',
      workflowId: 'chapter_briefing',
    });
  });

  it.each([
    'Make a PDF on Laws of Motion, Class 11 Physics',
    'Create a printable handout for Class 10 Science chapter on acids',
    'Give me a one-pager for NCERT Class 12 Chemistry electrochemistry',
  ])('routes a chapter handout request to chapter_handout: %s', (msg) => {
    expect(routeGoal(msg)).toMatchObject({ mode: 'agent', workflowId: 'chapter_handout', intent: 'CHAPTER_HANDOUT' });
  });

  it('keeps a formula chart or notes PDF out of the handout workflow', () => {
    expect(routeGoal('Make a formula chart PDF for Class 11 Physics Laws of Motion').intent).toBe('FORMULA_CHART');
    // Notes on a chapter are their own workflow (Phase 6), not the handout.
    expect(routeGoal('Make revision notes PDF for Class 11 Physics Laws of Motion')).toMatchObject({ intent: 'CHAPTER_NOTES', workflowId: 'chapter_revision_notes' });
    expect(routeGoal('Make a PDF of the SSC CGL syllabus').workflowId).toBeUndefined();
  });

  it('leaves chapter-shaped artifact and test requests to their own workflows', () => {
    expect(routeGoal('Make a formula chart for Class 11 Physics Laws of Motion').intent).toBe('FORMULA_CHART');
    expect(routeGoal('Give me a 20-question quiz on Class 11 Physics Laws of Motion').intent).toBe('QUESTION_SET');
    expect(routeGoal('Make a study plan for Class 11 Physics over 30 days').intent).toBe('STUDY_PLAN');
  });

  // The brief's acceptance test, word for word.
  it('routes the acceptance-test goal to the formula chart', () => {
    expect(routeGoal('Prepare a formula chart for Class 11 Physics Laws of Motion.')).toMatchObject({
      mode: 'agent',
      workflowId: 'formula_chart',
      intent: 'FORMULA_CHART',
    });
    expect(routeGoal('Give me all the formulas of Class 11 Physics Laws of Motion').workflowId).toBe('formula_chart');
  });

  it('routes "flashcards from this formula chart" to reuse the chart, not to a new one', () => {
    expect(routeGoal('Create flashcards from this formula chart.')).toMatchObject({
      mode: 'agent',
      workflowId: 'flashcards_from_artifact',
      intent: 'FLASHCARDS_FROM_ARTIFACT',
    });
    expect(routeGoal('Make flashcards from it').workflowId).toBe('flashcards_from_artifact');
  });

  // The rest of the brief's acceptance test (§60), word for word, and golden case 3.
  it.each([
    ['Create a 20-question quiz from it.', 'quiz_from_artifact', 'QUIZ_FROM_ARTIFACT'],
    ['Make a quiz from this formula chart', 'quiz_from_artifact', 'QUIZ_FROM_ARTIFACT'],
    ['Analyze my quiz mistakes and tell me what I should revise.', 'quiz_mistake_analysis', 'QUIZ_MISTAKES'],
    ['What did I get wrong? Show my mistakes', 'quiz_mistake_analysis', 'QUIZ_MISTAKES'],
    ['Create a revision plan for those weak areas.', 'revision_plan', 'REVISION_PLAN'],
    ['Make a 7-day revision plan', 'revision_plan', 'REVISION_PLAN'],
    ['Analyze my last 5 tests and create a revision plan.', 'tests_analysis', 'TESTS_ANALYSIS'],
    ['Analyze my last 5 tests and tell me what to revise', 'tests_analysis', 'TESTS_ANALYSIS'],
    ['What are my weak areas?', 'tests_analysis', 'TESTS_ANALYSIS'],
    ['Quiz me on my weak areas', 'weak_area_quiz', 'WEAK_AREA_QUIZ'],
  ])('routes the learning loop: %s', (msg, workflowId, intent) => {
    expect(routeGoal(msg)).toMatchObject({ mode: 'agent', workflowId, intent });
  });

  it('does not mistake a new question set, or a whole-exam plan, for the learning loop', () => {
    // Questions on a named chapter are a new set, not a quiz from the student's chart.
    expect(routeGoal('Create 20 questions from the Laws of Motion chapter').workflowId).not.toBe('quiz_from_artifact');
    expect(routeGoal('Create 30 NEET Biology questions from Cell Structure.').workflowId).not.toBe('quiz_from_artifact');
    // A plan for a whole exam is the personal agent's job (Phase 7), not the weak-area revision plan.
    expect(routeGoal('Make a revision plan for SSC CGL').workflowId).toBe('exam_prep');
    expect(routeGoal('Prepare me for SSC CGL in 90 days').workflowId).toBe('exam_prep');
  });

  it('keeps flashcards on a topic (nothing to reuse) as an unbuilt workflow', () => {
    const d = routeGoal('Create flashcards for photosynthesis');
    expect(d.intent).toBe('CREATE_ARTIFACT');
    expect(d.workflowId).toBeUndefined();
  });
});

