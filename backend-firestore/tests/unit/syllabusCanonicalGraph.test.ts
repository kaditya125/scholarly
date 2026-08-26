/**
 * Canonical syllabus identity and graph validation (J.1).
 *
 * Two audit findings drive every case here:
 *
 *  1. Node ids were minted by the extraction MODEL, so re-ingesting the same official document
 *     could produce different ids and orphan the evidence keyed to the old ones.
 *  2. Ids carried no exam/cycle/version, so SSC CGL 2026 overwrote SSC CGL 2024 in place —
 *     silently repointing 2024 evidence at the 2026 definition.
 *
 * The invariant: identity is a pure function of the authoritative coordinates
 * (examId + cycleId + syllabusId + type + ordered parent path + official name) and nothing else.
 */
import {
  canonicalNodeId, normalizeOfficialName, buildCanonicalGraph, validateCanonicalGraph,
} from '../../src/services/exam/syllabusCanonicalGraph';
import type { ExamSyllabus } from '../../src/types/exam.types';

const syllabus = (over: Partial<ExamSyllabus> & { examId: string; cycleId: string; syllabusId: string }): ExamSyllabus => ({
  version: '1', authority: 'SSC', status: 'DRAFT',
  sourceDocumentUrl: 'https://ssc.gov.in/x.pdf', sourceDocumentHash: 'abc',
  extractedAt: 0, createdAt: 0, updatedAt: 0, stages: [],
  ...over,
} as ExamSyllabus);

/** One realistic shape: Tier I → Paper I → Quantitative Aptitude → {Algebra, Geometry}. */
const stages = (topics: string[] = ['Algebra', 'Geometry']) => ([{
  stageId: 'ignored_by_design', name: 'Tier I', order: 1,
  papers: [{
    paperId: 'ignored', name: 'Paper I', order: 1,
    subjects: [{
      subjectId: 'ignored', name: 'Quantitative Aptitude', order: 1,
      topics: topics.map((t, i) => ({ topicId: 'ignored', name: t, order: i + 1, subtopics: [] })),
    }],
  }],
}] as any);

const topicIds = (s: ExamSyllabus) =>
  buildCanonicalGraph(s).nodes.filter((n) => n.type === 'TOPIC').map((n) => n.id);

describe('normalizeOfficialName', () => {
  it('collapses case and whitespace only', () => {
    expect(normalizeOfficialName('  Algebra   And  Sets ')).toBe('algebra and sets');
  });

  it('does NOT stem, drop stopwords or strip meaningful punctuation', () => {
    // Two officially distinct topics can differ by exactly these characters; merging them would be
    // the silent mis-association this layer exists to prevent.
    expect(normalizeOfficialName('Ratio & Proportion')).not.toBe(normalizeOfficialName('Ratio Proportion'));
    expect(normalizeOfficialName('Algebras')).not.toBe(normalizeOfficialName('Algebra'));
  });
});

describe('2. the same official syllabus ingested twice produces identical ids', () => {
  it('is byte-identical across runs', () => {
    const s = syllabus({ examId: 'SSC_CGL', cycleId: '2026', syllabusId: 'syl_ssc_cgl_2026_v1', stages: stages() });
    expect(topicIds(s)).toEqual(topicIds(s));
    expect(JSON.stringify(buildCanonicalGraph(s))).toBe(JSON.stringify(buildCanonicalGraph(s)));
  });

  it('is unaffected by the *Id slugs on the incoming document', () => {
    // THE REGRESSION: those slugs used to BE the canonical ids. They are now ignored entirely, so
    // a non-deterministic extraction cannot move a node's identity.
    const base = stages();
    const tampered = JSON.parse(JSON.stringify(base));
    tampered[0].stageId = 'llm_renamed_this';
    tampered[0].papers[0].subjects[0].topics[0].topicId = 'llm_invented_slug';

    const a = syllabus({ examId: 'E', cycleId: 'C', syllabusId: 'S', stages: base });
    const b = syllabus({ examId: 'E', cycleId: 'C', syllabusId: 'S', stages: tampered });
    expect(topicIds(a)).toEqual(topicIds(b));
  });
});

