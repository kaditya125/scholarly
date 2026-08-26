import React, { useState } from 'react';
import { ChevronRight, CheckCircle2, CircleDot, AlertTriangle, Circle, TrendingUp } from 'lucide-react';
import type { CoverageNode, CoverageState } from '../../lib/api/coverage';

/**
 * The syllabus tree.
 *
 * ── Status is never colour alone ────────────────────────────────────────────────────────────
 * Every state carries an icon AND a written label as well as a colour. Roughly one in twelve men
 * has some form of colour-vision deficiency, and red-vs-green is precisely the pair that fails —
 * which here is the difference between "you are struggling with this" and "you have mastered it".
 * A student must never have to distinguish those by hue.
 *
 * ── Untouched is not a failure ──────────────────────────────────────────────────────────────
 * UNTOUCHED renders in neutral grey with no score, not in red with a zero. It is the default
 * state of every syllabus on day one, and a wall of red would tell a student they are failing at
 * a hundred things they have simply not started.
 *
 * ── Collapsed by default ────────────────────────────────────────────────────────────────────
 * UPSC CSE is 2,120 nodes. Expanding everything would put thousands of rows into the document on
 * a phone; the tree opens one level and the student expands what they care about.
 */

export const STATE_META: Record<CoverageState, {
  label: string; Icon: React.ComponentType<{ className?: string }>; dot: string; text: string; help: string;
}> = {
  MASTERED: {
    label: 'Mastered', Icon: CheckCircle2,
    dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400',
    help: 'Consistently correct across several attempts.',
  },
  STRONG: {
    label: 'Strong', Icon: TrendingUp,
    dot: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-400',
    help: 'Doing well here, with a little more practice to confirm it.',
  },
  LEARNING: {
    label: 'Learning', Icon: CircleDot,
    dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400',
    help: 'You have started this — not enough attempts yet to say more.',
  },
  WEAK: {
    label: 'Needs work', Icon: AlertTriangle,
    dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400',
    help: 'You have practised this, and accuracy needs work.',
  },
  UNTOUCHED: {
    label: 'Not started', Icon: Circle,
    dot: 'bg-slate-300 dark:bg-slate-600', text: 'text-slate-500 dark:text-slate-400',
    help: 'No practice evidence yet.',
  },
};

export const StateBadge: React.FC<{ state: CoverageState; compact?: boolean }> = ({ state, compact }) => {
  const meta = STATE_META[state];
  return (
    <span className={`inline-flex items-center gap-1.5 ${meta.text}`}>
      <meta.Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      {!compact && <span className="text-[12.5px] font-semibold">{meta.label}</span>}
      <span className="sr-only">{meta.label}. {meta.help}</span>
    </span>
  );
};

const Row: React.FC<{
  node: CoverageNode;
  depth: number;
  onSelect: (n: CoverageNode) => void;
  selectedId?: string | null;
}> = ({ node, depth, onSelect, selectedId }) => {
  const [open, setOpen] = useState(depth === 0);
  const hasKids = node.children.length > 0;
  const meta = STATE_META[node.state];
  const selected = selectedId === node.nodeId;

  return (
    <li>
      <div
        className={`flex items-center gap-2 rounded-lg px-2 py-2 transition-colors ${
          selected ? 'bg-slate-100 dark:bg-white/[0.08]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasKids ? (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${node.label}`}
            className="p-0.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} aria-hidden="true" />

        <button
          onClick={() => onSelect(node)}
          className="flex-1 min-w-0 text-left"
        >
          <span className={`block truncate text-[14px] ${
            depth === 0 ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'
          }`}>
            {node.label}
          </span>
        </button>

        <StateBadge state={node.state} compact />
        {node.attempts > 0 && (
          <span className="text-[11.5px] tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
            {node.attempts}×
          </span>
        )}
      </div>

      {hasKids && open && (
        <ul>
          {node.children.map((c) => (
            <Row key={c.nodeId} node={c} depth={depth + 1} onSelect={onSelect} selectedId={selectedId} />
          ))}
        </ul>
      )}
    </li>
  );
};

export const CoverageTree: React.FC<{
  subjects: CoverageNode[];
  onSelect: (n: CoverageNode) => void;
  selectedId?: string | null;
}> = ({ subjects, onSelect, selectedId }) => (
  <ul role="tree" aria-label="Syllabus coverage">
    {subjects.map((s) => (
      <Row key={s.nodeId} node={s} depth={0} onSelect={onSelect} selectedId={selectedId} />
    ))}
  </ul>
);

export default CoverageTree;
