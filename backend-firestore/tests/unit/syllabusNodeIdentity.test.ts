/**
 * Stage 1 — syllabus node identity contract.
 *
 * The graph service is faked with an in-memory node set so these assert on the CONTRACT rather
 * than on Firestore. The cases that matter most are the refusals: a well-formed id belonging to
 * another exam, and an id that resolves nowhere. Both are how a learning graph silently fills with
 * wrong relationships, and neither produces an obvious symptom later.
 */

interface FakeNode { id: string; type: string; label: string; parentEntityId?: string }

const nodes: FakeNode[] = [];
let readCount = 0;

const mockGraph = {
  async getSyllabusNodes(params: { examId: string; cycleId?: string; syllabusId?: string }) {
    readCount++;
    return nodes.filter((n) =>
      n.id.split(':')[1] === params.examId &&
      (!params.syllabusId || n.id.split(':')[3] === params.syllabusId));
  },
  async getSyllabusNode(params: { examId: string; nodeId: string }) {
    readCount++;
    return nodes.find((n) => n.id === params.nodeId && n.id.split(':')[1] === params.examId) ?? null;
  },
  async validateNodeForQuestion(params: { examId: string; nodeId: string; allowedTypes?: string[] }) {
    const node = await mockGraph.getSyllabusNode(params);
    const allowed = params.allowedTypes ?? ['TOPIC', 'SUBTOPIC'];
    if (!node) return { valid: false, node: null, reason: 'NODE_NOT_FOUND_FOR_EXAM_OR_VERSION' };
    if (!allowed.includes(node.type)) return { valid: false, node, reason: `NODE_TYPE_NOT_VALID_FOR_QUESTION:${node.type}` };
    return { valid: true, node };
  },
};

jest.mock('../../src/services/exam/syllabusGraph.service', () => ({
  syllabusGraphService: mockGraph,
}));

import {
  parseSyllabusNodeId, validateSyllabusNodeId, validateSyllabusNodeIdsBatch,
  resolveSyllabusNode, getSyllabusAncestors, getSyllabusChildren,
} from '../../src/services/exam/syllabusNodeIdentity';

const SSC_TOPIC = 'topic:SSC_CGL:2026:syl_ssc_cgl_2026_2026_v1:percentages_ratio:48be7adeec5d';
const SSC_SUBJECT = 'subject:SSC_CGL:2026:syl_ssc_cgl_2026_2026_v1:quantitative_aptitude:aa11bb22cc33';
const JEE_TOPIC = 'topic:JEE_MAIN:2026:syl_jee_main_2026_2026_v1:unit_14_trigonometry:1974ab0d3f65';

beforeEach(() => {
  nodes.length = 0;
  nodes.push(
    { id: SSC_SUBJECT, type: 'SUBJECT', label: 'Quantitative Aptitude' },
    { id: SSC_TOPIC, type: 'TOPIC', label: 'Percentages, Ratio', parentEntityId: SSC_SUBJECT },
    { id: JEE_TOPIC, type: 'TOPIC', label: 'Unit 14 Trigonometry' },
  );
  readCount = 0;
});

describe('parsing', () => {
  it('splits a canonical id into its coordinates', () => {
    expect(parseSyllabusNodeId(SSC_TOPIC)).toEqual({
      type: 'topic', examId: 'SSC_CGL', cycleId: '2026',
      syllabusId: 'syl_ssc_cgl_2026_2026_v1', slug: 'percentages_ratio', fingerprint: '48be7adeec5d',
    });
  });

  it('rejects things that are not canonical ids', () => {
    for (const bad of ['', 'Modern History', 'topic:SSC_CGL', 'a:b:c:d:e:f', 'algebra']) {
      expect(parseSyllabusNodeId(bad)).toBeNull();
    }
  });

  it('is pure — parsing never reads', () => {
    parseSyllabusNodeId(SSC_TOPIC);
    expect(readCount).toBe(0);
  });
});