describe('3 & 4. different coordinates produce different ids', () => {
  const idFor = (examId: string, cycleId: string, syllabusId: string) =>
    topicIds(syllabus({ examId, cycleId, syllabusId, stages: stages(['Algebra']) }))[0];

  it('3. a different syllabus VERSION produces different ids', () => {
    expect(idFor('SSC_CGL', '2024', 'syl_2024_v1')).not.toBe(idFor('SSC_CGL', '2026', 'syl_2026_v1'));
  });

  it('3b. a different CYCLE alone is enough to differ', () => {
    expect(idFor('SSC_CGL', '2024', 'syl_v1')).not.toBe(idFor('SSC_CGL', '2026', 'syl_v1'));
  });

  it('4. identical topic names in two DIFFERENT EXAMS produce different ids', () => {
    // The cross-exam "Algebra" collision that made label-keyed mastery unsafe.
    expect(idFor('SSC_CGL', '2026', 'syl_a')).not.toBe(idFor('UPSC_CSE', '2026', 'syl_a'));
  });

  it('the id embeds its own coordinates, so it is self-describing', () => {
    const id = idFor('SSC_CGL', '2026', 'syl_ssc_cgl_2026_v1');
    expect(id.startsWith('topic:SSC_CGL:2026:syl_ssc_cgl_2026_v1:')).toBe(true);
  });

  it('the same name under a DIFFERENT parent path produces a different id', () => {
    const a = canonicalNodeId({ examId: 'E', cycleId: 'C', syllabusId: 'S', type: 'TOPIC',
                                parentPath: ['Tier I', 'Paper I', 'Quantitative Aptitude'], officialName: 'Algebra' });
    const b = canonicalNodeId({ examId: 'E', cycleId: 'C', syllabusId: 'S', type: 'TOPIC',
                                parentPath: ['Tier II', 'Paper I', 'Quantitative Aptitude'], officialName: 'Algebra' });
    expect(a).not.toBe(b);
  });

  it('cannot be collapsed by delimiter collision between adjacent path segments', () => {
    // ("ab","c") and ("a","bc") must not join to the same coordinate string.
    const a = canonicalNodeId({ examId: 'E', cycleId: 'C', syllabusId: 'S', type: 'TOPIC',
                                parentPath: ['ab', 'c'], officialName: 'X' });
    const b = canonicalNodeId({ examId: 'E', cycleId: 'C', syllabusId: 'S', type: 'TOPIC',
                                parentPath: ['a', 'bc'], officialName: 'X' });
    expect(a).not.toBe(b);
  });

  it('a different NODE TYPE with the same name produces a different id', () => {
    const t = canonicalNodeId({ examId: 'E', cycleId: 'C', syllabusId: 'S', type: 'TOPIC', parentPath: [], officialName: 'Algebra' });
    const s = canonicalNodeId({ examId: 'E', cycleId: 'C', syllabusId: 'S', type: 'SUBTOPIC', parentPath: [], officialName: 'Algebra' });
    expect(t).not.toBe(s);
  });
});

describe('5 & 6. a topic dropped from a newer version', () => {
  const v2024 = syllabus({ examId: 'SSC_CGL', cycleId: '2024', syllabusId: 'syl_2024', stages: stages(['Algebra', 'Geometry']) });
  const v2026 = syllabus({ examId: 'SSC_CGL', cycleId: '2026', syllabusId: 'syl_2026', stages: stages(['Algebra']) });

  it('5. does not appear in the newer graph', () => {
    const labels = buildCanonicalGraph(v2026).nodes.filter((n) => n.type === 'TOPIC').map((n) => n.label);
    expect(labels).toEqual(['Algebra']);
    expect(labels).not.toContain('Geometry');
  });

  it('6. still exists in the older graph, with its original id', () => {
    const older = buildCanonicalGraph(v2024).nodes.filter((n) => n.type === 'TOPIC');
    expect(older.map((n) => n.label)).toEqual(['Algebra', 'Geometry']);
    // And the surviving topic's id differs across versions, so the graphs cannot alias.
    const a2024 = older.find((n) => n.label === 'Algebra')!.id;
    const a2026 = buildCanonicalGraph(v2026).nodes.find((n) => n.label === 'Algebra')!.id;
    expect(a2024).not.toBe(a2026);
  });
});

