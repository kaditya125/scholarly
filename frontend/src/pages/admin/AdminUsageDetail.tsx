import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Gauge, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api/client';

/**
 * Per-feature usage detail — the drill-down behind a single Quotas card. Same honesty
 * constraint as AdminQuotas.tsx: usage.service.ts persists only the live counter for a
 * user's current billing period, not a history, so there is no trend line here — only
 * present consumption, split by plan, banded into a distribution, and a top-consumers list.
 */

type PlanType = 'free' | 'pro';

interface TopConsumer {
  userId: string;
  email: string | null;
  displayName: string | null;
  plan: PlanType;
  used: number;
  limit: number;
  percent: number;
  periodEnd: number;
}

interface UsageDetail {
  generatedAt: number;
  metric: string;
  label: string;
  unit: string;
  total: number;
  freeLimit: number;
  proLimit: number;
  usersWithUsage: { free: number; pro: number };
  exhausted: number;
  approaching: number;
  distribution: { band: string; count: number }[];
  topConsumers: TopConsumer[];
  scan: { documentsScanned: number; truncated: boolean };
}

const num = (n: number) => n.toLocaleString();

/** Voice is stored in seconds; minutes are what anyone actually reasons about. */
function formatQty(metric: string, value: number): string {
  return metric === 'voiceSeconds' ? `${num(Math.round(value / 60))} min` : num(value);
}

const CARD = 'rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719]';

export default function AdminUsageDetail({ metric }: { metric: string }) {
  const [data, setData] = useState<UsageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<UsageDetail>(`/admin/usage/${metric}`);
      setData(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [metric]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxBand = data ? Math.max(1, ...data.distribution.map((b) => b.count)) : 1;

  return (
    <div>
      <p className="text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[62ch]">
        Consumption for this feature in the billing period each student is currently metered
        in — a calendar month on Free, a billing cycle on Pro. Present consumption only; no
        month-over-month trend, because usage.service.ts does not persist one.
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
            {num(data.usersWithUsage.free + data.usersWithUsage.pro)} student
            {data.usersWithUsage.free + data.usersWithUsage.pro === 1 ? '' : 's'} with usage ·{' '}
            {num(data.usersWithUsage.free)} free · {num(data.usersWithUsage.pro)} pro
          </span>
        )}
      </div>

      {data?.scan.truncated && (
        <div className="mt-4 rounded-xl border border-amber-300/60 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-400/[0.06] px-4 py-3 text-[12.5px] text-amber-900 dark:text-amber-200">
          The scan hit its 5,000-record ceiling, so these figures cover only part of the base.
          Treat them as a lower bound.
        </div>
      )}

      {error && (
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <AlertTriangle className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" />
          <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load usage.</p>
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
          {/* ── Headline + limits ──────────────────────────────────────────── */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className={`${CARD} p-5`}>
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-slate-400 dark:text-gray-500" />
                <h2 className="text-[13px] font-semibold text-slate-900 dark:text-white">Total consumed</h2>
              </div>
              <div className="mt-3 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-white leading-none">
                {formatQty(data.metric, data.total)}
              </div>
              <p className="mt-1.5 text-[11.5px] text-slate-400 dark:text-gray-500">across active periods</p>
            </div>
            <div className={`${CARD} p-5`}>
              <h2 className="text-[13px] font-semibold text-slate-900 dark:text-white">Free limit</h2>
              <div className="mt-3 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-white leading-none">
                {formatQty(data.metric, data.freeLimit)}
              </div>
              <p className="mt-1.5 text-[11.5px] text-slate-400 dark:text-gray-500">per period</p>
            </div>
            <div className={`${CARD} p-5`}>
              <h2 className="text-[13px] font-semibold text-slate-900 dark:text-white">Pro limit</h2>
              <div className="mt-3 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-white leading-none">
                {formatQty(data.metric, data.proLimit)}
              </div>
              <p className="mt-1.5 text-[11.5px] text-slate-400 dark:text-gray-500">per period</p>
            </div>
          </div>

          {(data.exhausted > 0 || data.approaching > 0) && (
            <p className="mt-4 text-[12.5px] text-slate-500 dark:text-gray-400">
              {data.exhausted > 0 && (
                <span className="font-medium text-rose-600 dark:text-rose-400">{data.exhausted} at limit</span>
              )}
              {data.exhausted > 0 && data.approaching > 0 && ' · '}
              {data.approaching > 0 && <span>{data.approaching} approaching (≥80%)</span>}
            </p>
          )}

          {/* ── Distribution ────────────────────────────────────────────────── */}
          <div className={`${CARD} mt-6 p-5`}>
            <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Distribution</h2>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">
              Students with any usage, banded by their percent of their own plan's limit.
            </p>
            <div className="mt-4 space-y-2.5">
              {data.distribution.map((b) => (
                <div key={b.band} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-[11.5px] font-medium text-slate-500 dark:text-gray-400">
                    {b.band}%
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${b.band === '100+' ? 'bg-rose-500' : 'bg-[#8FAE2B]'}`}
                      style={{ width: `${(b.count / maxBand) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[11.5px] text-slate-500 dark:text-gray-400">
                    {b.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Top consumers ───────────────────────────────────────────────── */}
          <div className={`${CARD} mt-6 overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Top consumers</h2>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">
                Highest raw usage this period, whatever their plan's limit.
              </p>
            </div>

            {data.topConsumers.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">
                No usage recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.06em] text-slate-400 dark:text-gray-500">
                      <th className="font-medium px-5 py-2.5">Student</th>
                      <th className="font-medium px-5 py-2.5">Plan</th>
                      <th className="font-medium px-5 py-2.5 whitespace-nowrap">Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topConsumers.map((c) => (
                      <tr key={c.userId} className="border-t border-slate-100 dark:border-white/[0.05]">
                        <td className="px-5 py-3">
                          <Link to={`/admin/students/${c.userId}`} className="group block">
                            <div className="text-[13px] font-medium text-slate-900 dark:text-white group-hover:underline">
                              {c.displayName || c.email || c.userId}
                            </div>
                            {c.displayName && c.email && (
                              <div className="text-[11.5px] text-slate-400 dark:text-gray-500">{c.email}</div>
                            )}
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <span className="rounded-full bg-slate-100 dark:bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-gray-300">
                            {c.plan}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="h-1.5 w-20 rounded-full bg-slate-100 dark:bg-white/[0.08] overflow-hidden">
                              <div
                                className={`h-full rounded-full ${c.percent >= 100 ? 'bg-rose-500' : 'bg-amber-500'}`}
                                style={{ width: `${Math.min(c.percent, 100)}%` }}
                              />
                            </div>
                            <span
                              className={`text-[12px] font-medium ${c.percent >= 100 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-gray-200'}`}
                            >
                              {formatQty(data.metric, c.used)}/{formatQty(data.metric, c.limit)}
                            </span>
                          </div>
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