describe('validation', () => {
  it('accepts a real node for its own exam', async () => {
    const r = await validateSyllabusNodeId({ examId: 'SSC_CGL', syllabusNodeId: SSC_TOPIC });
    expect(r.code).toBe('VALID');
    expect(r.valid).toBe(true);
    expect(r.node?.label).toBe('Percentages, Ratio');
  });

  it('treats a missing id as absent, not invalid', async () => {
    const r = await validateSyllabusNodeId({ examId: 'SSC_CGL', syllabusNodeId: null });
    expect(r.code).toBe('MISSING_NODE_ID');
    expect(r.valid).toBe(false);
  });

  it('rejects a display name used as identity', async () => {
    const r = await validateSyllabusNodeId({ examId: 'SSC_CGL', syllabusNodeId: 'Modern History' });
    expect(r.code).toBe('MALFORMED_NODE_ID');
  });

  it('rejects an id that resolves nowhere', async () => {
    const ghost = 'topic:SSC_CGL:2026:syl_ssc_cgl_2026_2026_v1:invented_topic:deadbeef1234';
    const r = await validateSyllabusNodeId({ examId: 'SSC_CGL', syllabusNodeId: ghost });
    expect(r.code).toBe('NODE_NOT_FOUND');
  });

  it('rejects a node type a question may not point at', async () => {
    const r = await validateSyllabusNodeId({ examId: 'SSC_CGL', syllabusNodeId: SSC_SUBJECT });
    expect(r.code).toBe('NODE_TYPE_NOT_ALLOWED');
  });

  it('normalises the caller exam id before comparing', async () => {
    for (const form of ['ssc-cgl', 'SSC_CGL', 'Ssc Cgl']) {
      const r = await validateSyllabusNodeId({ examId: form, syllabusNodeId: SSC_TOPIC });
      expect(r.code).toBe('VALID');
    }
  });
});

describe('cross-exam isolation', () => {
  it("refuses a JEE node presented as SSC's", async () => {
    const r = await validateSyllabusNodeId({ examId: 'SSC_CGL', syllabusNodeId: JEE_TOPIC });
    expect(r.code).toBe('WRONG_EXAM');
    expect(r.detail).toContain('JEE_MAIN');
  });

  it('decides a wrong exam WITHOUT reading — the exam is inside the id', async () => {
    await validateSyllabusNodeId({ examId: 'SSC_CGL', syllabusNodeId: JEE_TOPIC });
    expect(readCount).toBe(0);
  });

  it('the same slug under two exams is two different identities', () => {
    const a = parseSyllabusNodeId('topic:SSC_CGL:2026:syl_a:algebra:aaaaaa')!;
    const b = parseSyllabusNodeId('topic:JEE_MAIN:2026:syl_b:algebra:bbbbbb')!;
    expect(a.slug).toBe(b.slug);          // the label collides, exactly as slug-keyed mastery did
    expect(a.examId).not.toBe(b.examId);  // the identity does not
  });

  it('resolveSyllabusNode returns null across exams', async () => {
    expect(await resolveSyllabusNode('SSC_CGL', JEE_TOPIC)).toBeNull();
  });
});

describe('batch validation', () => {
  it('classifies a mixed batch correctly', async () => {
    const r = await validateSyllabusNodeIdsBatch([
      { examId: 'SSC_CGL', syllabusNodeId: SSC_TOPIC },
      { examId: 'SSC_CGL', syllabusNodeId: JEE_TOPIC },
      { examId: 'SSC_CGL', syllabusNodeId: 'Modern History' },
      { examId: 'SSC_CGL', syllabusNodeId: null },
      { examId: 'JEE_MAIN', syllabusNodeId: JEE_TOPIC },
    ]);
    expect(r.map((x) => x.code)).toEqual([
      'VALID', 'WRONG_EXAM', 'MALFORMED_NODE_ID', 'MISSING_NODE_ID', 'VALID',
    ]);
  });

  it('does not read once per item', async () => {
    const many = Array.from({ length: 200 }, () => ({ examId: 'SSC_CGL', syllabusNodeId: SSC_TOPIC }));
    readCount = 0;
    await validateSyllabusNodeIdsBatch(many);
    // One read for the single (exam, version) referenced — not 200.
    expect(readCount).toBe(1);
  });

  it('is deterministic — the same input yields the same verdicts', async () => {
    const items = [{ examId: 'SSC_CGL', syllabusNodeId: SSC_TOPIC }, { examId: 'SSC_CGL', syllabusNodeId: JEE_TOPIC }];
    const a = await validateSyllabusNodeIdsBatch(items);
    const b = await validateSyllabusNodeIdsBatch(items);
    expect(a.map((x) => x.code)).toEqual(b.map((x) => x.code));
  });
});

describe('graph traversal', () => {
  it('returns ancestors as nodes, not labels', async () => {
    const anc = await getSyllabusAncestors('SSC_CGL', SSC_TOPIC);
    expect(anc.map((n) => n.id)).toEqual([SSC_SUBJECT]);
  });

  it('returns direct children', async () => {
    const kids = await getSyllabusChildren('SSC_CGL', SSC_SUBJECT);
    expect(kids.map((n) => n.id)).toEqual([SSC_TOPIC]);
  });

  it('survives a malformed parent cycle instead of hanging', async () => {
    nodes.find((n) => n.id === SSC_SUBJECT)!.parentEntityId = SSC_TOPIC;  // subject -> topic -> subject
    const anc = await getSyllabusAncestors('SSC_CGL', SSC_TOPIC);
    expect(anc.length).toBeLessThan(5);
  });
});
