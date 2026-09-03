import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api/client';

/**
 * Payments directory.
 *
 * Every order, whatever its outcome — created, paid, cancelled, refunded. No card data
 * is ever stored (payments.service.ts's own comment confirms this); what's shown here is
 * the same administrative metadata a student's own profile panel already exposes.
 */

interface PaymentRecord {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  status: string;
  amountRupees: number | null;
  currency: string;
  billing: string | null;
  planName: string | null;
  paymentId: string | null;
  method: string | null;
  createdAt: number | null;
  paidAt: number | null;
}

interface Overview {
  generatedAt: number;
  total: number;
  payments: PaymentRecord[];
  truncated: boolean;
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function absoluteTime(ms: number | null): string {
  if (ms == null) return '—';
  return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-[#f2f7e3] dark:bg-[#1e2416] text-[#5A7410] dark:text-[#c8e558]',
  refunded: 'bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400',
  cancelled: 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400',
  created: 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400',
};

const CARD = 'rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719]';

export default function AdminPayments() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<Overview>('/admin/payments');
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
        Every payment order on record, newest first. No card data is ever stored — this is
        the same order metadata (status, amount, method) a student's own profile shows.
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
        {data && <span className="text-[12px] text-slate-400 dark:text-gray-500">{data.total} order{data.total === 1 ? '' : 's'}</span>}
      </div>

      {data?.truncated && (
        <div className="mt-4 rounded-xl border border-amber-300/60 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-400/[0.06] px-4 py-3 text-[12.5px] text-amber-900 dark:text-amber-200">
          The scan hit its 5,000-record ceiling, so this list covers only part of the base.
        </div>
      )}

      {error && (
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <AlertTriangle className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" />
          <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load payments.</p>
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
        <div className={`${CARD} mt-6 overflow-hidden`}>
          {data.payments.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-slate-400 dark:text-gray-500">
                    <th className="font-medium px-5 py-2.5">Student</th>
                    <th className="font-medium px-5 py-2.5">Order</th>
                    <th className="font-medium px-5 py-2.5">Plan</th>
                    <th className="font-medium px-5 py-2.5">Status</th>
                    <th className="font-medium px-5 py-2.5 whitespace-nowrap">Amount</th>
                    <th className="font-medium px-5 py-2.5">Method</th>
                    <th className="font-medium px-5 py-2.5">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
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
                      <td className="px-5 py-3 text-[11.5px] text-slate-400 dark:text-gray-500 font-mono">{p.id}</td>
                      <td className="px-5 py-3 text-[12.5px] text-slate-600 dark:text-gray-300">
                        {p.planName || '—'} {p.billing && <span className="text-slate-400 dark:text-gray-500">· {p.billing}</span>}
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
                      <td className="px-5 py-3 text-[12px] text-slate-500 dark:text-gray-400">{p.method || '—'}</td>
                      <td className="px-5 py-3 text-[12px] text-slate-400 dark:text-gray-500 whitespace-nowrap">
                        {absoluteTime(p.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
