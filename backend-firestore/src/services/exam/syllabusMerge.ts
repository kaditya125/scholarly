/**
 * J.9 — deterministic merge of per-chunk extraction results.
 *
 * A CHUNK IS NOT A SYLLABUS. Each chunk yields a fragment of hierarchy; this module reassembles
 * them into one structure, in document order, without ever asking a model which version to believe.
 *
 * THE RULE THAT MATTERS MOST — identity is the ORDERED PARENT PATH, never the name:
 *
 *     Quantitative Aptitude → Algebra
 *     General Reasoning     → Algebra
 *
 * are two DIFFERENT topics that happen to share a label. Merging them because the names match is
 * the free-text collision this programme exists to eliminate, so nodes are keyed by their full path
 * and identical names under different parents stay separate.
 *
 * Conversely, the SAME path appearing in two chunks — normal for a syllabus table that spans a page
 * break — is one node, and its children are unioned in first-seen order.
 *
 * CONTRADICTIONS FAIL. If two chunks describe the same path with a different node TYPE, that is not
 * a merge to be resolved by preference or by recency; it means the extraction disagrees with itself
 * and the document cannot be trusted to produce a canonical syllabus. Choosing a winner would be
 * the model deciding structure by accident of ordering.
 */

/** What the model is allowed to return: names, types, order, and children. No identifiers. */
export interface ExtractedNode {
  name: string;
  type: 'STAGE' | 'PAPER' | 'SUBJECT' | 'TOPIC' | 'SUBTOPIC';
  order?: number;
  marks?: number | null;
  questionCount?: number | null;
  durationMinutes?: number | null;
  children?: ExtractedNode[];
}

export interface ChunkExtraction {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  nodes: ExtractedNode[];
}

export interface MergeConflict {
  code: 'TYPE_CONFLICT' | 'EMPTY_NAME' | 'INVALID_TYPE' | 'DEPTH_EXCEEDED';
  path: string;
  detail: string;
  /** Chunks that disagreed, so a human can open the right pages of the official document. */
  chunkIndexes: number[];
}

export interface MergedNode {
  name: string;
  type: ExtractedNode['type'];
  order: number;
  marks?: number | null;
  questionCount?: number | null;
  durationMinutes?: number | null;
  /** Ordered ancestor official names — the node's canonical coordinates. */
  parentPath: string[];
  children: MergedNode[];
  /** Every chunk that contributed to this node. Provenance for "where did this come from?". */
  sourceChunks: number[];
  sourcePages: Array<{ pageStart: number; pageEnd: number }>;
}

export interface MergeResult {
  nodes: MergedNode[];
  conflicts: MergeConflict[];
  /** Total nodes in the merged tree. */
  nodeCount: number;
}

const VALID_TYPES: ExtractedNode['type'][] = ['STAGE', 'PAPER', 'SUBJECT', 'TOPIC', 'SUBTOPIC'];
const MAX_DEPTH = 5;

/** Identity key. Case/whitespace-normalised for matching only; the official name is preserved. */
const pathKey = (parentPath: string[], name: string) =>
  [...parentPath, name].map((s) => s.trim().replace(/\s+/g, ' ').toLowerCase()).join('');

/**
 * Merges chunk extractions into one hierarchy, in document order.
 *
 * Chunks are processed by ascending `chunkIndex` so the result depends on the document's own
 * ordering rather than on the order the chunks happened to be extracted or resolved in.
 */
