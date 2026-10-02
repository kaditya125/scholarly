/**
 * Documents attached to an Agent-mode turn: stored privately, readable only by their owner.
 */
const docs = new Map<string, any>();
const files = new Map<string, Buffer>();
jest.mock('../../../src/config/firebase', () => ({
  db: {
    collection: () => ({
      doc: (id: string) => ({
        set: async (v: any) => void docs.set(id, v),
        get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
        delete: async () => void docs.delete(id),
      }),
    }),
  },
  firebaseApp: {
    storage: () => ({
      bucket: () => ({
        file: (path: string) => ({
          save: async (b: Buffer, opts: any) => {
            // No public token is ever attached.
            expect(JSON.stringify(opts)).not.toMatch(/firebaseStorageDownloadTokens/);
            files.set(path, b);
          },
          download: async () => [files.get(path)!],
          delete: async () => void files.delete(path),
        }),
      }),
    }),
  },
}));
jest.mock('../../../src/config/env', () => ({ env: {} }));
jest.mock('../../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));

import { AgentUploadsService } from '../../../src/agents/uploads/agentUploads.service';

const text = 'Photosynthesis is the process by which green plants make their own food. '.repeat(10);

describe('AgentUploadsService', () => {
  const service = new AgentUploadsService();

  it('stores the pages privately under the owner and reads them back only for the owner', async () => {
    const up = await service.save('student-1', { name: 'notes.pdf', mimeType: 'application/pdf', pages: [{ text }, { text }] });
    expect(up).toMatchObject({ userId: 'student-1', name: 'notes.pdf', pageCount: 2, storagePath: `agent_uploads/student-1/${up.uploadId}.json` });
    const { pages } = await service.read('student-1', up.uploadId);
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    await expect(service.read('student-2', up.uploadId)).rejects.toThrow(/not available/);
  });

  it('refuses a file with no readable text instead of starting work on nothing', async () => {
    await expect(service.save('student-1', { name: 'scan.pdf', mimeType: 'application/pdf', pages: [{ text: '  ' }] })).rejects.toThrow(/no readable text/);
  });

  it('deletes both the record and the stored text', async () => {
    const up = await service.save('student-1', { name: 'n.pdf', mimeType: 'application/pdf', pages: [{ text }] });
    await service.deleteForUser('student-1', up.uploadId);
    expect(docs.has(up.uploadId)).toBe(false);
    expect(files.has(up.storagePath)).toBe(false);
  });
});
