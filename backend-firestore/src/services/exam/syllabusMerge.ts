import { SyllabusNode } from '../../types/exam.types';
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
  type: 'STAGE' | 'PAPER' | 'SECTION' | 'SUBJECT' | 'TOPIC' | 'SUBTOPIC';
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

const VALID_TYPES: ExtractedNode['type'][] = ['STAGE', 'PAPER', 'SECTION', 'SUBJECT', 'TOPIC', 'SUBTOPIC'];
/*
 * A runaway guard, NOT a statement about how deep a syllabus may legitimately be.
 *
 * The original 5 encoded the fixed STAGE>PAPER>SUBJECT>TOPIC>SUBTOPIC ladder, and the official
 * SSC CGL 2026 notice broke it twice: Paper-I needs a SECTION level (6), and Paper-III prints
 * "... > Fundamental principles ... > Financial Accounting > Nature and scope" (7). Since
 * SUBTOPIC now nests into itself, depth is bounded only by what the document actually prints.
 * This value exists solely so a pathological extraction cannot build an unbounded tree.
 */
const MAX_DEPTH = 12;

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
 * Merged tree -> canonical syllabus nodes.
 *
 * Identity is derived, never authored: every nodeId is what `buildCanonicalGraph` will
 * independently compute for the same node, because both call `canonicalNodeId` with the same
 * (examId, cycleId, syllabusId, type, ordered parent path, official name).
 *
 * That closes the defect J.8 found: these fields used to be model-authored slugs and the Pinecone
 * indexer keyed its vectors on them, so a model that renamed a slug between runs orphaned every
 * vector for that topic. The model never sees them now.
 *
 * There is no longer a required ladder to bend a document into. The merge already refuses to
 * choose between contradicting chunks, and the graph validator enforces that each child is
 * strictly deeper than its parent — which permits the level-skipping real syllabi actually do
 * (a stage with subjects and no papers, a section with topics and no subjects) without inventing
 * a level the official document does not contain.
 */
/**
 * Drops branches that contain no TOPIC.
 *
 * Government notices routinely describe the same tier twice: once as a scheme-of-examination
 * TABLE (structure, marks, timings) and once as the SYLLABUS proper. Both extract, and because
 * the headings differ ("Tier-II" vs "Tier-II Examination") the merge keeps them as siblings —
 * one carrying every topic and all the marks metadata, the other carrying nothing but shape.
 *
 * The test is structural, never name similarity: a syllabus tree exists to describe examinable
 * content, so a branch with no topic anywhere beneath it describes none. Collapsing on name
 * resemblance would be guessing, and would eventually merge two genuinely distinct stages.
 *
 * A TOPIC keeps its whole subtree — its subtopics are content, not empty scaffolding.
 */
export function pruneContentlessBranches(nodes: SyllabusNode[]): { nodes: SyllabusNode[]; dropped: string[] } {
  const dropped: string[] = [];
  const hasTopic = (n: SyllabusNode): boolean =>
    n.type === 'TOPIC' || (n.children || []).some(hasTopic);

  const keep = (list: SyllabusNode[], path: string[]): SyllabusNode[] =>
    list
      .filter((n) => {
        if (hasTopic(n)) return true;
        dropped.push([...path, n.name].join(' → '));
        return false;
      })
      .map((n) => (n.type === 'TOPIC' ? n : { ...n, children: keep(n.children || [], [...path, n.name]) }));

  return { nodes: keep(nodes, []), dropped };
}

export function toSyllabusNodes(
  merged: MergedNode[],
  scope: { examId: string; cycleId: string; syllabusId: string },
  canonicalId: (p: {
    examId: string; cycleId: string; syllabusId: string;
    type: ExtractedNode['type']; parentPath: string[]; officialName: string;
  }) => string,
): { nodes: SyllabusNode[]; errors: MergeConflict[]; dropped: string[] } {
  const errors: MergeConflict[] = [];

  const convert = (node: MergedNode, i: number): SyllabusNode => ({
    nodeId: canonicalId({ ...scope, type: node.type, parentPath: node.parentPath, officialName: node.name }),
    type: node.type,
    name: node.name,
    order: node.order ?? i + 1,
    marks: node.marks ?? undefined,
    questionCount: node.questionCount ?? undefined,
    durationMinutes: node.durationMinutes ?? undefined,
    children: (node.children || []).map(convert),
  });

  const { nodes, dropped } = pruneContentlessBranches(merged.map(convert));
  return { nodes, errors, dropped };
}
