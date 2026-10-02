/**
 * Run listing must return the student's NEWEST runs. An equality-only read capped at a page size
 * returns an arbitrary slice, so a heavy user could stop seeing the run they just started.
 */
const mockGet = jest.fn();
const calls: string[] = [];

function chain(): any {
  const self: any = {
    where: (f: string, op: string, v: any) => {
      calls.push(`where(${f}${op}${v})`);
      return self;
    },
    orderBy: (f: string, dir: string) => {
      calls.push(`orderBy(${f},${dir})`);
      return self;
    },
    limit: (n: number) => {
      calls.push(`limit(${n})`);
      return self;
    },
    get: () => mockGet(),
  };
  return self;
}

jest.mock('../../../src/config/firebase', () => ({ db: { collection: () => chain() } }));
jest.mock('../../../src/utils/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { FirestoreAgentRunStore } from '../../../src/agents/runtime/AgentRunStore';

const docsOf = (...runs: any[]) => ({ docs: runs.map((r) => ({ data: () => r })) });
const run = (runId: string, createdAt: number) => ({ runId, userId: 'u1', createdAt });

beforeEach(() => {
  calls.length = 0;
  mockGet.mockReset();
});

describe('FirestoreAgentRunStore.listRunsForUser', () => {
  it('asks Firestore for the newest runs rather than sorting a page in memory', async () => {
    mockGet.mockResolvedValueOnce(docsOf(run('new', 300), run('old', 100)));
    const runs = await new FirestoreAgentRunStore().listRunsForUser('u1', 20);
    expect(calls).toEqual(['where(userId==u1)', 'orderBy(createdAt,desc)', 'limit(20)']);
    expect(runs.map((r) => r.runId)).toEqual(['new', 'old']);
  });

  it('falls back to in-memory ordering when the composite index is not deployed yet', async () => {
    const failedPrecondition: any = new Error('The query requires an index.');
    failedPrecondition.code = 9;
    mockGet.mockRejectedValueOnce(failedPrecondition).mockResolvedValueOnce(docsOf(run('old', 100), run('new', 300)));
    const runs = await new FirestoreAgentRunStore().listRunsForUser('u1', 2);
    expect(runs.map((r) => r.runId)).toEqual(['new', 'old']); // still newest-first
    expect(calls).toContain('limit(50)'); // widened fetch window for the in-memory sort
  });

  it('does not swallow unrelated Firestore failures', async () => {
    const boom: any = new Error('permission denied');
    boom.code = 7;
    mockGet.mockRejectedValueOnce(boom);
    await expect(new FirestoreAgentRunStore().listRunsForUser('u1', 5)).rejects.toThrow('permission denied');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
