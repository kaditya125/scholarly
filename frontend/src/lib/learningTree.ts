import { BookDetail, BookChapter, chapterLabel } from './api/documents';

export interface TreeNode {
  key: string;
  label: string;
  /** Full "Book › Chapter › Topic › Subtopic" path used as the AI tutor scope label. */
  contextLabel: string;
  children: TreeNode[];
}

export interface ChapterTreeNode extends TreeNode {
  sourceId: string;
  chapterNo?: number;
}

function chapterDisplayName(ch: BookChapter): string {
  return chapterLabel(ch);
}

/**
 * Turns a chapter's flat heading list into a nested Topic → Subtopic tree using the leading
 * section number ("3.1" → topic, "3.1.1" → subtopic). Headings without a number are treated as
 * top-level topics. Best-effort — heading quality varies across books.
 */
function parseTopics(headings: string[], sourceId: string, chapterContextLabel: string): TreeNode[] {
  const roots: TreeNode[] = [];
  const stack: { node: TreeNode; depth: number }[] = [];

  headings.forEach((raw, i) => {
    const label = (raw || '').trim();
    if (!label) return;

    const m = label.match(/^(\d+(?:\.\d+)*)/);
    const depth = m ? m[1].split('.').length : 1;

    const node: TreeNode = {
      key: `${sourceId}|h${i}`,
      label,
      contextLabel: `${chapterContextLabel} › ${label}`,
      children: [],
    };

    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();

    if (stack.length) {
      const parent = stack[stack.length - 1].node;
      node.contextLabel = `${parent.contextLabel} › ${label}`;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push({ node, depth });
  });

  return roots;
}

/** Builds the full Book → Chapter → Topic → Subtopic tree from a book's detail payload. */
export function buildBookTree(book: BookDetail): ChapterTreeNode[] {
  const bookName = book.bookName || book.title;
  return book.chapters.map((ch) => {
    const name = chapterDisplayName(ch);
    const chapterNo = parseInt((ch.title.match(/Chapter\s+(\d+)/i) || [])[1] || '0', 10) || undefined;
    const contextLabel = `${bookName} › ${name}`;
    return {
      key: `ch:${ch.sourceId}`,
      sourceId: ch.sourceId,
      label: name,
      contextLabel,
      chapterNo,
      children: parseTopics(ch.headings || [], ch.sourceId, contextLabel),
    };
  });
}

/**
 * Maps the set of selected node keys to the unique chapter sourceIds they belong to — the HARD
 * retrieval scope sent to the backend. Vectors are chapter-grained (metadata.sourceId == the
 * chapter's source id), so a chapter selection (`ch:<sourceId>`) maps directly, and a
 * topic/subtopic selection (`<sourceId>|h<i>`) resolves to its parent chapter's sourceId. This
 * genuinely restricts vector retrieval to the selected chapters; finer intra-chapter topic focus
 * still relies on the soft directive prepended to the query. Derived straight from the keys so it
 * stays correct even if the tree isn't in scope. Empty when nothing is selected (no hard scope →
 * whole notebook, matching the book-level directive).
 */
export function collectScopeSourceIds(selected: Set<string>): string[] {
  const ids = new Set<string>();
  for (const key of selected) {
    if (key.startsWith('ch:')) {
      const sid = key.slice(3).trim();
      if (sid) ids.add(sid);
    } else if (key.includes('|')) {
      const sid = key.split('|')[0].trim();
      if (sid) ids.add(sid);
    }
  }
  return Array.from(ids);
}

/** Collects the context labels of every currently-selected node (chapters, topics, subtopics). */
export function collectContextLabels(nodes: TreeNode[], selected: Set<string>, out: string[] = []): string[] {
  for (const n of nodes) {
    if (selected.has(n.key)) out.push(n.contextLabel);
    if (n.children.length) collectContextLabels(n.children, selected, out);
  }
  return out;
}

/**
 * Builds the tutor directive prepended to the workflow query. It instructs the AI to teach like a
 * personal teacher, restricted to the selected scope (or the whole book if nothing is selected).
 */
export function buildLearningDirective(bookTitle: string, contextLabels: string[]): string {
  if (contextLabels.length === 0) {
    return `You are my personal tutor for the book "${bookTitle}". Teach me strictly from this book. Explain step by step, progressing from fundamentals to advanced. Use clear examples and analogies, and — when I ask — generate MCQs, flashcards, diagrams, practice questions, or summaries, all drawn only from this book. If I drift off-topic, gently guide me back unless I change my focus.`;
  }
  const scope =
    contextLabels.length <= 6
      ? contextLabels.join('; ')
      : `${contextLabels.slice(0, 6).join('; ')} (and ${contextLabels.length - 6} more)`;
  return `You are my personal tutor for "${bookTitle}". Teach me ONLY this selected content: ${scope}. Progress step by step from fundamentals to advanced within this scope, tracking where we are and continuing from there. Use simple explanations, examples, and analogies; and when I ask, generate MCQs, flashcards, diagrams, practice questions, or summaries — all limited strictly to this selected content. If I ask about anything outside this scope, gently remind me and offer to continue, unless I explicitly change my selection.`;
}
