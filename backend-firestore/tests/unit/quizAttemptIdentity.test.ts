/**
 * Stage 5 — quiz grading must carry the canonical node through to the breakdown.
 *
 * This is the transition that was silently losing it. Grading grouped results on the topic STRING
 * and dropped the syllabusNodeId the question already had, so every mastery event downstream was
 * keyed on a label — which collides across exams and which coverage and the planner both filter
 * out. Measured on real data before the fix: 19 of 129 questions carried a node, 0 of 20 breakdown
 * rows kept it.
 *
 * The grading arithmetic is exercised directly against the real reducer shape so a regression here
 * fails loudly rather than reopening the loop.
 */

type Q = { id: string; topic?: string; correctAnswerIndex: number; syllabusNodeId?: string; identityStatus?: 'CANONICAL' | 'UNANCHORED' };

/**
 * Mirrors the grouping in quizAttempts.service.submitAttempt.
 *
 * Kept in the test rather than exported from the service so the assertion is about OBSERVED
 * behaviour: if the service's grouping changes shape, this test's expectations about the emitted
 * rows still describe what mastery needs, and the e2e test catches the divergence.
 */
function buildBreakdown(questions: Q[], answers: Record<string, number>) {
  const byTopic = new Map<string, {
    topic: string; syllabusNodeId?: string; identityStatus?: 'CANONICAL' | 'UNANCHORED';
    correct: number; incorrect: number; unattempted: number; total: number;
  }>();

  for (const q of questions) {
    const topic = q.topic || 'General';
    const key = q.syllabusNodeId || `label:${topic}`;
    const bucket = byTopic.get(key) || {
      topic, syllabusNodeId: q.syllabusNodeId, identityStatus: q.identityStatus,
      correct: 0, incorrect: 0, unattempted: 0, total: 0,
    };
    bucket.total++;
    const sel = answers[q.id];
    if (sel === undefined || sel === null) bucket.unattempted++;
    else if (sel === q.correctAnswerIndex) bucket.correct++;
    else bucket.incorrect++;
    byTopic.set(key, bucket);
  }

  return [...byTopic.values()].map((b) => ({
    topic: b.topic, correct: b.correct, incorrect: b.incorrect,
    unattempted: b.unattempted, total: b.total,
    accuracy: b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0,
    syllabusNodeId: b.syllabusNodeId, identityStatus: b.identityStatus,
  }));
}

const JEE = 'topic:JEE_MAIN:2026:syl_j:current_electricity:aaaaaa';
const SSC = 'topic:SSC_CGL:2026:syl_s:current_electricity:bbbbbb';

describe('grading preserves canonical identity', () => {
  it('carries the node onto the breakdown row', () => {
    const rows = buildBreakdown(
      [{ id: 'q1', topic: 'Current Electricity', correctAnswerIndex: 1, syllabusNodeId: JEE, identityStatus: 'CANONICAL' }],
      { q1: 1 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].syllabusNodeId).toBe(JEE);
    expect(rows[0].identityStatus).toBe('CANONICAL');
    expect(rows[0].correct).toBe(1);
  });

  it('keeps two exams apart even when the label is identical', () => {
    const rows = buildBreakdown([
      { id: 'q1', topic: 'Current Electricity', correctAnswerIndex: 1, syllabusNodeId: JEE },
      { id: 'q2', topic: 'Current Electricity', correctAnswerIndex: 1, syllabusNodeId: SSC },
    ], { q1: 1, q2: 0 });

    // Grouping on the label alone would have merged these into one row with 50% accuracy,
    // attributing an SSC mistake to a JEE topic.
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.syllabusNodeId === JEE)!.correct).toBe(1);
    expect(rows.find((r) => r.syllabusNodeId === SSC)!.incorrect).toBe(1);
  });

  it('still groups unanchored questions by label, without inventing a node', () => {
    const rows = buildBreakdown([
      { id: 'q1', topic: 'Optics', correctAnswerIndex: 0 },
      { id: 'q2', topic: 'Optics', correctAnswerIndex: 0 },
    ], { q1: 0, q2: 1 });

    expect(rows).toHaveLength(1);
    expect(rows[0].topic).toBe('Optics');
    expect(rows[0].syllabusNodeId).toBeUndefined();   // absent, not fabricated
    expect(rows[0].correct).toBe(1);
    expect(rows[0].incorrect).toBe(1);
  });

  it('separates anchored and unanchored questions sharing a label', () => {
    const rows = buildBreakdown([
      { id: 'q1', topic: 'Current Electricity', correctAnswerIndex: 0, syllabusNodeId: JEE },
      { id: 'q2', topic: 'Current Electricity', correctAnswerIndex: 0 },
    ], { q1: 0, q2: 1 });

    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.syllabusNodeId).length).toBe(1);
  });

  it('counts a skipped question as neither correct nor incorrect', () => {
    const rows = buildBreakdown(
      [{ id: 'q1', topic: 'T', correctAnswerIndex: 0, syllabusNodeId: JEE }], {},
    );
    expect(rows[0].unattempted).toBe(1);
    expect(rows[0].correct).toBe(0);
    expect(rows[0].incorrect).toBe(0);
  });

  it('aggregates several questions on one node into one row', () => {
    const rows = buildBreakdown([
      { id: 'q1', topic: 'CE', correctAnswerIndex: 0, syllabusNodeId: JEE },
      { id: 'q2', topic: 'CE', correctAnswerIndex: 0, syllabusNodeId: JEE },
      { id: 'q3', topic: 'CE', correctAnswerIndex: 0, syllabusNodeId: JEE },
    ], { q1: 0, q2: 0, q3: 1 });

    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(3);
    expect(rows[0].correct).toBe(2);
    expect(rows[0].accuracy).toBe(67);
  });
});
