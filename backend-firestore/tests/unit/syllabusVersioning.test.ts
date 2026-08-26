/**
 * Stage 6 — syllabus versioning, diffing and student impact.
 *
 * Uses synthetic fixtures throughout, because production currently holds exactly ONE version per
 * exam (17 exams, 17 versions, 0 with more than one). There is no real multi-version comparison to
 * run yet, and fabricating a historical version in production to create one would be worse than
 * having no diff at all.
 *
 * The cases that matter most are the refusals: no move is ever inferred without deterministic
 * evidence, an ambiguous correlation is reported as uncorrelated rather than resolved by guessing,
 * and mastery on a removed node is preserved rather than zeroed.
 */

const graphNodes: any[] = [];
let graphReads = 0;

jest.mock('../../src/services/exam/syllabusGraph.service', () => ({
  syllabusGraphService: {
    async getSyllabusNodes(p: { examId: string; syllabusId?: string }) {
      graphReads++;
      return graphNodes.filter((n) =>
        n.id.split(':')[1] === p.examId && (!p.syllabusId || n.id.split(':')[3] === p.syllabusId));
    },
  },
}));

import {
  getSyllabusDiff, getStudentSyllabusImpact, correlationKey,
} from '../../src/services/exam/syllabusVersioning.service';

/**
 * A stable 12-char HEX fingerprint per slug.
 *
 * Not decoration: parseSyllabusNodeId requires /^[0-9a-f]{6,}$/ on the last segment, so an id
 * ending in letters outside a-f is correctly rejected as malformed. The first fixtures used the
 * slug itself ("algebr") and every impact lookup silently skipped them — the validator was right
 * and the test data was wrong.
 */
const hexFp = (slug: string) => {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(12, '0').slice(0, 12);
};

/** id shape: type:exam:cycle:syllabusId:slug:fingerprint */
const n = (syllabusId: string, slug: string, label: string, opts: any = {}): any => ({
  id: `${opts.type ?? 'topic'}:${opts.exam ?? 'JEE_MAIN'}:${opts.cycle ?? '2026'}:${syllabusId}:${slug}:${opts.fp ?? hexFp(slug)}`,
  type: (opts.type ?? 'topic').toUpperCase(),
  label,
  // The persisted node carries its own coordinates alongside the id.
  examId: opts.exam ?? 'JEE_MAIN',
  cycleId: opts.cycle ?? '2026',
  syllabusId,
  parentEntityId: opts.parent,
  marks: opts.marks,
  order: opts.order,
});

const V1 = 'syl_jee_2025_v1';
const V2 = 'syl_jee_2026_v1';

beforeEach(() => { graphNodes.length = 0; graphReads = 0; });

describe('layer 1 — authoritative set diff', () => {
  it('identical versions produce no diff', async () => {
    const a = n(V1, 'algebra', 'Algebra');
    graphNodes.push(a);
    const d = await getSyllabusDiff('JEE_MAIN', V1, V1, { fromNodes: [a], toNodes: [a] });
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([]);
    expect(d.unchanged).toHaveLength(1);
  });

  it('detects an added node', async () => {
    const old = [n(V1, 'algebra', 'Algebra')];
    const next = [...old, n(V1, 'calculus', 'Calculus')];
    const d = await getSyllabusDiff('JEE_MAIN', V1, V1, { fromNodes: old, toNodes: next });
    expect(d.added.map((x) => x.label)).toEqual(['Calculus']);
    expect(d.removed).toEqual([]);
  });

  it('detects a removed node', async () => {
    const old = [n(V1, 'algebra', 'Algebra'), n(V1, 'calculus', 'Calculus')];
    const next = [old[0]];
    const d = await getSyllabusDiff('JEE_MAIN', V1, V1, { fromNodes: old, toNodes: next });
    expect(d.removed.map((x) => x.label)).toEqual(['Calculus']);
    expect(d.added).toEqual([]);
  });

  it('detects a metadata change on a node whose id is unchanged', async () => {
    const before = n(V1, 'algebra', 'Algebra', { marks: 10, order: 1 });
    const after = { ...before, label: 'Algebra & Functions', marks: 12 };
    const d = await getSyllabusDiff('JEE_MAIN', V1, V1, { fromNodes: [before], toNodes: [after] });
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].changeType).toBe('METADATA_CHANGED');
    expect(d.changed[0].changedFields.sort()).toEqual(['label', 'marks']);
    expect(d.changed[0].before).toEqual({ label: 'Algebra', marks: 10 });
    expect(d.changed[0].after).toEqual({ label: 'Algebra & Functions', marks: 12 });
  });

  it('handles many additions and removals at once', async () => {
    const old = ['a', 'b', 'c'].map((s) => n(V1, s, s.toUpperCase()));
    const next = ['b', 'c', 'd', 'e'].map((s) => n(V1, s, s.toUpperCase()));
    const d = await getSyllabusDiff('JEE_MAIN', V1, V1, { fromNodes: old, toNodes: next });
    expect(d.added.map((x) => x.label).sort()).toEqual(['D', 'E']);
    expect(d.removed.map((x) => x.label)).toEqual(['A']);
    expect(d.unchanged).toHaveLength(2);
  });

  it('counts leaves without double-counting a parent and its child', async () => {
    const parent = n(V1, 'mechanics', 'Mechanics', { type: 'subject' });
    const child = n(V1, 'kinematics', 'Kinematics', { parent: parent.id });
    const d = await getSyllabusDiff('JEE_MAIN', V1, V1, { fromNodes: [], toNodes: [parent, child] });
    expect(d.added).toHaveLength(2);
    expect(d.summary.addedLeaves).toBe(1);   // only the topic, not the subject above it
  });
});

