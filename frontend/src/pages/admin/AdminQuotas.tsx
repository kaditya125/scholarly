import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Gauge, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api/client';

/**
 * Quotas & entitlements.
 *
 * Answers two operator questions and no others: what are the plan limits, and who is running
 * out. Everything shown is a counter services/usage.service.ts incremented or a value from
 * PLAN_LIMITS — there are no projections, no burn-rate estimates and no month-over-month
 * comparisons, because the data to support them is not collected.
 *
 * "Active period" means the window each user is currently metered in, which is a calendar
 * month on Free and a billing cycle on Pro. Totals therefore cover overlapping windows and
 * are a snapshot of present consumption, not a monthly figure — the page says so rather than
 * presenting a number that invites the wrong reading.
 */

type PlanType = 'free' | 'pro';

interface PlanLimits {
  chatMessages: number;
  voiceSeconds: number;
  documentsUploaded: number;
  maxDocumentSizeMB: number;
  podcastsGenerated: number;
  mockTestsGenerated: number;
  communityStandard: boolean;
  peerChatStandard: boolean;
  pyqAccess: boolean;
  notebooksAccess: boolean;
}

interface MetricSummary {
  key: string;
  label: string;
  total: number;
  freeLimit: number;
  proLimit: number;
  exhausted: number;
  approaching: number;
}

interface PressuredUser {
  userId: string;
  email: string | null;
  displayName: string | null;
  plan: PlanType;
  metric: string;
  metricLabel: string;
  used: number;
  limit: number;
  percent: number;
  periodEnd: number;
}

interface Overview {
  generatedAt: number;
  limits: Record<PlanType, PlanLimits>;
  periods: { active: number; free: number; pro: number; truncated: boolean };
  metrics: MetricSummary[];
  pressured: PressuredUser[];
}

const num = (n: number) => n.toLocaleString();

/** Voice is stored in seconds; minutes are what anyone actually reasons about. */
const formatLimit = (key: string, value: number) =>
  key === 'voiceSeconds' ? `${num(Math.round(value / 60))} min` : num(value);

const formatUsed = (key: string, value: number) =>
  key === 'voiceSeconds' ? `${num(Math.round(value / 60))} min` : num(value);

function resetsIn(periodEnd: number): string {
  const ms = periodEnd - Date.now();
  if (ms <= 0) return 'resetting';
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `resets in ${days}d`;
  const hours = Math.max(Math.floor(ms / 3600000), 1);
  return `resets in ${hours}h`;
}

const CARD = 'rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719]';

