/**
 * The baseline reconciliation trigger.
 *
 * WHY THIS EXISTS. Mastery is a PROJECTION rebuilt from durable graded evidence, so a submission
 * whose completion event was never consumed stays COMPLETED/PENDING and remains recoverable.
 * reconcilePending() was written to drain that backlog — and nothing ever called it, so the
 * backlog could only grow. This endpoint is the caller.
 *
 * The subtle case these tests exist for is the ENABLE_MASTERY-off path. reconcileUser deliberately
 * writes nothing and leaves records PENDING (marking them PROJECTED would make evidence graded
 * during the disabled window permanently unrecoverable). The pass then returns projected:0 —
 * which is indistinguishable from "backlog already clear" unless the response says otherwise.
 */

let mockResult = { scanned: 0, projected: 0 };
let mockThrows: string | null = null;
let capturedLimit: number | undefined;
let masteryFlag = false;

jest.mock('../../src/services/baselineReconciliation.service', () => ({
  baselineReconciliationService: {
    reconcilePending: jest.fn(async (limit: number) => {
      capturedLimit = limit;
      if (mockThrows) throw new Error(mockThrows);
      return mockResult;
    }),
  },
}));

jest.mock('../../src/config/featureFlags', () => ({
  featureFlags: { get mastery() { return masteryFlag; } },
}));

jest.mock('../../src/services/admin/backup.service', () => ({ backupService: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { cronController } from '../../src/controllers/cron.controller';

/** Minimal Express double — records what the handler sent. */
const makeRes = () => {
  const r: any = { statusCode: 0, body: null };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
};
const run = async (query: any = {}) => {
  const res = makeRes();
  await cronController.reconcileBaselineProjections({ query } as any, res, (() => {}) as any);
  return res;
};

beforeEach(() => {
  mockResult = { scanned: 0, projected: 0 };
  mockThrows = null;
  capturedLimit = undefined;
  masteryFlag = false;
});

describe('draining the backlog', () => {
  it('reports what the pass actually did', async () => {
    mockResult = { scanned: 12, projected: 7 };
    masteryFlag = true;
    const res = await run();
    expect(res.statusCode).toBe(200);
    expect(res.body.scanned).toBe(12);
    expect(res.body.projected).toBe(7);
  });

  it('defaults to a bounded page', async () => {
    await run();
    expect(capturedLimit).toBe(50);
  });

  it('honours an explicit limit', async () => {
    await run({ limit: '25' });
    expect(capturedLimit).toBe(25);
  });

  it('caps the limit — one scheduler call must not try to drain everything', async () => {
    // Each entry is a read plus a potential transactional write, walked serially.
    await run({ limit: '100000' });
    expect(capturedLimit).toBe(200);
  });

  it('ignores nonsense limits rather than passing them through', async () => {
    for (const bad of ['abc', '-5', '0', '']) {
      capturedLimit = undefined;
      await run({ limit: bad });
      expect(capturedLimit).toBe(50);
    }
  });
});

describe('a disabled feature must not look like an empty backlog', () => {
  it('says plainly that nothing was projected because mastery is off', async () => {
    masteryFlag = false;
    mockResult = { scanned: 9, projected: 0 };
    const res = await run();

    expect(res.body.masteryEnabled).toBe(false);
    // The distinction the whole endpoint turns on: 9 records were seen, none projected, and that
    // is NOT because there was nothing to do.
    expect(res.body.scanned).toBe(9);
    expect(res.body.projected).toBe(0);
    expect(res.body.note).toMatch(/ENABLE_MASTERY is off/);
    expect(res.body.note).toMatch(/does NOT mean the backlog is clear/i);
  });

  it('says something different when mastery is on', async () => {
    masteryFlag = true;
    const res = await run();
    expect(res.body.masteryEnabled).toBe(true);
    expect(res.body.note).not.toMatch(/does NOT mean/i);
  });
});

describe('failure surfaces for the scheduler to retry', () => {
  it('returns 500 so the scheduler retries', async () => {
    mockThrows = 'index missing';
    const res = await run();
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('index missing');
  });
});

describe('the route is mounted and protected', () => {
  const fs = require('fs');
  const path = require('path');
  const routes = fs.readFileSync(
    path.join(__dirname, '../../src/routes/cron.routes.ts'), 'utf8');

  it('is behind requireCronSecret, not a user token', () => {
    expect(routes).toMatch(
      /router\.post\(\s*'\/reconcile-baseline',\s*requireCronSecret,\s*cronController\.reconcileBaselineProjections/);
  });

  it('is a POST — draining a backlog is not a safe idempotent GET a crawler may hit', () => {
    expect(routes).not.toMatch(/router\.get\([^)]*reconcile-baseline/);
  });
});
