/**
 * The LLM must not be a source of claims about what a student is weak at.
 *
 * WHAT WAS THERE: userMemoryService.updateMemoryFromInteraction() asked the model, from a SINGLE
 * chat exchange, to "extract a comma-separated list of topics the student seems to be STRUGGLING
 * with", persisted the answer to users/{uid}/memory/global.weakTopics append-only — no evidence,
 * no sample size, no decay, no way out once named — and buildStudentContextBlock rendered it back
 * into the system prompt as "**Struggling With**: ...". A guess was written down, then read back
 * as measurement, and nothing downstream could tell the difference.
 *
 * These are structural assertions against the source, deliberately: the point is that the code
 * path does not exist, which a behavioural test on a deleted function cannot express.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '../../src', rel), 'utf8');

/**
 * Strips comments before asserting. These files deliberately DOCUMENT the removed prompt so the
 * next reader understands why it went — matching raw source would flag that explanation as the
 * defect itself. What must not exist is the executable path, not the account of it.
 */
const code = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the LLM weakness writer is gone', () => {
  const src = code('services/userMemory.service.ts');

  it('updateMemoryFromInteraction no longer exists', () => {
    expect(src).not.toMatch(/async\s+updateMemoryFromInteraction\s*\(/);
  });

  it('no executable prompt asks a model what the student is struggling with', () => {
    expect(src).not.toMatch(/STRUGGLING with/i);
  });

  it('no code path writes weakTopics from an LLM reply', () => {
    // The original shape: split an LLM reply and merge it into the stored weak list.
    expect(src).not.toMatch(/weakTopics:\s*updatedWeakTopics/);
    expect(src).not.toMatch(/insight\.reply/);
  });

  it('the memory prompt block no longer asserts struggles or strengths', () => {
    expect(src).not.toMatch(/Struggles with:/);
    expect(src).not.toMatch(/Excels at:/);
  });
});

describe('the system prompt no longer states unmeasured weaknesses', () => {
  const prompts = code('config/prompts.ts');

  it('does not render "Struggling With" from memory', () => {
    expect(prompts).not.toMatch(/\*\*Struggling With\*\*/);
  });

  it('does not render "Strong In" from memory', () => {
    expect(prompts).not.toMatch(/\*\*Strong In\*\*/);
  });

  it('still carries teaching-STYLE preferences, which are not knowledge claims', () => {
    // Comprehension depth says how to explain, not what the student does or does not know.
    expect(prompts).toMatch(/\*\*Comprehension Depth\*\*/);
  });
});

describe('the measured weakness path is untouched', () => {
  it('quiz results still derive weak topics, and let a topic graduate out again', () => {
    const quiz = code('services/tests/quizAttempts.service.ts');
    expect(quiz).toMatch(/weakSet/);
    // The property that makes it a measurement rather than an accumulating label: improving at a
    // topic removes it. The deleted LLM list could only ever grow.
    expect(quiz).toMatch(/strongTopics\.forEach\(t => weakSet\.delete\(t\)\)/);
  });
});
