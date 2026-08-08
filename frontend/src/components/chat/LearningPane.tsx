import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, X, GraduationCap, Check } from 'lucide-react';
import { BookDetail } from '../../lib/api/documents';
import { buildBookTree, TreeNode } from '../../lib/learningTree';
import { cn } from '../../lib/utils';

interface LearningPaneProps {
  book: BookDetail;
  /** When set (from "Learn this chapter"), only this chapter's subtree is shown. */
  scopeSourceId?: string;
  selected: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
  onClose?: () => void;
  selectedCount: number;
}

/**
 * Right-side learning pane: an expandable Book → Chapter → Topic → Subtopic tree with
 * multi-select. Selecting nodes sets the AI tutor's active learning scope (handled by the parent).
 */
export function LearningPane({ book, scopeSourceId, selected, onToggle, onClear, onClose, selectedCount }: LearningPaneProps) {
  const tree = useMemo(() => buildBookTree(book), [book]);
  const chapters = scopeSourceId ? tree.filter((c) => c.sourceId === scopeSourceId) : tree;

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (scopeSourceId) s.add(`ch:${scopeSourceId}`); // auto-expand the scoped chapter
    return s;
  });

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#151516]">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-200 dark:border-white/10 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <GraduationCap className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold text-slate-900 dark:text-gray-100 leading-tight">
            {scopeSourceId ? 'Chapter contents' : 'Table of contents'}
          </div>
          <div className="text-[11.5px] text-slate-400 dark:text-gray-500 truncate">{book.bookName || book.title}</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
        {chapters.map((ch) => (
          <TreeRow
            key={ch.key}
            node={ch}
            depth={0}
            isChapter
            selected={selected}
            expanded={expanded}
            onToggle={onToggle}
            onToggleExpand={toggleExpand}
          />
        ))}
      </div>

      {/* Footer — active learning scope */}
      <div className="border-t border-slate-200 dark:border-white/10 px-4 py-3 shrink-0">
        {selectedCount > 0 ? (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-indigo-600 dark:text-indigo-300">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              {selectedCount} selected · tutor focused
            </span>
            <button onClick={onClear} className="text-[12px] font-medium text-slate-500 dark:text-gray-400 hover:text-red-500 transition-colors">
              Clear
            </button>
          </div>
        ) : (
          <span className="text-[12px] text-slate-400 dark:text-gray-500">Whole book — tick topics to focus the tutor</span>
        )}
      </div>
    </div>
  );
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  isChapter?: boolean;
  selected: Set<string>;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onToggleExpand: (key: string) => void;
}

function TreeRow({ node, depth, isChapter, selected, expanded, onToggle, onToggleExpand }: TreeRowProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.key);
  const isSel = selected.has(node.key);

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 rounded-lg pr-2 transition-colors',
          isSel ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggleExpand(node.key)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 shrink-0"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-[22px] shrink-0" />
        )}

        {/* Selection checkbox */}
        <button
          onClick={() => onToggle(node.key)}
          className={cn(
            'w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 transition-colors',
            isSel ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-white/25 hover:border-indigo-400'
          )}
          aria-pressed={isSel}
          title={isSel ? 'Remove from focus' : 'Add to focus'}
        >
          {isSel && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </button>

        {/* Label — clicking expands (if it has children) or toggles selection */}
        <button
          onClick={() => (hasChildren ? onToggleExpand(node.key) : onToggle(node.key))}
          className={cn(
            'flex-1 min-w-0 text-left py-1.5 truncate',
            isChapter ? 'text-[13px] font-semibold' : 'text-[12.5px]',
            isSel
              ? 'text-indigo-700 dark:text-indigo-300'
              : isChapter
                ? 'text-slate-800 dark:text-gray-100'
                : 'text-slate-600 dark:text-gray-300'
          )}
          title={node.label}
        >
          {node.label}
        </button>
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children.map((c) => (
            <TreeRow
              key={c.key}
              node={c}
              depth={depth + 1}
              selected={selected}
              expanded={expanded}
              onToggle={onToggle}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}
