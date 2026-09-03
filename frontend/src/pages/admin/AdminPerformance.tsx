import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '../../lib/api/client';

/**
 * Student performance.
 *
 * Built on quiz_attempts only — the one performance surface with real, completed
 * records today. The baseline placement assessment exists but 10 of its 13 documents
 * have never been answered, so a metric built on it right now would mostly describe
 * absence rather than performance; left out until real completions accumulate.
 *
 * Only completed attempts count toward the averages and topic breakdown — an
 * in-progress attempt has no final score.
 */

interface TopicStat {
  topic: string;
  attempts: number;
  averageAccuracy: number;
  totalQuestions: number;
  totalCorrect: number;
}

interface RecentAttempt {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  topic: string;
  mode: string | null;
  score: number | null;
  maxMarks: number | null;
  accuracy: number | null;
  totalQuestions: number;
  timeSpentSeconds: number | null;
  completedAt: string | null;
}

interface Overview {
  generatedAt: number;
  totalAttempts: number;
  completedAttempts: number;
  inProgressAttempts: number;
  averageAccuracy: number | null;
  averageTimeSpentSeconds: number | null;
  weakestTopics: TopicStat[];
  strongestTopics: TopicStat[];
  recentAttempts: RecentAttempt[];
  truncated: boolean;
}

const num = (n: number) => n.toLocaleString();

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const day = 86400000;
  if (ms < 3600000) return `${Math.max(Math.round(ms / 60000), 1)}m ago`;
  if (ms < day) return `${Math.round(ms / 3600000)}h ago`;
  return `${Math.round(ms / day)}d ago`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const CARD = 'rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719]';

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`${CARD} p-5`}>
      <div className="text-[11.5px] font-medium text-slate-400 dark:text-gray-500">{label}</div>
      <div className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-white leading-none">
        {value}
      </div>
      {sub && <p className="mt-1.5 text-[11.5px] text-slate-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

function TopicList({ title, icon, topics, tone }: { title: string; icon: React.ReactNode; topics: TopicStat[]; tone: 'weak' | 'strong' }) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-2">
        {icon}
        <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">{title}</h2>
      </div>
      {topics.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-slate-400 dark:text-gray-500">
          Not enough completed attempts per topic yet.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
          {topics.map((t) => (
            <div key={t.topic} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-slate-800 dark:text-gray-100 truncate">{t.topic}</div>
                <div className="text-[11px] text-slate-400 dark:text-gray-500">
                  {t.attempts} attempt{t.attempts === 1 ? '' : 's'} · {t.totalCorrect}/{t.totalQuestions} correct
                </div>
              </div>
              <div
                className={`shrink-0 text-[13px] font-semibold ${
                  tone === 'weak' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {t.averageAccuracy}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPerformance() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<Overview>('/admin/performance');
      setData(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <p className="text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[62ch]">
        Quiz results across every student. Only completed attempts count toward the averages
        below — an attempt still in progress has no final score.
      </p>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        {data && (
          <span className="text-[12px] text-slate-400 dark:text-gray-500">
            {num(data.totalAttempts)} attempt{data.totalAttempts === 1 ? '' : 's'} total
          </span>
        )}
      </div>

      {data?.truncated && (
        <div className="mt-4 rounded-xl border border-amber-300/60 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-400/[0.06] px-4 py-3 text-[12.5px] text-amber-900 dark:text-amber-200">
          The scan hit its 5,000-record ceiling, so these figures cover only part of the base.
          Treat them as a lower bound.
        </div>
      )}

      {error && (
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <AlertTriangle className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" />
          <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load performance data.</p>
          <button
            onClick={() => void load()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {!error && loading && !data && (
        <div className={`${CARD} mt-6 p-10 text-center text-[13px] text-slate-400 dark:text-gray-500`}>Loading…</div>
      )}

      {!error && data && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Completed attempts" value={num(data.completedAttempts)} />
            <StatTile label="In progress" value={num(data.inProgressAttempts)} />
            <StatTile
              label="Average accuracy"
              value={data.averageAccuracy == null ? '—' : `${data.averageAccuracy}%`}
              sub="across completed attempts"
            />
            <StatTile
              label="Average time spent"
              value={formatDuration(data.averageTimeSpentSeconds)}
              sub="per completed attempt"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <TopicList
              title="Weakest topics"
              icon={<TrendingDown className="w-4 h-4 text-rose-500" />}
              topics={data.weakestTopics}
              tone="weak"
            />
            <TopicList
              title="Strongest topics"
              icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
              topics={data.strongestTopics}
              tone="strong"
            />
          </div>

          <div className={`${CARD} mt-6 overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Recent attempts</h2>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">Most recently completed, newest first.</p>
            </div>

            {data.recentAttempts.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">
                No completed attempts yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.06em] text-slate-400 dark:text-gray-500">
                      <th className="font-medium px-5 py-2.5">Student</th>
                      <th className="font-medium px-5 py-2.5">Topic</th>
                      <th className="font-medium px-5 py-2.5 whitespace-nowrap">Score</th>
                      <th className="font-medium px-5 py-2.5 whitespace-nowrap">Time</th>
                      <th className="font-medium px-5 py-2.5">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentAttempts.map((a) => (
                      <tr key={a.id} className="border-t border-slate-100 dark:border-white/[0.05]">
                        <td className="px-5 py-3">
                          <Link to={`/admin/students/${a.userId}`} className="group block">
                            <div className="text-[13px] font-medium text-slate-900 dark:text-white group-hover:underline">
                              {a.displayName || a.email || a.userId}
                            </div>
                            {a.displayName && a.email && (
                              <div className="text-[11.5px] text-slate-400 dark:text-gray-500">{a.email}</div>
                            )}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-[12.5px] text-slate-600 dark:text-gray-300">{a.topic}</td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="text-[12px] font-medium text-slate-700 dark:text-gray-200">
                            {a.score != null && a.maxMarks != null ? `${a.score}/${a.maxMarks}` : '—'}
                          </span>
                          {a.accuracy != null && (
                            <span className="ml-1.5 text-[11px] text-slate-400 dark:text-gray-500">({a.accuracy}%)</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-[12px] text-slate-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDuration(a.timeSpentSeconds)}
                        </td>
                        <td className="px-5 py-3 text-[12px] text-slate-400 dark:text-gray-500 whitespace-nowrap">
                          {relativeTime(a.completedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
