import { useState } from 'react';
import { Wallet, IndianRupee, Check, AlertTriangle } from 'lucide-react';
import { usePayoutQueue, useRecordPayout } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState } from '../components/DataStates';
import { PageHeader, Panel, Button } from '../ui';

/**
 * /admin/payouts — Phase 3J-lite: recording manual payouts.
 *
 * Real, automated payout execution (RazorpayX/Route) is blocked on a registered legal entity
 * and a principal-vs-agent decision — see TEACHER_ECOSYSTEM_PLAN.md §G. This page does not move
 * money. It records that you ALREADY paid a teacher outside the platform (UPI, bank transfer,
 * cash) so their ledger reflects reality instead of an ever-growing balance nobody can act on.
 *
 * Deliberately pays a teacher's FULL outstanding balance in one action — this is a small-scale,
 * human-judgment tool, not a batching system.
 */

const METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

type QueueRow = { teacherUid: string; balancePaise: number; displayName: string | null; email: string | null };

function PayoutRow({ row }: { row: QueueRow }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const record = useRecordPayout();

  const submit = async () => {
    setError(null);
    try {
      await record.mutateAsync({ teacherUid: row.teacherUid, method, reference: reference.trim() || undefined, note: note.trim() || undefined });
      setDone(true);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not record that payout.');
    }
  };

  return (
    <div className="border-b border-slate-100 dark:border-white/5 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
          {(row.displayName || row.email || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900 dark:text-white truncate">{row.displayName || 'Unnamed teacher'}</div>
          <div className="text-xs text-slate-500 dark:text-gray-400 truncate">{row.email || row.teacherUid}</div>
        </div>
        <span className="font-semibold text-slate-900 dark:text-white shrink-0">{rupees(row.balancePaise)}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 bg-slate-50/50 dark:bg-white/[0.015]">
          {done ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <Check className="w-4 h-4" /> Recorded — this teacher&rsquo;s balance is now settled.
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 dark:text-gray-400 mb-3">
                Only record this AFTER you have actually paid {row.displayName || 'this teacher'}{' '}
                {rupees(row.balancePaise)} yourself. This does not send money.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Reference (UPI txn id, bank ref...)"
                  className="flex-1 min-w-[12rem] px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="flex-1 min-w-[10rem] px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Button variant="success" size="sm" icon={<IndianRupee className="w-4 h-4" />} loading={record.isPending} onClick={submit}>
                  Record payout of {rupees(row.balancePaise)}
                </Button>
              </div>
              {error && <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Payouts() {
  const { data, isLoading, error, refetch } = usePayoutQueue();
  const rows: QueueRow[] = (data as any)?.queue ?? [];
  const totalOwed = rows.reduce((sum, r) => sum + r.balancePaise, 0);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Payouts"
        subtitle="Teachers with an outstanding balance from paid classes. Manual only — nothing here moves money automatically."
        icon={Wallet}
      />

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span className="leading-relaxed">
          Automated payouts (RazorpayX/Route) aren&rsquo;t wired up yet — that needs a registered
          legal entity and a principal-vs-agent decision. Pay teachers yourself (UPI/bank
          transfer) and record it here so their ledger stays accurate.
        </span>
      </div>

      {isLoading ? (
        <LoadingState label="Loading outstanding balances..." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <Panel
          flush
          title="Owed to teachers"
          subtitle={`${rows.length} teacher${rows.length === 1 ? '' : 's'} · ${rupees(totalOwed)} total outstanding`}
        >
          {rows.length === 0 ? (
            <EmptyState message="Nobody has an outstanding balance right now." />
          ) : (
            <div>{rows.map((row) => <PayoutRow key={row.teacherUid} row={row} />)}</div>
          )}
        </Panel>
      )}
    </div>
  );
}
