/**
 * Phase A integration test — verification + targeted repair + status transitions.
 *
 * Hermetic (no live Firestore/Pinecone/Gemini): the data stores and the SourceService repair
 * methods are mocked with a controllable in-memory `state`, so we can exercise the real
 * VerificationService orchestration end-to-end:
 *   healthy → verify → corrupt an artifact → verify(+repair) → re-verify → status.
 */

// ── Mocks (hoisted). Implementations are wired in beforeEach against `state`. ──
jest.mock('../../src/repositories/source.repository', () => ({
  sourceRepository: { getSource: jest.fn(), updateSource: jest.fn() },
}));
jest.mock('../../src/repositories/notebook.repository', () => ({
  notebookRepository: { getKGNodes: jest.fn() },
}));
jest.mock('../../src/services/rag/pinecone.service', () => ({
  pineconeService: { fetchVectors: jest.fn() },
}));
jest.mock('../../src/config/firebase', () => ({
  db: { collection: jest.fn() },
  firebaseApp: { storage: jest.fn(() => ({ bucket: () => ({ file: () => ({ exists: async () => [true] }) }) })) },
}));
jest.mock('../../src/services/source.service', () => ({
  sourceService: {
    repairMetadataAndGraph: jest.fn(),
    repairAssets: jest.fn(),
    repairVectors: jest.fn(),
  },
}));

import { verificationService } from '../../src/services/verification.service';
import { sourceRepository } from '../../src/repositories/source.repository';
import { notebookRepository } from '../../src/repositories/notebook.repository';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { db } from '../../src/config/firebase';
import { sourceService } from '../../src/services/source.service';

const ASSET_TYPES = ['SUMMARY', 'FLASHCARDS', 'QUIZ'] as const;

function healthyMetadata() {
  return {
    chapters: [], headings: [], definitions: [{ term: 'Inertia', definition: 'resistance to change in motion' }],
    theorems: [], formulae: [], importantFacts: [], keywords: ['force', 'motion'],
    people: [], places: [], dates: [], learningObjectives: [], difficultyLevel: 'Medium', estimatedStudyTimeMinutes: 30,
  };
}

interface State {
  source: any;
  vectors: Set<string>;
  kgNodes: any[];
  assets: Set<string>;
}
let state: State;

beforeAll(() => {
  process.env.ENABLE_VERIFICATION = 'true';
  process.env.ENABLE_REPAIR = 'true';
  process.env.ENABLE_READY_DEGRADED = 'true';
  process.env.ENABLE_VECTOR_REPAIR = 'false'; // missing vectors must NOT auto-repair here
  delete process.env.FIREBASE_STORAGE_BUCKET; // storage check trivially passes (disabled)
});

beforeEach(() => {
  state = {
    source: {
      id: 'src1', userId: 'u1', notebookId: 'nb1', title: 'Chapter 1',
      status: 'READY', chunksExtracted: 3, metadata: healthyMetadata(),
      // storage path present so the storage check (which runs when a bucket is configured)
      // resolves via the mocked bucket.file().exists() -> [true].
      gcsPath: 'gs://test-bucket/users/u1/uploads/nb1/original/Chapter 1',
      storagePath: 'users/u1/uploads/nb1/original/Chapter 1',
    },
    vectors: new Set(['src1_chunk_0', 'src1_chunk_1', 'src1_chunk_2']),
    kgNodes: [{ id: 'n0', sourceDocIds: ['src1'] }],
    assets: new Set(ASSET_TYPES),
  };

  (sourceRepository.getSource as jest.Mock).mockImplementation(async () => state.source);
  (sourceRepository.updateSource as jest.Mock).mockImplementation(async (_nb: string, _id: string, upd: any) => { Object.assign(state.source, upd); });

  (pineconeService.fetchVectors as jest.Mock).mockImplementation(async (ids: string[]) => {
    const out: Record<string, any> = {};
    for (const id of ids) {
      if (state.vectors.has(id)) out[id] = { id, metadata: { text: 'chunk text', chunkIndex: parseInt(id.split('_chunk_')[1] || '0', 10) } };
    }
    return out;
  });

  (notebookRepository.getKGNodes as jest.Mock).mockImplementation(async () => state.kgNodes);

  (db.collection as jest.Mock).mockImplementation(() => ({
    doc: () => ({
      collection: () => ({
        where: (_field: string, _op: string, val: string) => ({
          get: async () => ({
            docs: state.assets.has(val) ? [{ data: () => ({ type: val, title: `${state.source.title} - ${val}` }) }] : [],
          }),
        }),
      }),
    }),
  }));

  // Repair mocks mutate the in-memory store so the post-repair re-verify actually passes.
  (sourceService.repairAssets as jest.Mock).mockImplementation(async () => { ASSET_TYPES.forEach(t => state.assets.add(t)); return true; });
  (sourceService.repairMetadataAndGraph as jest.Mock).mockImplementation(async () => {
    if (!state.kgNodes.some(n => (n.sourceDocIds || []).includes('src1'))) state.kgNodes.push({ id: 'nR', sourceDocIds: ['src1'] });
    if (!state.source.metadata) state.source.metadata = healthyMetadata();
    return true;
  });
  (sourceService.repairVectors as jest.Mock).mockImplementation(async () => true);
});

