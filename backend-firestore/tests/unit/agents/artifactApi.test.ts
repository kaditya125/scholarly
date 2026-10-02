/**
 * Artifact endpoints: hidden behind their own flag, owner-only, and the bytes are served by the
 * API rather than by a public storage URL.
 */
jest.mock('../../../src/config/firebase', () => ({ db: { collection: () => ({ doc: () => ({}) }) }, firebaseApp: {} }));
jest.mock('../../../src/services/chat.service', () => ({
  ChatService: jest.fn().mockImplementation(() => ({ assertSessionAccess: jest.fn() })),
}));
jest.mock('../../../src/agents', () => {
  const actual = jest.requireActual('../../../src/agents');
  return { ...actual, getAgentRuntime: () => ({}), ensureAgentRecovery: async () => undefined };
});

const mockGetForUser = jest.fn();
const mockReadFile = jest.fn();
const mockListForUser = jest.fn();
jest.mock('../../../src/agents/artifacts/artifacts.service', () => {
  const actual = jest.requireActual('../../../src/agents/artifacts/artifacts.service');
  return {
    ...actual,
    getArtifactsService: () => ({ getForUser: mockGetForUser, readFile: mockReadFile, listForUser: mockListForUser }),
  };
});

import { AgentController } from '../../../src/controllers/agent.controller';
import { ArtifactError } from '../../../src/agents/artifacts/artifacts.service';

function res() {
  const r: any = { headers: {} as Record<string, string> };
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn((k: string, v: string) => {
    r.headers[k] = v;
  });
  r.end = jest.fn();
  return r;
}

const ARTIFACT = {
  artifactId: 'art-1',
  userId: 'owner',
  kind: 'document',
  title: 'Laws of Motion — Formula Chart',
  status: 'ready',
  provenance: 'GENERATED',
  spec: { title: 'Laws of Motion — Formula Chart', sections: [] },
  currentVersion: 1,
  versions: [{ version: 1, storagePath: 'artifacts/owner/art-1/v1.pdf', contentType: 'application/pdf', sizeBytes: 4096, sha256: 'abc', pageCount: 2, createdAt: 1 }],
  createdAt: 1,
  updatedAt: 1,
};

let controller: AgentController;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.AGENT_MODE_ENABLED = 'true';
  process.env.AGENT_ARTIFACTS_ENABLED = 'true';
  controller = new AgentController();
  mockGetForUser.mockResolvedValue(ARTIFACT);
  mockListForUser.mockResolvedValue([ARTIFACT]);
  mockReadFile.mockResolvedValue({ buffer: Buffer.from('%PDF-1.7 fake'), filename: 'Laws-of-Motion-v1.pdf', doc: ARTIFACT });
});
afterAll(() => {
  delete process.env.AGENT_MODE_ENABLED;
  delete process.env.AGENT_ARTIFACTS_ENABLED;
});

describe('artifact endpoints', () => {
  const req = (over: any = {}) => ({ user: { uid: 'owner' }, params: { artifactId: 'art-1' }, query: {}, ...over });

  it('are 404 while agent mode is off', async () => {
    process.env.AGENT_MODE_ENABLED = 'false';
    for (const handler of [controller.listArtifacts, controller.getArtifact, controller.getArtifactFile]) {
      const r = res();
      await handler(req() as any, r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(404);
    }
  });

  it('are 404 while the artifacts flag alone is off', async () => {
    process.env.AGENT_ARTIFACTS_ENABLED = 'false';
    const r = res();
    await controller.getArtifact(req() as any, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(404);
    expect(mockGetForUser).not.toHaveBeenCalled();
  });

  it('require authentication', async () => {
    const r = res();
    await controller.getArtifactFile(req({ user: undefined }) as any, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(401);
  });

  it('returns metadata and the spec, but never the storage path', async () => {
    const r = res();
    await controller.getArtifact(req() as any, r, jest.fn());
    const body = r.json.mock.calls[0][0];
    expect(body).toMatchObject({ artifactId: 'art-1', pageCount: 2, fileUrl: '/api/agent/artifacts/art-1/file' });
    expect(body.spec).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/artifacts\/owner\/art-1\/v1\.pdf/);
  });

  it('serves the PDF itself, uncacheable by shared proxies', async () => {
    const r = res();
    await controller.getArtifactFile(req() as any, r, jest.fn());
    expect(mockReadFile).toHaveBeenCalledWith('art-1', 'owner', undefined);
    expect(r.headers['Content-Type']).toBe('application/pdf');
    expect(r.headers['Content-Disposition']).toContain('Laws-of-Motion-v1.pdf');
    expect(r.headers['Cache-Control']).toBe('private, no-store');
    expect(r.end.mock.calls[0][0].subarray(0, 5).toString()).toBe('%PDF-');
  });

  it("reports another student's artifact as not found", async () => {
    mockGetForUser.mockRejectedValueOnce(new ArtifactError('NOT_FOUND', 'Artifact not found.', 404));
    const r = res();
    await controller.getArtifact(req({ user: { uid: 'intruder' } }) as any, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(404);
  });

  it('passes a requested version through and rejects a nonsense one', async () => {
    const ok = res();
    await controller.getArtifactFile(req({ query: { version: '2' } }) as any, ok, jest.fn());
    expect(mockReadFile).toHaveBeenCalledWith('art-1', 'owner', 2);

    const bad = res();
    await controller.getArtifactFile(req({ query: { version: 'latest' } }) as any, bad, jest.fn());
    expect(bad.status).toHaveBeenCalledWith(400);
  });

  it('lists only the caller’s artifacts', async () => {
    const r = res();
    await controller.listArtifacts(req({ query: {} }) as any, r, jest.fn());
    expect(mockListForUser).toHaveBeenCalledWith('owner', 20);
    expect(r.json.mock.calls[0][0].artifacts[0]).toMatchObject({ artifactId: 'art-1' });
  });
});
