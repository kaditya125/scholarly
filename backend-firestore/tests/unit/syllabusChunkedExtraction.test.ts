/**
 * J.9 — deterministic chunked extraction, merge, and identity ownership.
 *
 * The defect being removed: extraction refused any document over 50,000 characters, because the
 * only alternative at the time was `rawText.slice(0, 50000)` — a silent truncation that publishes
 * half a syllabus as if it were whole. Real exam notices are 60–100 pages, so the ceiling made real
 * ingestion impossible.
 *
 * Chunking removes the ceiling. These lock the properties that make it safe rather than merely
 * possible: same bytes → same chunks, nothing dropped, contradictions fail instead of being
 * resolved by ordering, and the model never owns an identifier.
 */
import {
  chunkExtractedBlocks, assertNoTextLost, MAX_CHUNK_CHARS,
} from '../../src/services/exam/syllabusChunking';
import {
  mergeChunkExtractions, toExamStages, ChunkExtraction, ExtractedNode,
} from '../../src/services/exam/syllabusMerge';
import { canonicalNodeId } from '../../src/services/exam/syllabusCanonicalGraph';
import type { ExtractedBlock } from '../../src/core/pipeline/types';
import fs from 'fs';
import path from 'path';

const HASH = 'a'.repeat(64);
const SCOPE = { examId: 'SSC_CGL', cycleId: '2026', syllabusId: 'syl_v1' };

const block = (seq: number, page: number, content: string): ExtractedBlock => ({
  documentId: 'd', documentVersionId: 'v', blockId: `b${seq}`, type: 'paragraph' as any,
  content, pageNumber: page, sequence: seq,
  sourceLocation: { pageNumber: page, lineStart: 1, lineEnd: 1, charStart: 0, charEnd: content.length },
});

/** A document of `pages` pages, each `perPage` characters. */
const makeDoc = (pages: number, perPage: number): ExtractedBlock[] =>
  Array.from({ length: pages }, (_, i) =>
    block(i, i + 1, `PAGE${i + 1} ` + 'x'.repeat(Math.max(perPage - 8, 1))));

const node = (name: string, type: ExtractedNode['type'], children: ExtractedNode[] = []): ExtractedNode =>
  ({ name, type, children });

const chunk = (chunkIndex: number, nodes: ExtractedNode[]): ChunkExtraction =>
  ({ chunkIndex, pageStart: chunkIndex + 1, pageEnd: chunkIndex + 1, nodes });

// ═══ CHUNKING ═══════════════════════════════════════════════════════════════════════════════

describe('J.9 chunking is deterministic and lossless', () => {
  it('THE POINT: a document far above the old 50K ceiling is chunked, not rejected', () => {
    const doc = makeDoc(120, 2_500); // ~300K characters, ~100+ pages
    const chunks = chunkExtractedBlocks(doc, HASH);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.text.length <= MAX_CHUNK_CHARS)).toBe(true);
    assertNoTextLost(doc, chunks);
  });

  for (const [label, chars] of [['50K+', 60_000], ['100K+', 120_000], ['250K+', 260_000]] as const) {
    it(`handles a ${label} document without loss`, () => {
      const doc = makeDoc(Math.ceil(chars / 2_000), 2_000);
      const chunks = chunkExtractedBlocks(doc, HASH);
      expect(() => assertNoTextLost(doc, chunks)).not.toThrow();
      expect(chunks.every((c) => c.text.length <= MAX_CHUNK_CHARS)).toBe(true);
    });
  }

  it('same input → byte-identical chunks, every time', () => {
    const doc = makeDoc(40, 3_000);
    const a = chunkExtractedBlocks(doc, HASH);
    const b = chunkExtractedBlocks(doc, HASH);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // ...and the content hashes are stable, which is what makes vector identity idempotent.
    expect(a.map((c) => c.contentHash)).toEqual(b.map((c) => c.contentHash));
  });

  it('block order cannot be changed by the caller — chunking re-sorts by sequence', () => {
    const doc = makeDoc(20, 2_000);
    const shuffled = [...doc].reverse();
    expect(JSON.stringify(chunkExtractedBlocks(shuffled, HASH)))
      .toBe(JSON.stringify(chunkExtractedBlocks(doc, HASH)));
  });

  it('chunks carry page ranges, index and provenance', () => {
    const chunks = chunkExtractedBlocks(makeDoc(30, 3_000), HASH);
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
      expect(c.documentHash).toBe(HASH);
      expect(c.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(c.pageStart).toBeLessThanOrEqual(c.pageEnd);
    });
    // Document order is preserved across chunks.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].pageStart).toBeGreaterThanOrEqual(chunks[i - 1].pageStart);
    }
  });

  it('a single page larger than the whole budget is split deterministically, and flagged', () => {
    const huge = [block(0, 1, 'y'.repeat(MAX_CHUNK_CHARS * 3))];
    const chunks = chunkExtractedBlocks(huge, HASH);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.splitWithinBlock)).toBe(true);
    expect(chunks.every((c) => c.text.length <= MAX_CHUNK_CHARS)).toBe(true);
    assertNoTextLost(huge, chunks);
    expect(JSON.stringify(chunkExtractedBlocks(huge, HASH))).toBe(JSON.stringify(chunks));
  });

  it('empty pages and blank blocks are dropped without disturbing the rest', () => {
    const doc = [block(0, 1, 'real content one'), block(1, 2, '   '), block(2, 3, 'real content two')];
    const chunks = chunkExtractedBlocks(doc, HASH);
    const joined = chunks.map((c) => c.text).join(' ');
    expect(joined).toContain('real content one');
    expect(joined).toContain('real content two');
  });

  it('an empty document yields no chunks rather than an empty chunk', () => {
    expect(chunkExtractedBlocks([], HASH)).toEqual([]);
    expect(chunkExtractedBlocks([block(0, 1, '  ')], HASH)).toEqual([]);
  });

  it('assertNoTextLost actually fails when text IS lost', () => {
    // Guards the guard: a check that cannot fail proves nothing.
    const doc = makeDoc(10, 2_000);
    const chunks = chunkExtractedBlocks(doc, HASH);
    expect(() => assertNoTextLost(doc, chunks.slice(0, -1))).toThrow(/lost or altered/i);
  });
});

