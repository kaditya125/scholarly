/**
 * The mastery write gate.
 *
 * ENABLE_MASTERY is process-wide, so the only way to turn mastery on was to turn it on for every
 * student at once. That is the wrong shape for a first enablement: the write path has never run
 * against real traffic, and mastery records are cumulative evidence about real people rather than
 * something to generate and delete casually.
 *
 * These tests pin the combination rule, and specifically that the new per-user path cannot widen
 * access — with everything off, the answer must still be no.
 */

let envMastery = false;
let isEnabledImpl: (flag: string, userId?: string) => Promise<boolean> = async () => false;
let constructedCount = 0;

jest.mock('../../src/config/featureFlags', () => ({
  featureFlags: { get mastery() { return envMastery; } },
}));

jest.mock('../../src/services/featureFlag.service', () => ({
  FeatureFlagService: class {
    constructor() { constructedCount++; }
    isEnabled(flag: string, userId?: string) { return isEnabledImpl(flag, userId); }
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { isMasteryEnabledFor, MASTERY_FLAG } from '../../src/services/masteryGate';

beforeEach(() => {
  envMastery = false;
  isEnabledImpl = async () => false;
});

describe('the combination rule', () => {
  it('OFF by default — neither the env var nor a targeted flag', async () => {
    expect(await isMasteryEnabledFor('student-1')).toBe(false);
  });

  it('ENABLE_MASTERY=true still enables everyone, unchanged', async () => {
    envMastery = true;
    expect(await isMasteryEnabledFor('anyone')).toBe(true);
    expect(await isMasteryEnabledFor(undefined)).toBe(true);
  });

  it('a targeted student is enabled while everyone else is not', async () => {
    isEnabledImpl = async (_f, uid) => uid === 'test-account';
    expect(await isMasteryEnabledFor('test-account')).toBe(true);
    expect(await isMasteryEnabledFor('some-real-student')).toBe(false);
  });

  it('asks the flag service for the right flag name', async () => {
    let seen = '';
    isEnabledImpl = async (f) => { seen = f; return false; };
    await isMasteryEnabledFor('student-1');
    expect(seen).toBe(MASTERY_FLAG);
    expect(MASTERY_FLAG).toBe('mastery');
  });
});

describe('it cannot widen access', () => {
  it('no userId and env off means no lookup and no', async () => {
    let called = false;
    isEnabledImpl = async () => { called = true; return true; };
    expect(await isMasteryEnabledFor(undefined)).toBe(false);
    // An anonymous caller must not be able to reach a targeted grant.
    expect(called).toBe(false);
  });

  it('fails closed when the lookup throws', async () => {
    isEnabledImpl = async () => { throw new Error('firestore unreachable'); };
    expect(await isMasteryEnabledFor('student-1')).toBe(false);
  });

  it('skips the lookup entirely when the env var is already true', async () => {
    envMastery = true;
    let called = false;
    isEnabledImpl = async () => { called = true; return false; };
    expect(await isMasteryEnabledFor('student-1')).toBe(true);
    // A per-user "false" must not be able to REVOKE a global enable — the rule is OR, and the
    // env var is the switch an operator reaches for in an incident.
    expect(called).toBe(false);
  });
});

describe('DI safety', () => {
  it('does not construct FeatureFlagService at module scope', () => {
    /*
     * Its constructor resolves CacheProvider from the container, so building it at module scope
     * would throw before bootstrapDI() in any early importer — the same quiet failure that made
     * an unbootstrapped probe look like a production defect.
     *
     * Asserted against the SOURCE rather than a counter: by the time this test body runs, earlier
     * tests in this file have legitimately triggered lazy construction, so a counter here would
     * only be measuring test ordering. The structural property is what matters and it holds
     * regardless of order.
     */
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/services/masteryGate.ts'), 'utf8');
    const topLevelNew = src
      .split('\n')
      // `= new FeatureFlagService()` directly — i.e. runs at load. The lazy form is
      // `= (): T => (_x ??= new FeatureFlagService())`, where `=>` sits between, so it is
      // deliberately NOT matched: that body runs on call, not on import.
      .filter((l: string) => /^\s*(const|let|var)\s+\w+\s*(:[^=]*)?=\s*new FeatureFlagService\(/.test(l));
    expect(topLevelNew).toEqual([]);
    // Constructed behind a function instead.
    expect(src).toMatch(/\?\?=\s*new FeatureFlagService\(\)/);
  });

  it('constructs once, on first use, and reuses it', async () => {
    isEnabledImpl = async () => false;
    await isMasteryEnabledFor('student-1');
    await isMasteryEnabledFor('student-2');
    expect(constructedCount).toBe(1);
  });
});

describe('one derivation, two call sites', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '../../src', p), 'utf8');

  it('both gates call the shared helper, not the env var directly', () => {
    /*
     * The subscriber writes mastery; reconciliation drains the backlog. If they disagreed about
     * who is enabled, a student could accumulate a backlog that never drains, or have evidence
     * applied under two different rules. This codebase has already been bitten by two sites
     * deriving one answer separately and drifting.
     */
    for (const f of ['core/events/subscribers.ts', 'services/baselineReconciliation.service.ts']) {
      const src = read(f);
      expect(src).toMatch(/isMasteryEnabledFor\(/);
      expect(src).not.toMatch(/if \(!featureFlags\.mastery\)/);
    }
  });
});
