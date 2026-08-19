/**
 * #92 — canonical question identity contract.
 *
 * The invariant under test: a generated question either carries an application-VALIDATED
 * canonical syllabus identity, or is explicitly UNANCHORED. There is no third state, and the
 * model never decides which.
 */

const nodes: any[] = [];
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          get: async () => ({ docs: nodes.map((n) => ({ data: () => n })) }),
          doc: (docId: string) => ({
            get: async () => {
              const f = nodes.find((n) => n.id.replace(/[:/]/g, '_') === docId);
              return { exists: !!f, data: () => f };
            },
          }),
        }),
      }),
    }),
  },
}));

// The model returns a DIFFERENT topic label than the selected node, on purpose: identity must
// come from the application regardless of what the LLM writes.
jest.mock('../../src/services/ai/gemini.provider', () => ({
  GeminiProvider: class {
    async generateResponse() {
      return {
        reply: JSON.stringify([
          {
            text: 'A quadratic question',
            topic: 'Quadratic Equations',           // deliberately NOT the node label
            options: ['a', 'b', 'c', 'd'],
            correctAnswerIndex: 1,
            explanation: 'because',
          },
          {
            text: 'Another one',
            topic: 'Totally Unrelated Topic',        // also ignored for identity
            options: ['a', 'b', 'c', 'd'],
            correctAnswer: 'a',
            explanation: 'because',
          },
        ]),
      };
    }
  },
}));
jest.mock('../../src/services/userStats.service', () => ({
  UserStatsService: class {
    async getUserStats() { return { activeExam: 'ssc_cgl', weakTopics: ['Algebra'] }; }
  },
}));
jest.mock('../../src/core/knowledge', () => ({ knowledgeService: { getSourceContext: async () => null } }));

import { quizGeneratorService } from '../../src/services/tests/quizGenerator.service';

const NODE = {
  id: 'topic:ssc_cgl_quant_algebra', label: 'Algebra', type: 'TOPIC',
  examId: 'ssc_cgl', cycleId: '2026', syllabusId: 'syl_2026_v1',
  parentEntityId: 'subject:ssc_cgl_quant', order: 2,
};
const PARENT = {
  id: 'subject:ssc_cgl_quant', label: 'Quantitative Aptitude', type: 'SUBJECT',
  examId: 'ssc_cgl', cycleId: '2026', syllabusId: 'syl_2026_v1', order: 1,
};
const STAGE = { ...NODE, id: 'stage:tier_1', label: 'Tier 1', type: 'STAGE' };

beforeEach(() => { nodes.length = 0; nodes.push(PARENT, NODE, STAGE); });

describe('canonical mode', () => {
  it('stamps the APPLICATION-selected node id on every question', async () => {
    const { questions } = await quizGeneratorService.generateWeakAreaQuiz('u1', {
      syllabusNodeId: NODE.id, examId: 'ssc_cgl', count: 3,
    });
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q.identityStatus).toBe('CANONICAL');
      expect(q.syllabusNodeId).toBe('topic:ssc_cgl_quant_algebra');
      expect(q.syllabusId).toBe('syl_2026_v1');
      expect(q.cycleId).toBe('2026');
    }
  });

  it('THE KEY GUARANTEE: the model’s topic label cannot override identity', async () => {
    const { questions } = await quizGeneratorService.generateWeakAreaQuiz('u1', {
      syllabusNodeId: NODE.id, examId: 'ssc_cgl', count: 3,
    });
    // The model wrote "Quadratic Equations" / "Totally Unrelated Topic"...
    expect(questions[0].topic).toBe('Quadratic Equations');
    // ...but identity is still the node the application selected and validated.
    expect(questions[0].syllabusNodeId).toBe('topic:ssc_cgl_quant_algebra');
    expect(questions[1].syllabusNodeId).toBe('topic:ssc_cgl_quant_algebra');
  });
});

describe('unanchored mode', () => {
  it('marks questions UNANCHORED when no node is supplied — and invents no id', async () => {
    const { questions } = await quizGeneratorService.generateWeakAreaQuiz('u1', { count: 3 });
    for (const q of questions) {
      expect(q.identityStatus).toBe('UNANCHORED');
      expect(q.syllabusNodeId).toBeUndefined();
    }
  });

  it('does NOT infer a node from a free-text topic', async () => {
    // "Algebra" matches NODE.label exactly, which is precisely the temptation to resolve.
    const { questions } = await quizGeneratorService.generateWeakAreaQuiz('u1', { topic: 'Algebra' });
    expect(questions[0].identityStatus).toBe('UNANCHORED');
    expect(questions[0].syllabusNodeId).toBeUndefined();
  });

  it('does NOT infer a node from weakTopics', async () => {
    // The stubbed stats carry weakTopics: ['Algebra'] — also an exact label match, also ignored.
    const { questions } = await quizGeneratorService.generateWeakAreaQuiz('u1', {});
    expect(questions[0].syllabusNodeId).toBeUndefined();
  });
});

describe('rejection: an invalid canonical request must fail, not silently downgrade', () => {
  it('rejects an unknown node', async () => {
    await expect(
      quizGeneratorService.generateWeakAreaQuiz('u1', { syllabusNodeId: 'topic:nope', examId: 'ssc_cgl' }),
    ).rejects.toThrow(/Invalid syllabus node/);
  });

  it('rejects a node from another exam', async () => {
    await expect(
      quizGeneratorService.generateWeakAreaQuiz('u1', { syllabusNodeId: NODE.id, examId: 'neet' }),
    ).rejects.toThrow(/Invalid syllabus node/);
  });

  it('rejects a wrong syllabus version', async () => {
    await expect(
      quizGeneratorService.generateWeakAreaQuiz('u1', {
        syllabusNodeId: NODE.id, examId: 'ssc_cgl', syllabusId: 'syl_2024_v1',
      }),
    ).rejects.toThrow(/Invalid syllabus node/);
  });

  it('rejects a wrong cycle', async () => {
    await expect(
      quizGeneratorService.generateWeakAreaQuiz('u1', {
        syllabusNodeId: NODE.id, examId: 'ssc_cgl', cycleId: '2024',
      }),
    ).rejects.toThrow(/Invalid syllabus node/);
  });

  it('rejects a STAGE node — not a question-level location', async () => {
    await expect(
      quizGeneratorService.generateWeakAreaQuiz('u1', { syllabusNodeId: STAGE.id, examId: 'ssc_cgl' }),
    ).rejects.toThrow(/Invalid syllabus node/);
  });

  it('an invalid id never degrades into an unanchored question', async () => {
    // Missing id => unanchored. INVALID id => error. Two situations, two outcomes.
    await expect(
      quizGeneratorService.generateWeakAreaQuiz('u1', { syllabusNodeId: 'topic:bogus', examId: 'ssc_cgl' }),
    ).rejects.toThrow();
  });
});