export function mergeChunkExtractions(chunks: ChunkExtraction[]): MergeResult {
  const conflicts: MergeConflict[] = [];
  const byKey = new Map<string, MergedNode>();
  const roots: MergedNode[] = [];
  let nodeCount = 0;

  const visit = (
    node: ExtractedNode,
    parentPath: string[],
    parent: MergedNode | null,
    chunk: ChunkExtraction,
    depth: number,
  ): void => {
    const name = String(node?.name ?? '').trim();
    if (!name) {
      conflicts.push({ code: 'EMPTY_NAME', path: parentPath.join(' → ') || '(root)',
                       detail: 'a node was returned with no official name', chunkIndexes: [chunk.chunkIndex] });
      return;
    }
    if (!VALID_TYPES.includes(node.type)) {
      conflicts.push({ code: 'INVALID_TYPE', path: [...parentPath, name].join(' → '),
                       detail: `unknown node type "${node.type}"`, chunkIndexes: [chunk.chunkIndex] });
      return;
    }
    if (depth > MAX_DEPTH) {
      conflicts.push({ code: 'DEPTH_EXCEEDED', path: [...parentPath, name].join(' → '),
                       detail: `hierarchy deeper than ${MAX_DEPTH} levels`, chunkIndexes: [chunk.chunkIndex] });
      return;
    }

    const key = pathKey(parentPath, name);
    let merged = byKey.get(key);

    if (!merged) {
      merged = {
        name, type: node.type,
        order: typeof node.order === 'number' ? node.order : (parent ? parent.children.length + 1 : roots.length + 1),
        marks: node.marks ?? undefined,
        questionCount: node.questionCount ?? undefined,
        durationMinutes: node.durationMinutes ?? undefined,
        parentPath: [...parentPath],
        children: [],
        sourceChunks: [chunk.chunkIndex],
        sourcePages: [{ pageStart: chunk.pageStart, pageEnd: chunk.pageEnd }],
      };
      byKey.set(key, merged);
      nodeCount++;
      if (parent) parent.children.push(merged); else roots.push(merged);
    } else {
      // Same canonical path seen again — normal when a section spans a page break.
      if (merged.type !== node.type) {
        // NOT resolvable. Two chunks disagree about what this thing IS.
        conflicts.push({
          code: 'TYPE_CONFLICT',
          path: [...parentPath, name].join(' → '),
          detail: `declared ${merged.type} in chunk ${merged.sourceChunks[0]} and ` +
                  `${node.type} in chunk ${chunk.chunkIndex}`,
          chunkIndexes: [...merged.sourceChunks, chunk.chunkIndex],
        });
        return;
      }
      if (!merged.sourceChunks.includes(chunk.chunkIndex)) {
        merged.sourceChunks.push(chunk.chunkIndex);
        merged.sourcePages.push({ pageStart: chunk.pageStart, pageEnd: chunk.pageEnd });
      }
      // Fill in facts a later chunk supplied and an earlier one omitted. Never overwrite: the first
      // statement of a value wins, so the merge cannot flip based on chunk ordering.
      if (merged.marks == null && node.marks != null) merged.marks = node.marks;
      if (merged.questionCount == null && node.questionCount != null) merged.questionCount = node.questionCount;
      if (merged.durationMinutes == null && node.durationMinutes != null) merged.durationMinutes = node.durationMinutes;
    }

    for (const child of node.children ?? []) {
      visit(child, [...parentPath, name], merged, chunk, depth + 1);
    }
  };

  for (const chunk of [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex)) {
    for (const node of chunk.nodes ?? []) visit(node, [], null, chunk, 1);
  }

  return { nodes: roots, conflicts, nodeCount };
}

// ─── Assembly into the persisted schema ──────────────────────────────────────────────────────

/**
 * Converts the merged tree into the existing `ExamStage[]` shape.
 *
 * THE ID FIELDS ARE FILLED WITH CANONICAL IDS, by the J.1 generator, from the version's own
 * coordinates. There is deliberately no second identifier scheme: `stageId`, `paperId`,
 * `subjectId`, `topicId` and `subtopicId` now hold exactly what `buildCanonicalGraph` will
 * independently derive for the same node, because both call `canonicalNodeId` with the same
 * (examId, cycleId, syllabusId, type, ordered parent path, official name).
 *
 * That closes the defect J.8 found: those fields used to be model-authored slugs, and the Pinecone
 * indexer keyed its vectors on them. A model that renamed a slug between two runs would have
 * orphaned every vector for that topic. Now the model never sees them.
 *
 * The required nesting (STAGE → PAPER → SUBJECT → TOPIC → SUBTOPIC) is the one the persisted schema
 * and the graph validator already enforce; a document that does not fit it is reported as a
 * structural error rather than being bent into shape, because inventing a stage the official
 * document does not have is exactly the fabrication this pipeline forbids.
 */
export function toExamStages(
  merged: MergedNode[],
  scope: { examId: string; cycleId: string; syllabusId: string },
  canonicalId: (p: {
    examId: string; cycleId: string; syllabusId: string;
    type: ExtractedNode['type']; parentPath: string[]; officialName: string;
  }) => string,
): { stages: any[]; errors: MergeConflict[] } {
  const errors: MergeConflict[] = [];
  const idFor = (n: MergedNode) => canonicalId({
    ...scope, type: n.type, parentPath: n.parentPath, officialName: n.name,
  });

  const expect = (n: MergedNode, type: ExtractedNode['type']): boolean => {
    if (n.type === type) return true;
    errors.push({
      code: 'INVALID_TYPE',
      path: [...n.parentPath, n.name].join(' → '),
      detail: `expected ${type} at this level, found ${n.type}`,
      chunkIndexes: n.sourceChunks,
    });
    return false;
  };

  const stages = merged
    .filter((stage) => expect(stage, 'STAGE'))
    .map((stage, si) => ({
      stageId: idFor(stage),
      name: stage.name,
      order: stage.order ?? si + 1,
      papers: stage.children.filter((p) => expect(p, 'PAPER')).map((paper, pi) => ({
        paperId: idFor(paper),
        name: paper.name,
        order: paper.order ?? pi + 1,
        subjects: paper.children.filter((s) => expect(s, 'SUBJECT')).map((subject, sj) => ({
          subjectId: idFor(subject),
          name: subject.name,
          order: subject.order ?? sj + 1,
          marks: subject.marks ?? undefined,
          questionCount: subject.questionCount ?? undefined,
          durationMinutes: subject.durationMinutes ?? undefined,
          topics: subject.children.filter((t) => expect(t, 'TOPIC')).map((topic, ti) => ({
            topicId: idFor(topic),
            name: topic.name,
            order: topic.order ?? ti + 1,
            subtopics: topic.children.filter((st) => expect(st, 'SUBTOPIC')).map((sub, k) => ({
              subtopicId: idFor(sub),
              name: sub.name,
              order: sub.order ?? k + 1,
            })),
          })),
        })),
      })),
    }));

  return { stages, errors };
}