describe('validation rejects malformed graphs', () => {
  const expected = { examId: 'E', cycleId: 'C', syllabusId: 'S' };
  const node = (over: any) => ({ label: 'L', type: 'TOPIC', ...expected, order: 1, ...over });

  it('a well-formed graph passes', () => {
    const g = buildCanonicalGraph(syllabus({ ...expected, stages: stages() }));
    expect(validateCanonicalGraph(g, expected)).toEqual({ valid: true, errors: [] });
  });

  it('7. a missing parent is rejected', () => {
    const g = { nodes: [node({ id: 'topic:x', parentEntityId: 'subject:nonexistent' })], edges: [] };
    const r = validateCanonicalGraph(g as any, expected);
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('MISSING_PARENT');
  });

  it('7b. a parentless node BELOW the top level of the document is rejected as an orphan', () => {
    /*
     * The real case: NEET's chunk boundary separated Biology from its later units, and those
     * units came back parentless. The document plainly has a STAGE, so a floating TOPIC is
     * content that lost its parent, not content that sits at the top.
     */
    const g = {
      nodes: [node({ id: 'stage:t', type: 'STAGE' }), node({ id: 'topic:x', type: 'TOPIC' })],
      edges: [],
    };
    const r = validateCanonicalGraph(g as any, expected);
    expect(r.errors.some((e) => e.code === 'ORPHAN_NODE')).toBe(true);
  });

  it('7c. a parentless node AT the top level of the document is accepted', () => {
    // Several BPSC syllabi are two pages listing Paper I and Paper II with no stage anywhere.
    // Demanding a STAGE above them rejects a perfectly well-formed syllabus.
    const g = {
      nodes: [node({ id: 'paper:1', type: 'PAPER' }), node({ id: 'paper:2', type: 'PAPER' })],
      edges: [],
    };
    const r = validateCanonicalGraph(g as any, expected);
    expect(r.errors.filter((e) => e.code === 'ORPHAN_NODE')).toEqual([]);
  });

  it('8. a parent cycle is rejected rather than hanging the ancestor walk', () => {
    const g = {
      nodes: [
        node({ id: 'a', type: 'SUBJECT', parentEntityId: 'b' }),
        node({ id: 'b', type: 'PAPER', parentEntityId: 'a' }),
      ],
      edges: [],
    };
    const r = validateCanonicalGraph(g as any, expected);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'PARENT_CYCLE')).toBe(true);
  });

  it('9. a duplicate canonical path is rejected', () => {
    // Two siblings with the same official name mint the same id — the collision IS the detection.
    const dup = stages(['Algebra', 'Algebra']);
    const g = buildCanonicalGraph(syllabus({ ...expected, stages: dup }));
    const r = validateCanonicalGraph(g, expected);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'DUPLICATE_CANONICAL_PATH')).toBe(true);
  });

  it('an invalid node type is rejected', () => {
    const r = validateCanonicalGraph({ nodes: [node({ id: 'x', type: 'CHAPTER' })], edges: [] } as any, expected);
    expect(r.errors.some((e) => e.code === 'INVALID_NODE_TYPE')).toBe(true);
  });

  it('an INVERTED hierarchy (PAPER under TOPIC) is rejected', () => {
    const g = {
      nodes: [node({ id: 't', type: 'TOPIC' }), node({ id: 'p', type: 'PAPER', parentEntityId: 't' })],
      edges: [],
    };
    expect(validateCanonicalGraph(g as any, expected).errors.some((e) => e.code === 'INVALID_HIERARCHY')).toBe(true);
  });

  it('a SKIPPED level is accepted — real syllabi omit levels', () => {
    // SSC CGL Tier-I lists subjects with no paper; Tier-II Section-III lists topics with no
    // subject. Both are the commission describing its own exam, so neither may be rejected.
    const g = {
      nodes: [
        node({ id: 's', type: 'STAGE' }),
        node({ id: 'sub', type: 'SUBJECT', parentEntityId: 's' }),
        node({ id: 't', type: 'TOPIC', parentEntityId: 'sub' }),
      ],
      edges: [],
    };
    expect(validateCanonicalGraph(g as any, expected).errors.filter((e) => e.code === 'INVALID_HIERARCHY')).toEqual([]);
  });

  it('a SUBTOPIC nested inside a SUBTOPIC is accepted', () => {
    // SSC CGL Paper-III nests seven deep; the leaf has to be able to contain itself.
    const g = {
      nodes: [
        node({ id: 't', type: 'TOPIC' }),
        node({ id: 'st1', type: 'SUBTOPIC', parentEntityId: 't' }),
        node({ id: 'st2', type: 'SUBTOPIC', parentEntityId: 'st1' }),
      ],
      edges: [],
    };
    expect(validateCanonicalGraph(g as any, expected).errors.filter((e) => e.code === 'INVALID_HIERARCHY')).toEqual([]);
  });

  it('an empty identifier is rejected', () => {
    const r = validateCanonicalGraph({ nodes: [node({ id: '', label: '' })], edges: [] } as any, expected);
    expect(r.errors.some((e) => e.code === 'EMPTY_IDENTIFIER')).toBe(true);
  });

  it('a node from another version is rejected, never absorbed', () => {
    const g = { nodes: [node({ id: 'x', type: 'STAGE', cycleId: '9999' })], edges: [] };
    const r = validateCanonicalGraph(g as any, expected);
    expect(r.errors.some((e) => e.code === 'VERSION_MISMATCH')).toBe(true);
  });

  it('an empty graph is INVALID, not silently accepted', () => {
    // "malformed" and "has no topics" must stay distinguishable, or coverage would publish a real
    // 0% denominator for an exam whose extraction simply failed.
    const r = validateCanonicalGraph({ nodes: [], edges: [] }, expected);
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('EMPTY_GRAPH');
  });

  it('reports EVERY error, so one fix at a time is not required', () => {
    const g = {
      nodes: [node({ id: 'a', type: 'TOPIC', parentEntityId: 'missing1' }),
              node({ id: 'b', type: 'TOPIC', parentEntityId: 'missing2' })],
      edges: [],
    };
    expect(validateCanonicalGraph(g as any, expected).errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('10. the model cannot change identity', () => {
  it('application-generated ids win over any slug the extraction supplies', () => {
    const tampered = JSON.parse(JSON.stringify(stages(['Algebra'])));
    tampered[0].papers[0].subjects[0].topics[0].topicId = 'topic:ATTACKER_CONTROLLED';
    const g = buildCanonicalGraph(syllabus({ examId: 'E', cycleId: 'C', syllabusId: 'S', stages: tampered }));
    const topic = g.nodes.find((n) => n.type === 'TOPIC')!;

    expect(topic.id).not.toContain('ATTACKER_CONTROLLED');
    expect(topic.id.startsWith('topic:E:C:S:')).toBe(true);
    // The official NAME is preserved verbatim — the model reports content, not identity.
    expect(topic.label).toBe('Algebra');
  });
});
