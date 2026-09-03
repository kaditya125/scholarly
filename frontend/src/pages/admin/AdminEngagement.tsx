import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api/client';

/**
 * Student engagement.
 *
 * Built on chat_sessions — a session only exists when a student actually opened the AI
 * tutor, which makes it a genuine product-usage signal, unlike a sign-in that could just
 * mean a tab was left open. Deliberately excludes the per-user analytics_logs
 * subcollection: reading it means a Firestore collectionGroup scan across every
 * student, the same expensive-scan pattern already avoided elsewhere in this admin area.
 */

interface RecentSession {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  title: string | null;
  createdAt: number | null;
}

interface ActiveStudent {
  userId: string;
  email: string | null;
  displayName: string | null;
  sessionsLast30Days: number;
}

interface Overview {
  generatedAt: number;
  totalSessions: number;
  sessionsLast7Days: number;
  sessionsLast30Days: number;
  uniqueActiveLast7Days: number;
  uniqueActiveLast30Days: number;
  signedInLast7Days: number;
  signedInLast30Days: number;
  mostActiveStudents: ActiveStudent[];
  recentSessions: RecentSession[];
}

const num = (n: number) => n.toLocaleString();

function relativeTime(ms: number | null): string {
  if (ms == null) return '—';
  const diff = Date.now() - ms;
  const day = 86400000;
  if (diff < 3600000) return `${Math.max(Math.round(diff / 60000), 1)}m ago`;
  if (diff < day) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / day)}d ago`;
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

export default function AdminEngagement() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<Overview>('/admin/engagement');
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
        Activity volume and recency, from AI tutor sessions — a session is only created when a
        student actually opens the app, not just signs in.
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
            {num(data.totalSessions)} session{data.totalSessions === 1 ? '' : 's'} total
          </span>
        )}
      </div>

      {error && (
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <AlertTriangle className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" />
          <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load engagement data.</p>
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
            <StatTile
              label="Sessions, last 7 days"
              value={num(data.sessionsLast7Days)}
              sub={`${num(data.uniqueActiveLast7Days)} student${data.uniqueActiveLast7Days === 1 ? '' : 's'}`}
            />
            <StatTile
              label="Sessions, last 30 days"
              value={num(data.sessionsLast30Days)}
              sub={`${num(data.uniqueActiveLast30Days)} student${data.uniqueActiveLast30Days === 1 ? '' : 's'}`}
            />
            <StatTile label="Signed in, last 7 days" value={num(data.signedInLast7Days)} sub="account-level, not usage" />
            <StatTile label="Signed in, last 30 days" value={num(data.signedInLast30Days)} sub="account-level, not usage" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
                <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Most active</h2>
                <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">By session count, last 30 days.</p>
              </div>
              {data.mostActiveStudents.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-slate-400 dark:text-gray-500">
                  No sessions in the last 30 days.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {data.mostActiveStudents.map((s) => (
                    <Link
                      key={s.userId}
                      to={`/admin/students/${s.userId}`}
                      className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-slate-800 dark:text-gray-100 truncate">
                          {s.displayName || s.email || s.userId}
                        </div>
                        {s.displayName && s.email && (
                          <div className="text-[11px] text-slate-400 dark:text-gray-500 truncate">{s.email}</div>
                        )}
                      </div>
                      <div className="shrink-0 text-[13px] font-semibold text-slate-700 dark:text-gray-200">
                        {s.sessionsLast30Days}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
                <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Recent sessions</h2>
                <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">Newest first.</p>
              </div>
              {data.recentSessions.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-slate-400 dark:text-gray-500">No sessions yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {data.recentSessions.map((s) => (
                    <Link
                      key={s.id}
                      to={`/admin/students/${s.userId}`}
                      className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-slate-800 dark:text-gray-100 truncate">
                          {s.title || 'Untitled'}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-gray-500 truncate">
                          {s.displayName || s.email || s.userId}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11.5px] text-slate-400 dark:text-gray-500 whitespace-nowrap">
                        {relativeTime(s.createdAt)}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