afterEach(() => jest.clearAllMocks());

describe('VerificationService — healthy source', () => {
  it('passes with no missing artifacts and marks READY', async () => {
    const result = await verificationService.verifySource(state.source, { repair: true });
    expect(result.passed).toBe(true);
    expect(result.status).toBe('READY');
    expect(result.missingArtifacts).toEqual([]);
    expect(result.repairedArtifacts).toEqual([]);
  });
});

describe('VerificationService — corrupt then repair', () => {
  it('detects a missing SUMMARY asset, repairs it, and resolves READY', async () => {
    state.assets.delete('SUMMARY');
    const result = await verificationService.verifySource(state.source, { repair: true });
    expect(sourceService.repairAssets).toHaveBeenCalled();
    expect(result.repairedArtifacts).toContain('assets');
    expect(result.passed).toBe(true);
    expect(result.status).toBe('READY');
  });

  it('detects missing KG nodes, repairs the graph, and resolves READY', async () => {
    state.kgNodes = []; // metadata still has concepts, so graph IS required
    const result = await verificationService.verifySource(state.source, { repair: true });
    expect(sourceService.repairMetadataAndGraph).toHaveBeenCalled();
    expect(result.repairedArtifacts).toContain('graph');
    expect(result.passed).toBe(true);
    expect(result.status).toBe('READY');
  });
});

describe('VerificationService — unrepairable critical artifact', () => {
  it('marks READY_DEGRADED (never FAILED) when vectors are missing and vector-repair is off', async () => {
    state.vectors.delete('src1_chunk_2');
    const result = await verificationService.verifySource(state.source, { repair: true });
    expect(sourceService.repairVectors).not.toHaveBeenCalled(); // ENABLE_VECTOR_REPAIR=false
    expect(result.missingArtifacts).toContain('vectors');
    expect(result.failures.join(' ')).toMatch(/vectors/);
    expect(result.passed).toBe(false);
    expect(result.status).toBe('READY_DEGRADED');
  });
});

describe('VerificationService — verify-only (no repair)', () => {
  it('reports the gap without attempting repair and resolves READY_DEGRADED', async () => {
    state.assets.delete('QUIZ');
    const result = await verificationService.verifySource(state.source, { repair: false });
    expect(sourceService.repairAssets).not.toHaveBeenCalled();
    expect(result.missingArtifacts).toContain('assets');
    expect(result.repairedArtifacts).toEqual([]);
    expect(result.status).toBe('READY_DEGRADED');
  });
});

describe('VerificationService — persistResult', () => {
  it('writes the resolved status and verification summary onto the source', async () => {
    const result = await verificationService.verifySource(state.source, { repair: false });
    await verificationService.persistResult(state.source, result);
    expect(state.source.status).toBe(result.status);
    expect(state.source.verification).toBeDefined();
    expect(state.source.verification.verificationVersion).toBe(result.verificationVersion);
    expect(state.source.verificationVersion).toBe(result.verificationVersion);
  });
});
