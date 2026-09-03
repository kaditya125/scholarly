import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api/client';

/**
 * Subscriptions.
 *
 * There is no dedicated subscriptions collection — this reads users/{uid}.subscription
 * and computes "is this actually active" the same way the app itself does
 * (paymentsService.evaluateEntitlement), not by trusting the raw status field alone.
 *
 * A row can be flagged: evaluateEntitlement says active, but the same record also shows
 * a refund or cancellation. That is a real state this app's data can be in — surfaced
 * rather than silently resolved one way or the other.
 */

interface SubscriptionRow {
  userId: string;
  email: string | null;
  displayName: string | null;
  planName: string | null;
  billing: string | null;
  rawStatus: string | null;
  active: boolean;
  currentPeriodEnd: number | null;
  amountRupees: number | null;
  refundedAt: number | null;
  cancelledAt: number | null;
  flagged: boolean;
}

interface Overview {
  generatedAt: number;
  totalProUsers: number;
  activeCount: number;
  inactiveCount: number;
  flaggedCount: number;
  subscriptions: SubscriptionRow[];
  truncated: boolean;
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const num = (n: number) => n.toLocaleString();

function formatDate(ms: number | null): string {
  if (ms == null) return '—';
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function periodEndLabel(ms: number | null, active: boolean): string {
  if (ms == null) return '—';
  const days = Math.round((ms - Date.now()) / 86400000);
  if (!active) return `${formatDate(ms)} (lapsed)`;
  if (days < 0) return `${formatDate(ms)} (lapsed)`;
  if (days === 0) return 'renews today';
  return `${formatDate(ms)} (${days}d)`;
}

const CARD = 'rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719]';

function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className={`${CARD} p-5`}>
      <div className="text-[11.5px] font-medium text-slate-400 dark:text-gray-500">{label}</div>
      <div
        className={`mt-1.5 text-[26px] font-semibold tracking-tight leading-none ${
          tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
        }`}
      >
        {value}
      </div>
      {sub && <p className="mt-1.5 text-[11.5px] text-slate-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

export default function AdminSubscriptions() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<Overview>('/admin/subscriptions');
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
        Every Pro-plan account, and whether they are actually entitled right now — computed
        the same way the server decides it, not read off the status field alone.
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
            {num(data.totalProUsers)} pro account{data.totalProUsers === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {data?.truncated && (
        <div className="mt-4 rounded-xl border border-amber-300/60 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-400/[0.06] px-4 py-3 text-[12.5px] text-amber-900 dark:text-amber-200">
          The scan hit its 5,000-record ceiling, so this list covers only part of the base.
        </div>
      )}

      {error && (
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <AlertTriangle className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" />
          <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load subscriptions.</p>
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
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatTile label="Active" value={num(data.activeCount)} sub="entitled to Pro right now" />
            <StatTile label="Inactive" value={num(data.inactiveCount)} sub="lapsed or otherwise not entitled" />
            <StatTile
              label="Flagged"
              value={num(data.flaggedCount)}
              sub="active despite a refund or cancellation on record"
              tone={data.flaggedCount > 0 ? 'warn' : undefined}
            />
          </div>

          <div className={`${CARD} mt-6 overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Subscriptions</h2>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">
                Sorted by period end, soonest-renewing first.
              </p>
            </div>

            {data.subscriptions.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">
                No Pro accounts yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.06em] text-slate-400 dark:text-gray-500">
                      <th className="font-medium px-5 py-2.5">Student</th>
                      <th className="font-medium px-5 py-2.5">Plan</th>
                      <th className="font-medium px-5 py-2.5">Status</th>
                      <th className="font-medium px-5 py-2.5 whitespace-nowrap">Amount</th>
                      <th className="font-medium px-5 py-2.5">Period end</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscriptions.map((s) => (
                      <tr key={s.userId} className="border-t border-slate-100 dark:border-white/[0.05]">
                        <td className="px-5 py-3">
                          <Link to={`/admin/students/${s.userId}`} className="group block">
                            <div className="text-[13px] font-medium text-slate-900 dark:text-white group-hover:underline">
                              {s.displayName || s.email || s.userId}
                            </div>
                            {s.displayName && s.email && (
                              <div className="text-[11.5px] text-slate-400 dark:text-gray-500">{s.email}</div>
                            )}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-[12.5px] text-slate-600 dark:text-gray-300">
                          {s.planName || '—'} {s.billing && <span className="text-slate-400 dark:text-gray-500">· {s.billing}</span>}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                s.active
                                  ? 'bg-[#f2f7e3] dark:bg-[#1e2416] text-[#5A7410] dark:text-[#c8e558]'
                                  : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400'
                              }`}
                            >
                              {s.active ? 'active' : 'inactive'}
                            </span>
                            {s.flagged && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
                                title={
                                  `Marked active, but this record also shows ` +
                                  [s.refundedAt && 'a refund', s.cancelledAt && 'a cancellation'].filter(Boolean).join(' and ')
                                }
                              >
                                <AlertTriangle className="w-3 h-3" />
                                active despite {s.refundedAt ? 'refund' : 'cancellation'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 whitespace-nowrap">
                          {s.amountRupees != null ? rupees(s.amountRupees) : '—'}
                        </td>
                        <td className="px-5 py-3 text-[12px] text-slate-500 dark:text-gray-400 whitespace-nowrap">
                          {periodEndLabel(s.currentPeriodEnd, s.active)}
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
