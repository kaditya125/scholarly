import { validateGoalInput } from '../../src/controllers/studentGoal.controller';

/**
 * Validation must REJECT rather than coerce. A goal is a statement the student makes about their
 * own target; quietly clamping a percentile or reading an unparseable score as zero would put
 * words in their mouth and then feed those words to the mentor as measured fact.
 */
describe('validateGoalInput', () => {
  it('requires at least one target', () => {
    const { errors } = validateGoalInput({});
    expect(errors.map((e) => e.field)).toContain('target');
  });

  it('accepts a score goal when the unit is declared', () => {
    const { errors, kind } = validateGoalInput({ targetScore: 90, targetScoreUnit: 'PERCENT' });
    expect(errors).toHaveLength(0);
    expect(kind).toBe('score');
  });

  it('REJECTS a score goal with no unit', () => {
    // "90" is a fine percentage and a poor mark out of 200. Stored without a unit it can never be
    // compared to any measurement, so the goal gap would be permanently unknowable — and the
    // previous code silently subtracted it from a percentage anyway.
    const { errors } = validateGoalInput({ targetScore: 90 });
    expect(errors.some((e) => e.field === 'targetScoreUnit')).toBe(true);
  });

  it('rejects an unrecognised unit rather than coercing it', () => {
    const { errors } = validateGoalInput({ targetScore: 90, targetScoreUnit: 'points' });
    expect(errors.some((e) => e.field === 'targetScoreUnit')).toBe(true);
  });

  it('rejects a percentage above 100 — the one ceiling that is universal', () => {
    const { errors } = validateGoalInput({ targetScore: 150, targetScoreUnit: 'PERCENT' });
    expect(errors.some((e) => e.field === 'targetScore')).toBe(true);
  });

  it('accepts a rank goal', () => {
    const { errors, kind } = validateGoalInput({ targetRank: 500 });
    expect(errors).toHaveLength(0);
    expect(kind).toBe('rank');
  });

  it('accepts a percentile goal', () => {
    const { errors, kind } = validateGoalInput({ targetPercentile: 99.5 });
    expect(errors).toHaveLength(0);
    expect(kind).toBe('percentile');
  });

  it('rejects a negative score rather than clamping it', () => {
    const { errors } = validateGoalInput({ targetScore: -5 });
    expect(errors.map((e) => e.field)).toContain('targetScore');
  });

  it('rejects a non-numeric score rather than treating it as zero', () => {
    const { errors } = validateGoalInput({ targetScore: 'ninety' });
    expect(errors.map((e) => e.field)).toContain('targetScore');
  });

  it('does NOT impose an exam-agnostic ceiling on a MARKS target', () => {
    // Scoring models differ (percentage vs raw marks vs negative-marked totals). Asserting a
    // universal maximum here would reject legitimate targets and duplicate exam metadata.
    const { errors } = validateGoalInput({ targetScore: 720, targetScoreUnit: 'MARKS' }); // NEET total
    expect(errors).toHaveLength(0);
  });

  it('rejects a fractional or zero rank', () => {
    expect(validateGoalInput({ targetRank: 1.5 }).errors.length).toBeGreaterThan(0);
    expect(validateGoalInput({ targetRank: 0 }).errors.length).toBeGreaterThan(0);
  });

  it('rejects an out-of-range percentile', () => {
    expect(validateGoalInput({ targetPercentile: 101 }).errors.length).toBeGreaterThan(0);
    expect(validateGoalInput({ targetPercentile: -1 }).errors.length).toBeGreaterThan(0);
  });

  it('rejects an invalid or past target date', () => {
    expect(validateGoalInput({ targetScore: 90, targetDate: 'not-a-date' }).errors.length).toBeGreaterThan(0);
    expect(validateGoalInput({ targetScore: 90, targetDate: '2001-01-01' }).errors.length).toBeGreaterThan(0);
  });

  it('accepts a future target date', () => {
    const future = new Date(Date.now() + 86400000 * 30).toISOString();
    expect(validateGoalInput({
      targetScore: 90, targetScoreUnit: 'PERCENT', targetDate: future,
    }).errors).toHaveLength(0);
  });
});
