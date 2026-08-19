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

  it('accepts a score goal', () => {
    const { errors, kind } = validateGoalInput({ targetScore: 90 });
    expect(errors).toHaveLength(0);
    expect(kind).toBe('score');
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

  it('does NOT impose an exam-agnostic score ceiling', () => {
    // Scoring models differ (percentage vs raw marks vs negative-marked totals). Asserting a
    // universal maximum here would reject legitimate targets and duplicate exam metadata.
    const { errors } = validateGoalInput({ targetScore: 720 }); // e.g. NEET total
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
    expect(validateGoalInput({ targetScore: 90, targetDate: future }).errors).toHaveLength(0);
  });
});
