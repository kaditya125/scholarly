/**
 * #91 Phase 2 — syllabus read side.
 *
 * These assert the properties the canonical-identity pipeline rests on: a node resolves only
 * within its own exam AND syllabus version, and there is no fuzzy fallback. If either failed, a
 * question could be silently associated with the wrong syllabus and every downstream measurement
 * (mastery, coverage, readiness) would inherit that error.
 */

const nodes: any[] = [];
const makeSnap = () => ({ docs: nodes.map((n) => ({ data: () => n })) });

// Minimal Firestore double: exam_syllabi_graphs/{examId}/nodes[/{docId}]
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: () => ({
      doc: (examId: string) => ({
        collection: () => ({
          get: async () => makeSnap(),
          doc: (docId: string) => ({
            get: async () => {
              // Mirrors the write path's id escaping.
              const found = nodes.find((n) => n.id.replace(/[:/]/g, '_') === docId);
              return { exists: !!found, data: () => found };
            },
          }),
        }),
      }),
    }),
  },
}));

import { syllabusGraphService } from '../../src/services/exam/syllabusGraph.service';

const NODE = {
  id: 'topic:ssc_cgl_quant_algebra', label: 'Algebra', type: 'TOPIC',
  examId: 'ssc_cgl', cycleId: '2026', syllabusId: 'syl_2026_v1',
  parentEntityId: 'subject:ssc_cgl_quant', order: 2,
};
const PARENT = {
  id: 'subject:ssc_cgl_quant', label: 'Quantitative Aptitude', type: 'SUBJECT',
  examId: 'ssc_cgl', cycleId: '2026', syllabusId: 'syl_2026_v1', order: 1,
};
const OLD_VERSION = { ...NODE, id: 'topic:ssc_cgl_quant_algebra_old', syllabusId: 'syl_2024_v1', cycleId: '2024' };
const SUBTOPIC = { ...NODE, id: 'subtopic:ssc_cgl_quant_algebra_identities', label: 'Identities', type: 'SUBTOPIC' };
const STAGE = { ...NODE, id: 'stage:tier_1', label: 'Tier 1', type: 'STAGE' };

beforeEach(() => {
  nodes.length = 0;
  nodes.push(PARENT, NODE, OLD_VERSION, SUBTOPIC, STAGE);
});

describe('getSyllabusNodes', () => {
  it('returns the exam’s nodes ordered', async () => {
    const out = await syllabusGraphService.getSyllabusNodes({ examId: 'ssc_cgl' });
    expect(out.length).toBe(5);
    expect(out[0].order).toBeLessThanOrEqual(out[1].order);
  });

  it('isolates by syllabus version — the denominator must not mix versions', async () => {
    const out = await syllabusGraphService.getSyllabusNodes({ examId: 'ssc_cgl', syllabusId: 'syl_2026_v1' });
    expect(out.map((n) => n.id)).not.toContain('topic:ssc_cgl_quant_algebra_old');
  });

  it('isolates by cycle', async () => {
    const out = await syllabusGraphService.getSyllabusNodes({ examId: 'ssc_cgl', cycleId: '2024' });
    expect(out.map((n) => n.id)).toEqual(['topic:ssc_cgl_quant_algebra_old']);
  });

  it('filters by node type', async () => {
    const out = await syllabusGraphService.getSyllabusNodes({ examId: 'ssc_cgl', type: 'SUBTOPIC' });
    expect(out.every((n) => n.type === 'SUBTOPIC')).toBe(true);
  });

  it('returns empty for a missing examId rather than throwing', async () => {
    expect(await syllabusGraphService.getSyllabusNodes({ examId: '' })).toEqual([]);
  });
});

describe('getSyllabusNode', () => {
  it('resolves an exact node', async () => {
    const n = await syllabusGraphService.getSyllabusNode({ examId: 'ssc_cgl', nodeId: NODE.id });
    expect(n?.label).toBe('Algebra');
  });

  it('rejects a node from a different exam', async () => {
    const n = await syllabusGraphService.getSyllabusNode({ examId: 'neet', nodeId: NODE.id });
    expect(n).toBeNull();
  });

  it('rejects a node from a different syllabus version', async () => {
    const n = await syllabusGraphService.getSyllabusNode({
      examId: 'ssc_cgl', nodeId: NODE.id, syllabusId: 'syl_2024_v1',
    });
    expect(n).toBeNull();
  });

  it('rejects a node from a different cycle', async () => {
    const n = await syllabusGraphService.getSyllabusNode({
      examId: 'ssc_cgl', nodeId: NODE.id, cycleId: '2024',
    });
    expect(n).toBeNull();
  });

  it('returns null for an unknown node — no nearest match', async () => {
    // "Algebra " / "algebra" / "Algebraic identities" must NOT resolve. Identity is exact or absent.
    expect(await syllabusGraphService.getSyllabusNode({ examId: 'ssc_cgl', nodeId: 'topic:algebra' })).toBeNull();
  });
});

describe('validateNodeForQuestion', () => {
  it('accepts a TOPIC', async () => {
    const r = await syllabusGraphService.validateNodeForQuestion({ examId: 'ssc_cgl', nodeId: NODE.id });
    expect(r.valid).toBe(true);
  });

  it('accepts a SUBTOPIC', async () => {
    const r = await syllabusGraphService.validateNodeForQuestion({ examId: 'ssc_cgl', nodeId: SUBTOPIC.id });
    expect(r.valid).toBe(true);
  });

  it('rejects a STAGE — a question is not authored against a whole stage', async () => {
    const r = await syllabusGraphService.validateNodeForQuestion({ examId: 'ssc_cgl', nodeId: STAGE.id });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('NODE_TYPE_NOT_VALID_FOR_QUESTION');
  });

  it('rejects an unknown node with a reason rather than falling back', async () => {
    const r = await syllabusGraphService.validateNodeForQuestion({ examId: 'ssc_cgl', nodeId: 'topic:nope' });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('NODE_NOT_FOUND_FOR_EXAM_OR_VERSION');
  });

  it('rejects a valid node requested against the wrong version', async () => {
    const r = await syllabusGraphService.validateNodeForQuestion({
      examId: 'ssc_cgl', nodeId: NODE.id, syllabusId: 'syl_2024_v1',
    });
    expect(r.valid).toBe(false);
  });
});

describe('getNodeParentPath', () => {
  it('builds readable ancestry for generation context', async () => {
    const path = await syllabusGraphService.getNodeParentPath('ssc_cgl', NODE.id);
    expect(path).toEqual(['Quantitative Aptitude']);
  });

  it('terminates on a malformed parent cycle instead of hanging', async () => {
    nodes.length = 0;
    nodes.push(
      { ...NODE, id: 'a', parentEntityId: 'b', label: 'A' },
      { ...NODE, id: 'b', parentEntityId: 'a', label: 'B' },
    );
    const path = await syllabusGraphService.getNodeParentPath('ssc_cgl', 'a');
    expect(Array.isArray(path)).toBe(true);
  });
});
