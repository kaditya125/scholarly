import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api/client';

/**
 * Revenue.
 *
 * Built on `payments` — 9 documents today. Reported here exactly as it is: one document
 * is a test-fixture account (`e2e_checkout_probe_uid`), and every other one belongs to a
 * single account, the product's own. There is no evidence yet of a genuine third-party
 * paying customer. This page does not filter that out or hide it — the numbers below are
 * real, they are just not yet real *customer* revenue.
 *
 * "Gross collected" counts every order with a `paidAt`, including ones since refunded —
 * money changed hands before it came back, so a refund shows in both figures rather than
 * making the gross number silently smaller.
 */

interface BillingBreakdown {
  billing: string;
  count: number;
  grossRupees: number;
}

interface RecentPayment {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  status: string;
  amountRupees: number | null;
  planName: string | null;
  createdAt: number | null;
}

interface Overview {
  generatedAt: number;
  totalOrders: number;
  grossCollectedRupees: number;
  refundedRupees: number;
  netRevenueRupees: number;
  paidCount: number;
  refundedCount: number;
  cancelledCount: number;
  abandonedCount: number;
  byBilling: BillingBreakdown[];
  recentPayments: RecentPayment[];
  truncated: boolean;
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const num = (n: number) => n.toLocaleString();

function relativeTime(ms: number | null): string {
  if (ms == null) return '—';
  const diff = Date.now() - ms;
  const day = 86400000;
  if (diff < day) return `${Math.max(Math.round(diff / 3600000), 1)}h ago`;
  return `${Math.round(diff / day)}d ago`;
}

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-[#f2f7e3] dark:bg-[#1e2416] text-[#5A7410] dark:text-[#c8e558]',
  refunded: 'bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400',
  cancelled: 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400',
  created: 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400',
};

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

export default function AdminRevenue() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<Overview>('/admin/revenue');
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
        Every order recorded against the product, gross and net. This includes test and
        internal activity — nothing here is filtered to only "real" customers, because that
        judgement belongs to whoever is reading it.
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
          <span className="text-[12px] text-slate-400 dark:text-gray-500">{num(data.totalOrders)} orders total</span>
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
          <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load revenue data.</p>
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
            <StatTile label="Gross collected" value={rupees(data.grossCollectedRupees)} sub="includes since-refunded orders" />
            <StatTile label="Refunded" value={rupees(data.refundedRupees)} sub={`${num(data.refundedCount)} order${data.refundedCount === 1 ? '' : 's'}`} />
            <StatTile label="Net revenue" value={rupees(data.netRevenueRupees)} sub="gross minus refunds" />
            <StatTile
              label="Orders never completed"
              value={num(data.abandonedCount)}
              sub={`+ ${num(data.cancelledCount)} cancelled`}
            />
          </div>

          {data.byBilling.length > 0 && (
            <div className={`${CARD} mt-6 p-5`}>
              <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">By billing cycle</h2>
              <div className="mt-4 flex flex-wrap gap-3">
                {data.byBilling.map((b) => (
                  <div key={b.billing} className="rounded-xl bg-slate-50 dark:bg-white/[0.03] px-4 py-3">
                    <div className="text-[11.5px] text-slate-400 dark:text-gray-500 capitalize">{b.billing}</div>
                    <div className="mt-0.5 text-[15px] font-semibold text-slate-800 dark:text-gray-100">
                      {rupees(b.grossRupees)}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-gray-500">
                      {b.count} order{b.count === 1 ? '' : 's'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`${CARD} mt-6 overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
              <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Recent orders</h2>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">Newest first, every status.</p>
            </div>

            {data.recentPayments.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">No orders yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.06em] text-slate-400 dark:text-gray-500">
                      <th className="font-medium px-5 py-2.5">Student</th>
                      <th className="font-medium px-5 py-2.5">Plan</th>
                      <th className="font-medium px-5 py-2.5">Status</th>
                      <th className="font-medium px-5 py-2.5 whitespace-nowrap">Amount</th>
                      <th className="font-medium px-5 py-2.5">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentPayments.map((p) => (
                      <tr key={p.id} className="border-t border-slate-100 dark:border-white/[0.05]">
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
                        <td className="px-5 py-3 text-[12.5px] text-slate-600 dark:text-gray-300">
                          {p.planName || '—'}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[p.status] || STATUS_STYLE.created}`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 whitespace-nowrap">
                          {p.amountRupees != null ? rupees(p.amountRupees) : '—'}
                        </td>
                        <td className="px-5 py-3 text-[12px] text-slate-400 dark:text-gray-500 whitespace-nowrap">
                          {relativeTime(p.createdAt)}
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