export default function AdminQuotas() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<Overview>('/admin/quotas');
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
        Plan limits, and the students currently close to them. Usage is counted per billing
        period — a calendar month on Free, a billing cycle on Pro — so these are present
        consumption, not monthly totals.
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
            {num(data.periods.active)} active period{data.periods.active === 1 ? '' : 's'} ·{' '}
            {num(data.periods.free)} free · {num(data.periods.pro)} pro
          </span>
        )}
      </div>

      {data?.periods.truncated && (
        <div className="mt-4 rounded-xl border border-amber-300/60 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-400/[0.06] px-4 py-3 text-[12.5px] text-amber-900 dark:text-amber-200">
          The scan hit its 5,000-record ceiling, so these figures cover only part of the base.
          Treat them as a lower bound.
        </div>
      )}

      {error && (
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <AlertTriangle className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" />
          <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load quotas.</p>
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
          {/* ── Consumption per metric ─────────────────────────────────────── */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.metrics.map((m) => (
              <div key={m.key} className={`${CARD} p-5`}>
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-slate-400 dark:text-gray-500" />
                  <h2 className="text-[13px] font-semibold text-slate-900 dark:text-white">{m.label}</h2>
                </div>
                <div className="mt-3 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-white leading-none">
                  {formatUsed(m.key, m.total)}
                </div>
                <p className="mt-1.5 text-[11.5px] text-slate-400 dark:text-gray-500">
                  consumed across active periods
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-[11.5px]">
                  <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] px-2.5 py-2">
                    <dt className="text-slate-400 dark:text-gray-500">Free limit</dt>
                    <dd className="mt-0.5 font-medium text-slate-700 dark:text-gray-200">
                      {formatLimit(m.key, m.freeLimit)}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] px-2.5 py-2">
                    <dt className="text-slate-400 dark:text-gray-500">Pro limit</dt>
                    <dd className="mt-0.5 font-medium text-slate-700 dark:text-gray-200">
                      {formatLimit(m.key, m.proLimit)}
                    </dd>
                  </div>
                </dl>
                {(m.exhausted > 0 || m.approaching > 0) && (
                  <p className="mt-3 text-[11.5px] text-slate-500 dark:text-gray-400">
                    {m.exhausted > 0 && (
                      <span className="font-medium text-rose-600 dark:text-rose-400">{m.exhausted} at limit</span>
                    )}
                    {m.exhausted > 0 && m.approaching > 0 && ' · '}
                    {m.approaching > 0 && <span>{m.approaching} approaching</span>}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* ── Who is running out ─────────────────────────────────────────── */}
          <div className={`${CARD} mt-6 overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Running out</h2>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">
                At or past 80% of a limit in the period they are currently metered in.
              </p>
            </div>

            {data.pressured.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">
                Nobody is near a limit.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.06em] text-slate-400 dark:text-gray-500">
                      <th className="font-medium px-5 py-2.5">Student</th>
                      <th className="font-medium px-5 py-2.5">Plan</th>
                      <th className="font-medium px-5 py-2.5">Metric</th>
                      <th className="font-medium px-5 py-2.5 whitespace-nowrap">Used</th>
                      <th className="font-medium px-5 py-2.5">Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pressured.map((p) => (
                      <tr
                        key={`${p.userId}-${p.metric}`}
                        className="border-t border-slate-100 dark:border-white/[0.05]"
                      >
                        <td className="px-5 py-3">
                          <Link to={`/admin/students/${p.userId}`} className="group block">
                            <div className="text-[13px] font-medium text-slate-900 dark:text-white group-hover:underline">
                              {p.displayName || p.email || p.userId}
                            </div>
                            {p.displayName && p.email && (
                              <div className="text-[11.5px] text-slate-400 dark:text-gray-500">{p.email}</div>
                            )}
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <span className="rounded-full bg-slate-100 dark:bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-gray-300">
                            {p.plan}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[12.5px] text-slate-600 dark:text-gray-300">{p.metricLabel}</td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="h-1.5 w-20 rounded-full bg-slate-100 dark:bg-white/[0.08] overflow-hidden">
                              <div
                                className={`h-full rounded-full ${p.percent >= 100 ? 'bg-rose-500' : 'bg-amber-500'}`}
                                style={{ width: `${Math.min(p.percent, 100)}%` }}
                              />
                            </div>
                            <span
                              className={`text-[12px] font-medium ${p.percent >= 100 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-gray-200'}`}
                            >
                              {formatUsed(p.metric, p.used)}/{formatLimit(p.metric, p.limit)}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[12px] text-slate-400 dark:text-gray-500 whitespace-nowrap">
                          {resetsIn(p.periodEnd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Entitlements that are not metered ──────────────────────────── */}
          <div className={`${CARD} mt-6 p-5`}>
            <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Entitlements</h2>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">
              Access flags, not counters — on or off per plan, with nothing to consume.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-slate-400 dark:text-gray-500">
                    <th className="font-medium py-2">Feature</th>
                    <th className="font-medium py-2">Free</th>
                    <th className="font-medium py-2">Pro</th>
                  </tr>
                </thead>
                <tbody className="text-[12.5px]">
                  {(
                    [
                      ['maxDocumentSizeMB', 'Max document size'],
                      ['communityStandard', 'Community'],
                      ['peerChatStandard', 'Peer chat'],
                      ['pyqAccess', 'Past papers'],
                      ['notebooksAccess', 'Notebooks'],
                    ] as const
                  ).map(([key, label]) => {
                    const f = data.limits.free[key];
                    const p = data.limits.pro[key];
                    const render = (v: number | boolean) =>
                      typeof v === 'boolean' ? (
                        <span className={v ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-gray-600'}>
                          {v ? 'Included' : 'No'}
                        </span>
                      ) : (
                        `${v} MB`
                      );
                    return (
                      <tr key={key} className="border-t border-slate-100 dark:border-white/[0.05]">
                        <td className="py-2.5 text-slate-700 dark:text-gray-200">{label}</td>
                        <td className="py-2.5 text-slate-600 dark:text-gray-300">{render(f)}</td>
                        <td className="py-2.5 text-slate-600 dark:text-gray-300">{render(p)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