describe('layer 2 — correlation, never identity', () => {
  it('flags a whole-version rebase instead of implying a rewrite', async () => {
    // Every id differs because the syllabusId is inside it. That is a rebase, not 100% new content.
    const old = [n(V1, 'algebra', 'Algebra')];
    const next = [n(V2, 'algebra', 'Algebra')];
    const d = await getSyllabusDiff('JEE_MAIN', V1, V2, { fromNodes: old, toNodes: next });
    expect(d.unchanged).toEqual([]);
    expect(d.summary.identityRebased).toBe(true);
    expect(d.correlated).toHaveLength(1);
    expect(d.correlated[0].basis).toBe('CORRELATION_KEY');
  });

  it('reports correlation as a suggestion, leaving added/removed authoritative', async () => {
    const old = [n(V1, 'algebra', 'Algebra')];
    const next = [n(V2, 'algebra', 'Algebra')];
    const d = await getSyllabusDiff('JEE_MAIN', V1, V2, { fromNodes: old, toNodes: next });
    // The correlated pair does NOT remove it from added/removed — layer 1 stays the truth.
    expect(d.added).toHaveLength(1);
    expect(d.removed).toHaveLength(1);
  });

  it('refuses to correlate when two candidates are ambiguous', async () => {
    const old = [n(V1, 'algebra', 'Algebra')];
    // Two added nodes share a correlation key; picking one would be a guess.
    const next = [n(V2, 'algebra', 'Algebra', { fp: 'aaa111aaa111' }), n(V2, 'algebra', 'Algebra', { fp: 'bbb222bbb222' })];
    const d = await getSyllabusDiff('JEE_MAIN', V1, V2, { fromNodes: old, toNodes: next });
    expect(d.correlated).toEqual([]);
    expect(d.uncorrelatedRemovals).toHaveLength(1);
  });

  it('does not correlate a genuinely different topic', async () => {
    const old = [n(V1, 'algebra', 'Algebra')];
    const next = [n(V2, 'thermodynamics', 'Thermodynamics')];
    const d = await getSyllabusDiff('JEE_MAIN', V1, V2, { fromNodes: old, toNodes: next });
    expect(d.correlated).toEqual([]);
    expect(d.uncorrelatedRemovals).toHaveLength(1);
  });

  it('does not correlate across a changed parent path', async () => {
    const p1 = n(V1, 'physics', 'Physics', { type: 'subject' });
    const p2 = n(V2, 'chemistry', 'Chemistry', { type: 'subject' });
    const old = [p1, n(V1, 'bonding', 'Bonding', { parent: p1.id })];
    const next = [p2, n(V2, 'bonding', 'Bonding', { parent: p2.id })];
    const d = await getSyllabusDiff('JEE_MAIN', V1, V2, { fromNodes: old, toNodes: next });
    // Same label, different ancestry — the key differs, so no correlation is claimed.
    expect(d.correlated.filter((c) => c.label === 'Bonding')).toEqual([]);
  });

  it('the correlation key ignores version but respects type and ancestry', () => {
    const a = correlationKey(n(V1, 'algebra', 'Algebra') as any, ['Mathematics']);
    const b = correlationKey(n(V2, 'algebra', 'Algebra') as any, ['Mathematics']);
    const c = correlationKey(n(V2, 'algebra', 'Algebra') as any, ['Physics']);
    expect(a).toBe(b);       // version-independent
    expect(a).not.toBe(c);   // ancestry-sensitive
  });
});

