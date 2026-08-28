/**
 * Runtime proof that onboarding questions come from the AI pipeline and nowhere else.
 *
 * The static tests next door prove no bank EXISTS. These prove the runtime path actually uses the
 * generator's output, and — the case that matters — that a generator failure produces an error
 * rather than a plausible-looking assessment from some other source.
 */

let mockReply = '';
let mockShouldThrow = false;
let generateCalls = 0;

jest.mock('../../src/services/ai/gemini.provider', () => ({
  GeminiProvider: class {
    async generateResponse() {
      generateCalls++;
      if (mockShouldThrow) throw new Error('simulated Vertex 429');
      return { reply: mockReply };
    }
  },
}));

jest.mock('../../src/services/userProfile.service', () => ({
  UserProfileService: class {
    async getProfile() {
      return { targetExam: 'UPSC CSE', subjects: ['General Awareness'] };
    }
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { adaptiveCatService, AdaptiveGenerationError } from '../../src/services/adaptiveCat.service';

/** Four well-formed questions, the shape the prompt asks the model for. */
const goodBatch = (marker: string) =>
  JSON.stringify(
    Array.from({ length: 4 }, (_, i) => ({
      topic: 'Polity',
      subtopic: 'Constitution',
      question: `${marker} question number ${i + 1}?`,
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      correctAnswer: 'Gamma',
      explanation: 'Because Gamma.',
      knowledgeGraphTag: 'General Awareness > Polity',
    })),
  );

beforeEach(() => {
  mockShouldThrow = false;
  generateCalls = 0;
  mockReply = goodBatch('GENERATED');
});

describe('the AI output is what reaches the student', () => {
  it('returns exactly the model text, not a substitute', async () => {
    mockReply = goodBatch('UNIQUE-MARKER-7f3a');
    const out = await adaptiveCatService.generateAdaptiveBatch('u1', 0, []);

    expect(out.questions).toHaveLength(4);
    // If anything static were being served, this marker could not survive to the response.
    out.questions.forEach((q) => expect(q.question).toContain('UNIQUE-MARKER-7f3a'));
    expect(out.questions.map((q) => q.options)).toEqual(
      Array(4).fill(['Alpha', 'Beta', 'Gamma', 'Delta']),
    );
  });

  it('stamps provenance so the source is answerable later', async () => {
    const out = await adaptiveCatService.generateAdaptiveBatch('u1', 0, []);
    out.questions.forEach((q) => {
      expect(q.generatedBy).toBe('gemini');
      expect(typeof q.generatedAt).toBe('number');
      expect(q.id).toMatch(/^cat_ai_/);   // never cat_fb_ (the retired fallback prefix)
      expect(q.isLegacyDemo).toBe(false);
    });
  });

  it('keeps the model answer key rather than inventing one', async () => {
    const out = await adaptiveCatService.generateAdaptiveBatch('u1', 0, []);
    out.questions.forEach((q) => expect(q.correctAnswer).toBe('Gamma'));
  });
});

describe('a generation failure is an error, never static questions', () => {
  it('throws AdaptiveGenerationError when the model keeps failing', async () => {
    mockShouldThrow = true;
    await expect(adaptiveCatService.generateAdaptiveBatch('u1', 0, [])).rejects.toThrow(
      AdaptiveGenerationError,
    );
  });

  it('retries before giving up, and gives up rather than substituting', async () => {
    mockShouldThrow = true;
    await expect(adaptiveCatService.generateAdaptiveBatch('u1', 0, [])).rejects.toThrow();
    expect(generateCalls).toBe(3);   // MAX_GENERATION_ATTEMPTS
  });

  it('carries a 503 so the student is told to retry, not shown a bug', async () => {
    mockShouldThrow = true;
    try {
      await adaptiveCatService.generateAdaptiveBatch('u1', 0, []);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.status).toBe(503);
      expect(e.code).toBe('QUESTION_GENERATION_FAILED');
      expect(String(e.message)).toMatch(/try again/i);
    }
  });

  it('rejects a malformed batch rather than repairing it into a real-looking question', async () => {
    // Three options and an answer matching none — the exact input the old mapper "fixed" by
    // inventing ['Option A'..'Option D'] and declaring options[0] correct.
    mockReply = JSON.stringify(
      Array.from({ length: 4 }, () => ({
        question: 'Structurally broken question?',
        options: ['only', 'three', 'options'],
        correctAnswer: 'not among them',
      })),
    );
    await expect(adaptiveCatService.generateAdaptiveBatch('u1', 0, [])).rejects.toThrow(
      AdaptiveGenerationError,
    );
  });

  it('rejects a short batch rather than topping it up from elsewhere', async () => {
    // Two valid questions. The old code filled the remaining two from the bank, mixing sources
    // inside one batch with nothing to distinguish them.
    mockReply = JSON.stringify([
      { question: 'Valid one?', options: ['a', 'b', 'c', 'd'], correctAnswer: 'a' },
      { question: 'Valid two?', options: ['a', 'b', 'c', 'd'], correctAnswer: 'b' },
    ]);
    await expect(adaptiveCatService.generateAdaptiveBatch('u1', 0, [])).rejects.toThrow(
      AdaptiveGenerationError,
    );
  });

  it('recovers when a later attempt succeeds', async () => {
    /*
     * Proves the retry is a real recovery path and not decoration: attempt 1 returns junk,
     * attempt 2 returns a good batch, and the student gets the good batch.
     *
     * adaptiveCatService is a module-level SINGLETON, so the stub below must be restored — the
     * first version of this test leaked it into the next case, which then silently passed against
     * the wrong provider. Restored in `finally` so a failed expectation cannot leak it either.
     */
    const svc: any = adaptiveCatService;
    const realLlm = svc.llm;
    let call = 0;
    const replies = ['not json at all', goodBatch('RECOVERED')];
    svc.llm = { generateResponse: async () => ({ reply: replies[Math.min(call++, 1)] }) };

    try {
      const out = await adaptiveCatService.generateAdaptiveBatch('u1', 0, []);
      expect(out.questions).toHaveLength(4);
      out.questions.forEach((q) => expect(q.question).toContain('RECOVERED'));
      expect(call).toBe(2);
    } finally {
      svc.llm = realLlm;
    }
  });
});

describe('the prompt template must not become a question', () => {
  it('rejects a batch whose options are the schema placeholders', async () => {
    mockReply = JSON.stringify(
      Array.from({ length: 4 }, () => ({
        question: 'Looks real but is not?',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 'Option A',
      })),
    );
    await expect(adaptiveCatService.generateAdaptiveBatch('u1', 0, [])).rejects.toThrow(
      AdaptiveGenerationError,
    );
  });
});
