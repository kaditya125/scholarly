import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Sparkles, MessageSquare, AlertTriangle, Loader2 } from 'lucide-react';
import { useProfile } from '../hooks/api/useProfile';
import { useSyllabusCoverage } from '../hooks/api/useCoverage';
import CoverageTree, { STATE_META, StateBadge } from '../components/syllabus/CoverageTree';
import type { CoverageNode } from '../lib/api/coverage';

/**
 * Stage 3 — the syllabus coverage map.
 *
 * The one question this page answers is "what have I covered, and what should I work on next?"
 * — measured against the syllabus the commission published, not against activity. Hours studied
 * and quizzes taken are effort; this is progress, and they are not the same thing.
 *
 * Nothing here recomputes a state from a score. The server owns the thresholds and sends the
 * state per node; a component that decided for itself what counts as "weak" would drift out of
 * agreement with the API and describe the same node two ways.
 */

const PERCENT_RING = 132;

export default function SyllabusCoverage() {
  const { profile } = useProfile() as any;
  const navigate = useNavigate();
  const [selected, setSelected] = useState<CoverageNode | null>(null);

  /*
   * The exam the student is actually preparing for, from their onboarding profile. Read from the
   * same place the rest of the product reads it, rather than introducing a second notion of
   * "current exam" that could disagree with the header.
   */
  const examId: string | undefined = profile?.targetExam || profile?.goal || undefined;

  const { data, isLoading, isError } = useSyllabusCoverage(examId);

  const needsAttention = useMemo(() => {
    if (!data) return [];
    const out: CoverageNode[] = [];
    const walk = (ns: CoverageNode[]) => ns.forEach((n) => { if (n.state === 'WEAK') out.push(n); walk(n.children); });
    walk(data.subjects);
    return out.slice(0, 8);
  }, [data]);

  const notStarted = useMemo(() => {
    if (!data) return [];
    const out: CoverageNode[] = [];
    const walk = (ns: CoverageNode[]) => ns.forEach((n) => { if (n.isLeaf && n.state === 'UNTOUCHED') out.push(n); walk(n.children); });
    walk(data.subjects);
    return out;
  }, [data]);

  if (!examId) {
    return (
      <Shell>
        <Empty
          title="Choose your exam first"
          body="Your coverage map is built from the syllabus of the exam you're preparing for."
          cta="Set my exam"
          onCta={() => navigate('/onboarding')}
        />
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-20 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Building your coverage map…
        </div>
      </Shell>
    );
  }

  if (isError || !data) {
    return (
      <Shell>
        <Empty
          title="Couldn't load your coverage"
          body="This is on us, not you. Your progress is safe — try again in a moment."
          cta="Retry"
          onCta={() => window.location.reload()}
        />
      </Shell>
    );
  }

  const { totals } = data;
  const nothingYet = totals.addressable > 0 && totals.untouched === totals.addressable;

  return (
    <Shell>
      {/* ── summary ─────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10">
        <Ring percent={data.coveragePercent} />
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {data.examId.replace(/_/g, ' ')} · syllabus coverage
          </p>
          <h1 className="mt-1.5 text-[26px] sm:text-[30px] font-bold tracking-tight text-slate-900 dark:text-white">
            {nothingYet ? 'Your syllabus starts here' : `${data.coveragePercent}% covered`}
          </h1>
          <p className="mt-1.5 text-[14.5px] text-slate-600 dark:text-slate-300">
            {nothingYet
              ? `${totals.addressable} topics from the official syllabus, waiting for you.`
              : `${totals.addressable - totals.untouched} of ${totals.addressable} topics have practice evidence.`}
          </p>
        </div>
      </div>

      {/* ── counts ──────────────────────────────────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(['MASTERED', 'STRONG', 'LEARNING', 'WEAK', 'UNTOUCHED'] as const).map((s) => {
          const key = s.toLowerCase() as keyof typeof totals;
          const meta = STATE_META[s];
          return (
            <div key={s} className="rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-3">
              <div className="flex items-center gap-1.5">
                <meta.Icon className={`w-3.5 h-3.5 ${meta.text}`} aria-hidden="true" />
                <span className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">{meta.label}</span>
              </div>
              <p className="mt-1 text-[22px] font-bold tabular-nums text-slate-900 dark:text-white">
                {totals[key] as number}
              </p>
            </div>
          );
        })}
      </div>

      {nothingYet && (
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-white/10 p-5">
          <p className="text-[14.5px] text-slate-700 dark:text-slate-200">
            Nothing is marked weak — you simply haven&rsquo;t practised yet. Answer a few questions
            and this map fills in from your actual results.
          </p>
          <button
            onClick={() => navigate('/tests')}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 text-[13.5px] font-bold"
          >
            <Sparkles className="w-3.5 h-3.5" /> Start practising
          </button>
        </div>
      )}

      {/* ── needs attention ─────────────────────────────────────────────────────────────── */}
      {needsAttention.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            Needs attention
          </h2>
          <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
            Topics you&rsquo;ve practised where accuracy needs work — not topics you haven&rsquo;t started.
          </p>
          <ul className="mt-3 space-y-1.5">
            {needsAttention.map((n) => (
              <li key={n.nodeId}>
                <button
                  onClick={() => setSelected(n)}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                >
                  <StateBadge state={n.state} compact />
                  <span className="flex-1 min-w-0 truncate text-[14px] text-slate-800 dark:text-slate-100">{n.label}</span>
                  <span className="text-[12px] tabular-nums text-slate-400">{Math.round((n.accuracy ?? 0) * 100)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── the tree ────────────────────────────────────────────────────────────────────── */}
      <section className="mt-10 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
        <div>
          <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            Your syllabus
          </h2>
          <div className="mt-3 -mx-2">
            <CoverageTree subjects={data.subjects} onSelect={setSelected} selectedId={selected?.nodeId} />
          </div>
        </div>

        {/* Detail panel. On mobile this stacks beneath the tree rather than becoming a modal. */}
        <aside className="lg:sticky lg:top-6">
          {selected ? (
            <NodeDetail node={selected} examId={data.examId} onNavigate={navigate} />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-white/10 p-5">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <p className="mt-2 text-[13.5px] text-slate-500 dark:text-slate-400">
                Select any topic to see your record for it.
              </p>
              <p className="mt-3 text-[12.5px] text-slate-400 dark:text-slate-500">
                {notStarted.length} of {totals.addressable} topics not started yet.
              </p>
            </div>
          )}
        </aside>
      </section>
    </Shell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────── */

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-full bg-white dark:bg-[#0b0b0c]">
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10">{children}</div>
  </div>
);

const Empty: React.FC<{ title: string; body: string; cta: string; onCta: () => void }> = ({ title, body, cta, onCta }) => (
  <div className="py-20 text-center">
    <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
    <p className="mt-2 text-[15px] text-slate-600 dark:text-slate-300 max-w-md mx-auto">{body}</p>
    <button
      onClick={onCta}
      className="mt-5 px-5 py-2.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 text-[13.5px] font-bold"
    >
      {cta}
    </button>
  </div>
);

/** A ring rather than a bar: a percentage of a whole syllabus reads better as a closed shape. */
const Ring: React.FC<{ percent: number }> = ({ percent }) => {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg width={PERCENT_RING} height={PERCENT_RING} viewBox="0 0 132 132" className="shrink-0" role="img"
      aria-label={`${percent} percent of your syllabus covered`}>
      <circle cx="66" cy="66" r={r} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-white/10" />
      <circle
        cx="66" cy="66" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
        className="stroke-[#8ba32b] dark:stroke-[#c8e558]"
        strokeDasharray={c} strokeDashoffset={c - (c * percent) / 100}
        transform="rotate(-90 66 66)"
      />
      <text x="66" y="72" textAnchor="middle" className="fill-slate-900 dark:fill-white text-[26px] font-bold tabular-nums">
        {percent}%
      </text>
    </svg>
  );
};

const NodeDetail: React.FC<{ node: CoverageNode; examId: string; onNavigate: (to: string) => void }> = ({ node, examId, onNavigate }) => {
  const meta = STATE_META[node.state];
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 p-5">
      <StateBadge state={node.state} />
      <h3 className="mt-2 text-[16px] font-bold tracking-tight text-slate-900 dark:text-white">{node.label}</h3>
      <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">{meta.help}</p>

      {node.attempts > 0 ? (
        <dl className="mt-4 space-y-2 text-[13px]">
          <Stat label="Attempts" value={String(node.attempts)} />
          <Stat label="Accuracy" value={`${Math.round((node.accuracy ?? 0) * 100)}%`} />
          <Stat label="Mastery" value={`${Math.round((node.masteryScore ?? 0) * 100)}%`} />
          {node.lastSeenAt && (
            <Stat label="Last practised" value={new Date(node.lastSeenAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
          )}
        </dl>
      ) : (
        // No fabricated statistics for a node with no evidence — the absence IS the information.
        <p className="mt-4 text-[13px] text-slate-500 dark:text-slate-400">
          No attempts recorded here yet.
        </p>
      )}

      <div className="mt-5 space-y-2">
        {/*
          Both actions carry the canonical nodeId, never the display label. This is the point at
          which the coordinate system starts joining the product together: practice and chat both
          address exactly the syllabus location the student tapped.
        */}
        <button
          onClick={() => onNavigate(`/tests?examId=${encodeURIComponent(examId)}&nodeId=${encodeURIComponent(node.nodeId)}`)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 text-[13.5px] font-bold"
        >
          <Sparkles className="w-3.5 h-3.5" /> Practise this topic
        </button>
        <button
          onClick={() => onNavigate(`/chat?examId=${encodeURIComponent(examId)}&nodeId=${encodeURIComponent(node.nodeId)}`)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-slate-200 dark:border-white/15 text-[13.5px] font-semibold text-slate-700 dark:text-slate-200"
        >
          <MessageSquare className="w-3.5 h-3.5" /> Ask about this
        </button>
      </div>

      {node.state === 'WEAK' && (
        <p className="mt-4 flex items-start gap-1.5 text-[12.5px] text-rose-700 dark:text-rose-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Worth a focused session before your next mock.
        </p>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="font-semibold tabular-nums text-slate-900 dark:text-white">{value}</dd>
  </div>
);
