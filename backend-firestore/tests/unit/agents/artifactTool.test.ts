/**
 * `create_document_artifact` is the first tool that writes, so the rules that protect a student
 * from a double charge or a runaway generation live here.
 */
const mockCreateDocument = jest.fn();
jest.mock('../../../src/agents/artifacts/artifacts.service', () => ({
  getArtifactsService: () => ({ createDocument: mockCreateDocument }),
}));

const mockConsumeQuota = jest.fn();
jest.mock('../../../src/services/usage.service', () => ({ usageService: { consumeQuota: mockConsumeQuota } }));

import { registerArtifactTools } from '../../../src/agents/tools/adapters/artifact.adapter';
import { ToolRegistry } from '../../../src/agents/tools/ToolRegistry';

const registry = () => registerArtifactTools(new ToolRegistry());
const ctx = { userId: 'u1', runId: 'run-1', stepId: 's1', signal: new AbortController().signal };
const document = {
  title: 'Laws of Motion — Formula Chart',
  sections: [{ heading: 'Key formulae', blocks: [{ type: 'formulae', items: [{ formula: 'F = ma' }] }] }],
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AGENT_MODE_ENABLED = 'true';
  process.env.AGENT_ARTIFACTS_ENABLED = 'true';
  mockConsumeQuota.mockResolvedValue({ allowed: true });
  mockCreateDocument.mockResolvedValue({
    artifactId: 'art-1',
    title: document.title,
    versions: [{ version: 1, pageCount: 2, sizeBytes: 4096 }],
  });
});
afterAll(() => {
  delete process.env.AGENT_MODE_ENABLED;
  delete process.env.AGENT_ARTIFACTS_ENABLED;
});

describe('create_document_artifact', () => {
  it('is invisible to planning while AGENT_ARTIFACTS_ENABLED is off', () => {
    process.env.AGENT_ARTIFACTS_ENABLED = 'false';
    expect(registry().get('create_document_artifact')).toBeUndefined();
    expect(registry().names()).not.toContain('create_document_artifact');
  });

  it('is never retried automatically — a retry would bill twice and store a duplicate', () => {
    const tool = registry().get('create_document_artifact')!;
    expect(tool.idempotent).toBe(false);
    expect(tool.retry.maxAttempts).toBe(1);
    expect(tool.permissions).toEqual(['write:own-artifact']);
  });

  it('charges the artifact meter, then creates the document for the run owner', async () => {
    const tool = registry().get('create_document_artifact')!;
    const { data, provenance } = await tool.execute(tool.inputSchema.parse(document), ctx as any);
    expect(mockConsumeQuota).toHaveBeenCalledWith('u1', 'artifactGenerations', 1);
    expect(mockCreateDocument).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', runId: 'run-1', spec: document }));
    expect(data).toMatchObject({ artifactId: 'art-1', pageCount: 2, fileUrl: '/api/agent/artifacts/art-1/file' });
    expect(provenance).toBe('GENERATED');
    tool.outputSchema.parse(data);
  });

  it('does not generate anything when the student is out of quota', async () => {
    const quota: any = new Error('You have used all your document generations this month.');
    quota.code = 'QUOTA_EXHAUSTED';
    mockConsumeQuota.mockRejectedValueOnce(quota);
    const tool = registry().get('create_document_artifact')!;
    await expect(tool.execute(tool.inputSchema.parse(document), ctx as any)).rejects.toMatchObject({ failureClass: 'permission' });
    expect(mockCreateDocument).not.toHaveBeenCalled();
  });

  it('rejects a malformed document before any quota is spent', () => {
    const tool = registry().get('create_document_artifact')!;
    expect(() => tool.inputSchema.parse({ title: 'x', sections: [] })).toThrow();
    expect(mockConsumeQuota).not.toHaveBeenCalled();
  });
});