// ═══ MERGE ══════════════════════════════════════════════════════════════════════════════════

describe('J.9 merge is deterministic and refuses to resolve contradictions', () => {
  it('a section spanning two chunks becomes ONE node with both chunks recorded', () => {
    const r = mergeChunkExtractions([
      chunk(0, [node('Tier I', 'STAGE', [node('Paper I', 'PAPER', [node('Quant', 'SUBJECT', [node('Algebra', 'TOPIC')])])])]),
      chunk(1, [node('Tier I', 'STAGE', [node('Paper I', 'PAPER', [node('Quant', 'SUBJECT', [node('Geometry', 'TOPIC')])])])]),
    ]);
    expect(r.conflicts).toEqual([]);
    expect(r.nodes).toHaveLength(1);
    const topics = r.nodes[0].children[0].children[0].children;
    expect(topics.map((t) => t.name)).toEqual(['Algebra', 'Geometry']);
    expect(r.nodes[0].sourceChunks).toEqual([0, 1]);
  });

  it('THE RULE: the same topic NAME under different parents stays two distinct nodes', () => {
    const r = mergeChunkExtractions([
      chunk(0, [node('Tier I', 'STAGE', [node('P', 'PAPER', [
        node('Quantitative Aptitude', 'SUBJECT', [node('Algebra', 'TOPIC')]),
        node('General Reasoning', 'SUBJECT', [node('Algebra', 'TOPIC')]),
      ])])]),
    ]);
    expect(r.conflicts).toEqual([]);
    const subjects = r.nodes[0].children[0].children;
    expect(subjects).toHaveLength(2);
    // Distinct canonical coordinates, therefore distinct identity.
    const ids = subjects.map((s) => canonicalNodeId({
      ...SCOPE, type: 'TOPIC', parentPath: [...s.children[0].parentPath], officialName: 'Algebra',
    }));
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('contradictory TYPES for the same path FAIL — ordering never decides', () => {
    const r = mergeChunkExtractions([
      chunk(0, [node('Tier I', 'STAGE', [node('Reasoning', 'PAPER')])]),
      chunk(1, [node('Tier I', 'STAGE', [node('Reasoning', 'SUBJECT')])]),
    ]);
    expect(r.conflicts.some((c) => c.code === 'TYPE_CONFLICT')).toBe(true);
    const conflict = r.conflicts.find((c) => c.code === 'TYPE_CONFLICT')!;
    expect(conflict.chunkIndexes).toEqual(expect.arrayContaining([0, 1]));
  });

  it('merge order depends on chunkIndex, not on array order', () => {
    const a = [chunk(0, [node('S', 'STAGE', [node('P1', 'PAPER')])]),
               chunk(1, [node('S', 'STAGE', [node('P2', 'PAPER')])])];
    const forward = mergeChunkExtractions(a);
    const reversed = mergeChunkExtractions([...a].reverse());
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
  });

  it('facts are filled in but never overwritten — first statement wins', () => {
    const withMarks: ExtractedNode = { name: 'Quant', type: 'SUBJECT', marks: 50, children: [] };
    const withOther: ExtractedNode = { name: 'Quant', type: 'SUBJECT', marks: 99, children: [] };
    const r = mergeChunkExtractions([
      chunk(0, [node('T', 'STAGE', [node('P', 'PAPER', [withMarks])])]),
      chunk(1, [node('T', 'STAGE', [node('P', 'PAPER', [withOther])])]),
    ]);
    expect(r.nodes[0].children[0].children[0].marks).toBe(50);
  });

  it('malformed nodes are reported, not silently skipped', () => {
    const r = mergeChunkExtractions([chunk(0, [
      { name: '', type: 'STAGE' } as ExtractedNode,
      { name: 'X', type: 'GALAXY' as any },
    ])]);
    expect(r.conflicts.map((c) => c.code).sort()).toEqual(['EMPTY_NAME', 'INVALID_TYPE']);
  });
});

// ═══ ADVERSARIAL: THE MODEL CANNOT OWN IDENTITY ═════════════════════════════════════════════

describe('J.9 model-supplied identifiers are structurally impossible', () => {
  it('attacker-controlled id fields on model output are ignored entirely', () => {
    const hostile: any = {
      name: 'Algebra', type: 'TOPIC',
      topicId: 'ATTACKER_CONTROLLED', subjectId: 'evil', stageId: 'evil',
      paperId: 'evil', subtopicId: 'evil', id: 'evil', canonicalId: 'evil',
      children: [],
    };
    const r = mergeChunkExtractions([chunk(0, [
      node('T', 'STAGE', [node('P', 'PAPER', [node('Quant', 'SUBJECT', [hostile])])]),
    ])]);
    const { stages, errors } = toExamStages(r.nodes, SCOPE, canonicalNodeId);
    expect(errors).toEqual([]);

    const topic = stages[0].papers[0].subjects[0].topics[0];
    expect(topic.topicId).not.toContain('ATTACKER');
    expect(topic.topicId).not.toContain('evil');
    // It is exactly what the canonical generator derives from the coordinates.
    expect(topic.topicId).toBe(canonicalNodeId({
      ...SCOPE, type: 'TOPIC', parentPath: ['T', 'P', 'Quant'], officialName: 'Algebra',
    }));
  });

  it('duplicate and contradictory model ids cannot collide canonical identity', () => {
    const same = (name: string): any => ({ name, type: 'TOPIC', topicId: 'IDENTICAL_ID', children: [] });
    const r = mergeChunkExtractions([chunk(0, [
      node('T', 'STAGE', [node('P', 'PAPER', [node('Quant', 'SUBJECT', [same('Algebra'), same('Geometry')])])]),
    ])]);
    const { stages } = toExamStages(r.nodes, SCOPE, canonicalNodeId);
    const [t1, t2] = stages[0].papers[0].subjects[0].topics;
    expect(t1.topicId).not.toBe(t2.topicId);
  });

  it('the extraction prompt does not ask for identifiers', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/exam/syllabusIngestion.service.ts'), 'utf8');
    const from = src.indexOf('extractionSystemPrompt');
    const prompt = src.slice(from, src.indexOf('async extractChunk', from));
    for (const forbidden of ['stageId', 'paperId', 'subjectId', 'topicId', 'subtopicId']) {
      expect(prompt).not.toContain(`"${forbidden}"`);
    }
    expect(prompt).toMatch(/Do NOT output any id, slug, key or identifier/i);
  });

  it('canonical ids are version- and exam-isolated', () => {
    const coords = { type: 'TOPIC' as const, parentPath: ['T', 'P', 'Quant'], officialName: 'Algebra' };
    const base = canonicalNodeId({ ...SCOPE, ...coords });
    expect(canonicalNodeId({ ...SCOPE, cycleId: '2027', ...coords })).not.toBe(base);
    expect(canonicalNodeId({ ...SCOPE, syllabusId: 'syl_v2', ...coords })).not.toBe(base);
    expect(canonicalNodeId({ ...SCOPE, examId: 'JEE_MAIN', ...coords })).not.toBe(base);
    expect(canonicalNodeId({ ...SCOPE, ...coords })).toBe(base); // deterministic
  });
});

// ═══ STRUCTURE ══════════════════════════════════════════════════════════════════════════════

describe('J.9 assembly enforces the persisted hierarchy', () => {
  it('a well-formed tree maps to ExamStage[] with canonical ids at every level', () => {
    const r = mergeChunkExtractions([chunk(0, [
      node('Tier I', 'STAGE', [node('Paper I', 'PAPER', [
        node('Quant', 'SUBJECT', [node('Algebra', 'TOPIC', [node('Identities', 'SUBTOPIC')])]),
      ])]),
    ])]);
    const { stages, errors } = toExamStages(r.nodes, SCOPE, canonicalNodeId);
    expect(errors).toEqual([]);
    const s = stages[0];
    for (const id of [s.stageId, s.papers[0].paperId, s.papers[0].subjects[0].subjectId,
                      s.papers[0].subjects[0].topics[0].topicId,
                      s.papers[0].subjects[0].topics[0].subtopics[0].subtopicId]) {
      expect(id).toMatch(/^(stage|paper|subject|topic|subtopic):SSC_CGL:2026:syl_v1:/);
    }
  });

  it('a structure that does not fit the hierarchy is reported, never bent into shape', () => {
    // A SUBJECT at root: real for some exams, but not what the persisted schema models.
    const r = mergeChunkExtractions([chunk(0, [node('Quant', 'SUBJECT')])]);
    const { stages, errors } = toExamStages(r.nodes, SCOPE, canonicalNodeId);
    expect(stages).toEqual([]);
    expect(errors.some((e) => e.code === 'INVALID_TYPE')).toBe(true);
  });
});
