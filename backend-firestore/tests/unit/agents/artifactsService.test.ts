/**
 * Artifact storage: what gets written where, and who can read it back.
 * Firestore and Cloud Storage are faked; the renderer is real, so the stored bytes are a real PDF.
 */
const docs = new Map<string, any>();
const files = new Map<string, Buffer>();
const savedMetadata: any[] = [];
let listOrderedFails = false;

jest.mock('../../../src/config/firebase', () => ({
  db: {
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
        set: async (data: any) => {
          docs.set(id, data);
        },
        delete: async () => {
          docs.delete(id);
        },
      }),
      where: (_f: string, _op: string, value: string) => {
        const mine = () => [...docs.values()].filter((d) => d.userId === value);
        const page = { docs: mine().map((d) => ({ data: () => d })) };
        return {
          // The ordered path; `listOrderedFails` simulates the composite index not existing yet.
          orderBy: () => ({
            limit: () => ({
              get: async () => {
                if (listOrderedFails) {
                  const err: any = new Error('The query requires an index.');
                  err.code = 9;
                  throw err;
                }
                return { docs: mine().sort((a, b) => b.createdAt - a.createdAt).map((d) => ({ data: () => d })) };
              },
            }),
          }),
          limit: () => ({ get: async () => page }),
        };
      },
    }),
  },
  firebaseApp: {
    storage: () => ({
      bucket: () => ({
        file: (path: string) => ({
          save: async (buffer: Buffer, opts: any) => {
            files.set(path, buffer);
            savedMetadata.push({ path, opts });
          },
          download: async () => {
            if (!files.has(path)) throw new Error(`no such file: ${path}`);
            return [files.get(path)];
          },
          delete: async () => {
            files.delete(path);
          },
        }),
      }),
    }),
  },
}));

import { ArtifactError, ArtifactsService, storagePathFor } from '../../../src/agents/artifacts/artifacts.service';
import { DocumentSpec } from '../../../src/agents/artifacts/artifact.types';

const service = new ArtifactsService();
const spec: DocumentSpec = {
  title: 'Laws of Motion — Formula Chart',
  sections: [{ heading: 'Key formulae', blocks: [{ type: 'formulae', items: [{ formula: 'F = ma' }] }] }],
};

beforeEach(() => {
  docs.clear();
  files.clear();
  savedMetadata.length = 0;
  listOrderedFails = false;
});

describe('ArtifactsService.listForUser', () => {
  it('returns the caller’s artifacts newest first, and nobody else’s', async () => {
    const mine = await service.createDocument({ userId: 'u1', spec });
    docs.get(mine.artifactId).createdAt = 1_000;
    const newer = await service.createDocument({ userId: 'u1', spec });
    docs.get(newer.artifactId).createdAt = 5_000;
    await service.createDocument({ userId: 'someone-else', spec });

    const list = await service.listForUser('u1');
    expect(list.map((a) => a.artifactId)).toEqual([newer.artifactId, mine.artifactId]);
  });

  it('still orders correctly while the composite index is missing', async () => {
    const older = await service.createDocument({ userId: 'u1', spec });
    docs.get(older.artifactId).createdAt = 1_000;
    const newest = await service.createDocument({ userId: 'u1', spec });
    docs.get(newest.artifactId).createdAt = 9_000;

    listOrderedFails = true;
    const list = await service.listForUser('u1');
    expect(list.map((a) => a.artifactId)).toEqual([newest.artifactId, older.artifactId]);
  });
});

describe('ArtifactsService.createDocument', () => {
  it('renders, stores under the owner’s path, and records the version', async () => {
    const doc = await service.createDocument({ userId: 'u1', spec, runId: 'run-1' });
    expect(doc).toMatchObject({ userId: 'u1', runId: 'run-1', kind: 'document', status: 'ready', currentVersion: 1 });

    const version = doc.versions[0];
    expect(version.storagePath).toBe(storagePathFor('u1', doc.artifactId, 1));
    expect(version.pageCount).toBe(1);
    expect(version.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(files.get(version.storagePath)!.subarray(0, 5).toString()).toBe('%PDF-');
    expect(version.sizeBytes).toBe(files.get(version.storagePath)!.length);
  });

  it('never mints a public download token for a student’s document', () => {
    return service.createDocument({ userId: 'u1', spec }).then(() => {
      const meta = JSON.stringify(savedMetadata);
      expect(meta).not.toMatch(/firebaseStorageDownloadTokens/);
      expect(savedMetadata[0].opts.contentType).toBe('application/pdf');
      expect(savedMetadata[0].opts.metadata.metadata.ownerUid).toBe('u1');
    });
  });

  it('keeps the structured spec, so the document can be re-rendered or reused later', async () => {
    const doc = await service.createDocument({ userId: 'u1', spec });
    expect(doc.spec).toEqual(spec);
  });

  it('refuses a malformed document instead of rendering an empty PDF', async () => {
    await expect(service.createDocument({ userId: 'u1', spec: { title: '', sections: [] } })).rejects.toBeInstanceOf(ArtifactError);
    await expect(service.createDocument({ userId: 'u1', spec: { title: 'x' } })).rejects.toMatchObject({ code: 'INVALID_SPEC' });
    expect(files.size).toBe(0);
    expect(docs.size).toBe(0);
  });
});

describe('ownership', () => {
  it('hides another student’s artifact as not found, for metadata and for bytes', async () => {
    const doc = await service.createDocument({ userId: 'owner', spec });
    await expect(service.getForUser(doc.artifactId, 'intruder')).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    await expect(service.readFile(doc.artifactId, 'intruder')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.readFile(doc.artifactId, 'owner')).resolves.toMatchObject({ filename: expect.stringContaining('.pdf') });
  });

  it('returns a safe download filename', async () => {
    const doc = await service.createDocument({ userId: 'u1', spec });
    const { filename } = await service.readFile(doc.artifactId, 'u1');
    expect(filename).toBe('Laws-of-Motion-Formula-Chart-v1.pdf');
  });
});

describe('versioning', () => {
  it('adds a second version without losing the first', async () => {
    const doc = await service.createDocument({ userId: 'u1', spec });
    const updated = await service.addVersion(doc.artifactId, 'u1', {
      ...spec,
      title: 'Laws of Motion — Formula Chart (revised)',
      sections: [{ heading: 'Key formulae', blocks: [{ type: 'formulae', items: [{ formula: 'F = ma' }, { formula: 'p = mv' }] }] }],
    });
    expect(updated.currentVersion).toBe(2);
    expect(updated.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(files.has(storagePathFor('u1', doc.artifactId, 1))).toBe(true);
    expect(files.has(storagePathFor('u1', doc.artifactId, 2))).toBe(true);

    const v1 = await service.readFile(doc.artifactId, 'u1', 1);
    const v2 = await service.readFile(doc.artifactId, 'u1');
    expect(v1.buffer.length).not.toBe(v2.buffer.length);
    expect(v2.filename).toContain('v2');
  });

  it('refuses a version that does not exist', async () => {
    const doc = await service.createDocument({ userId: 'u1', spec });
    await expect(service.readFile(doc.artifactId, 'u1', 7)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('deletes the record and every rendered file', async () => {
    const doc = await service.createDocument({ userId: 'u1', spec });
    await service.addVersion(doc.artifactId, 'u1', spec);
    await service.deleteForUser(doc.artifactId, 'u1');
    expect(docs.size).toBe(0);
    expect(files.size).toBe(0);
  });
});