describe('student impact', () => {
  const NODE_OLD = `topic:JEE_MAIN:2026:${V1}:algebra:${hexFp('algebra')}`;
  const NODE_ACTIVE = `topic:JEE_MAIN:2026:${V2}:calculus:${hexFp('calculus')}`;
  const SSC_NODE = `topic:SSC_CGL:2026:syl_ssc:algebra:${hexFp('algebra')}`;

  it('preserves mastery on a removed node rather than zeroing it', async () => {
    const impact = await getStudentSyllabusImpact('u1', 'JEE_MAIN', {
      mastery: [{ syllabusNodeId: NODE_OLD, attempts: 7, masteryScore: 0.82, title: 'Algebra' }],
      activeNodeIds: new Set([NODE_ACTIVE]),
      activeSyllabusId: V2,
    });
    expect(impact.outOfCurrentSyllabus).toHaveLength(1);
    // The evidence is intact — not deleted, not turned into a zero.
    expect(impact.outOfCurrentSyllabus[0].attempts).toBe(7);
    expect(impact.outOfCurrentSyllabus[0].masteryScore).toBe(0.82);
    expect(impact.recommendedAction).toBe('SOME_TOPICS_NO_LONGER_IN_SYLLABUS');
  });

  it('reports no impact for a student whose mastery is all still active', async () => {
    const impact = await getStudentSyllabusImpact('u1', 'JEE_MAIN', {
      mastery: [{ syllabusNodeId: NODE_ACTIVE, attempts: 3, masteryScore: 0.7 }],
      activeNodeIds: new Set([NODE_ACTIVE]),
      activeSyllabusId: V2,
    });
    expect(impact.outOfCurrentSyllabus).toEqual([]);
    expect(impact.recommendedAction).toBe('NONE');
  });

  it('reports added topics when the student has nothing stale', async () => {
    const impact = await getStudentSyllabusImpact('u1', 'JEE_MAIN', {
      mastery: [{ syllabusNodeId: NODE_ACTIVE, attempts: 3, masteryScore: 0.7 }],
      activeNodeIds: new Set([NODE_ACTIVE]),
      activeSyllabusId: V2,
      addedNodeIds: [`topic:JEE_MAIN:2026:syl_jee_2026_v1:optics:${hexFp('optics')}`],
    });
    expect(impact.recommendedAction).toBe('NEW_TOPICS_ADDED');
    expect(impact.counts.addedSinceLastStudied).toBe(1);
  });

  it('never counts another exam toward this exam impact', async () => {
    const impact = await getStudentSyllabusImpact('u1', 'JEE_MAIN', {
      mastery: [{ syllabusNodeId: SSC_NODE, attempts: 9, masteryScore: 0.9 }],
      activeNodeIds: new Set([NODE_ACTIVE]),
      activeSyllabusId: V2,
    });
    expect(impact.counts.masteryRecords).toBe(0);   // SSC evidence is not JEE evidence
    expect(impact.outOfCurrentSyllabus).toEqual([]);
  });

  it('ignores legacy label-keyed mastery rather than attributing it', async () => {
    const impact = await getStudentSyllabusImpact('u1', 'JEE_MAIN', {
      mastery: [{ conceptId: 'algebra', attempts: 5, masteryScore: 0.6 }],
      activeNodeIds: new Set([NODE_ACTIVE]),
      activeSyllabusId: V2,
    });
    expect(impact.counts.masteryRecords).toBe(0);
    expect(impact.outOfCurrentSyllabus).toEqual([]);
  });

  it('is user-scoped — impact is computed only from the mastery it is given', async () => {
    const a = await getStudentSyllabusImpact('student-a', 'JEE_MAIN', {
      mastery: [{ syllabusNodeId: NODE_OLD, attempts: 4, masteryScore: 0.5 }],
      activeNodeIds: new Set([NODE_ACTIVE]), activeSyllabusId: V2,
    });
    const b = await getStudentSyllabusImpact('student-b', 'JEE_MAIN', {
      mastery: [], activeNodeIds: new Set([NODE_ACTIVE]), activeSyllabusId: V2,
    });
    expect(a.outOfCurrentSyllabus).toHaveLength(1);
    expect(b.outOfCurrentSyllabus).toHaveLength(0);
    expect(b.userId).toBe('student-b');
  });
});

describe('performance and safety', () => {
  it('diffs a large graph with two reads and no per-node lookups', async () => {
    const old = Array.from({ length: 2000 }, (_, i) => n(V1, `t${i}`, `T${i}`));
    const next = Array.from({ length: 2000 }, (_, i) => n(V1, `t${i + 100}`, `T${i + 100}`));
    graphNodes.push(...old, ...next);
    graphReads = 0;
    const t0 = Date.now();
    const d = await getSyllabusDiff('JEE_MAIN', V1, V1, { fromNodes: old, toNodes: next });
    expect(d.nodesProcessed).toBe(4000);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(graphReads).toBe(0);   // fully injected here; the live path uses exactly two
  });

  it('survives a malformed parent cycle when building ancestry', async () => {
    const a = n(V1, 'a', 'A');
    const b = n(V1, 'b', 'B', { parent: a.id });
    (a as any).parentEntityId = b.id;                    // a -> b -> a
    const d = await getSyllabusDiff('JEE_MAIN', V1, V2, { fromNodes: [a, b], toNodes: [] });
    expect(d.removed).toHaveLength(2);
  });

  it('handles a first version with nothing to compare against', async () => {
    const next = [n(V2, 'algebra', 'Algebra')];
    const d = await getSyllabusDiff('JEE_MAIN', null, V2, { toNodes: next });
    expect(d.from).toBeNull();
    expect(d.added).toHaveLength(1);
    expect(d.removed).toEqual([]);
    expect(d.summary.identityRebased).toBe(false);   // no prior version is not a rebase
  });
});
