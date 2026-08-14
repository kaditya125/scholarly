import { Loader2, IndianRupee, Info, ArrowUpRight, ArrowDownRight, CheckCircle2 } from 'lucide-react';
import { useEarnings, usePayouts } from '../../hooks/api/useEarnings';
import type { TeacherEarningEntry, TeacherPayoutRecord } from '../../lib/api/earnings';
import { cn } from '../../lib/utils';

/**
 * /teach/earnings — the teacher's own append-only ledger, plus payout history (Phase 3I + 3J-lite).
 *
 * "Balance" here means owed-but-not-yet-paid; once an admin records a manual payout (UPI, bank
 * transfer, cash — recorded on the admin side, never self-serve), those entries move out of the
 * balance and into the payout list below. Automated, in-app payouts still don't exist — that's
 * disclosed rather than implied, matching TEACHER_ECOSYSTEM_PLAN.md §G.
 */

function rupees(paise: number): string {
  const value = paise / 100;
  return `₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function typeLabel(type: TeacherEarningEntry['type']): string {
  switch (type) {
    case 'sale': return 'Class sale';
    case 'commission': return 'Platform commission';
    case 'tax': return 'Tax';
    case 'refund': return 'Refund';
    case 'adjustment': return 'Adjustment';
  }
}

function methodLabel(method: TeacherPayoutRecord['method']): string {
  switch (method) {
    case 'upi': return 'UPI';
    case 'bank_transfer': return 'Bank transfer';
    case 'cash': return 'Cash';
    case 'other': return 'Other';
  }
}

function formatDate(value: unknown): string {
  let date: Date | null = null;
  if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (value && typeof value === 'object' && '_seconds' in (value as any)) date = new Date((value as any)._seconds * 1000);
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]', className)}>
      {children}
    </div>
  );
}

export default function TeacherEarnings() {
  const { data, isLoading, isError } = useEarnings();
  const { data: payouts } = usePayouts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">Earnings</h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-gray-400">
          What your paid classes have brought in, after platform commission.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2.5 text-[13.5px] text-slate-500 dark:text-gray-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading…
        </div>
      )}

      {isError && (
        <Card className="p-5 border-red-500/30">
          <p className="text-[13.5px] text-red-800 dark:text-red-300">We couldn&rsquo;t load your earnings.</p>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-6">
              <p className="text-[12.5px] font-medium text-slate-500 dark:text-gray-400">Balance</p>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <IndianRupee className="w-5 h-5 mb-0.5 text-slate-900 dark:text-white" strokeWidth={2} aria-hidden />
                <span className="text-[28px] sm:text-[34px] font-bold tracking-[-0.03em]">
                  {(data.balancePaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-slate-500 dark:text-gray-400">Owed, not yet paid out</p>
            </Card>
            <Card className="p-6">
              <p className="text-[12.5px] font-medium text-slate-500 dark:text-gray-400">Paid out</p>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <IndianRupee className="w-5 h-5 mb-0.5 text-emerald-700 dark:text-emerald-400" strokeWidth={2} aria-hidden />
                <span className="text-[28px] sm:text-[34px] font-bold tracking-[-0.03em] text-emerald-700 dark:text-emerald-400">
                  {(data.paidPaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-slate-500 dark:text-gray-400">Settled so far</p>
            </Card>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-4">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-500 dark:text-gray-400" strokeWidth={2} aria-hidden />
            <p className="text-[12.5px] leading-relaxed text-slate-500 dark:text-gray-400">
              Payouts are recorded manually for now (UPI, bank transfer or cash, arranged directly)
              — there&rsquo;s no automated in-app payout yet. Once one is recorded, it shows up below.
            </p>
          </div>

          {!!payouts?.length && (
            <Card>
              {payouts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">{methodLabel(p.method)}{p.reference ? ` · ${p.reference}` : ''}</p>
                    <p className="text-[11.5px] text-slate-500 dark:text-gray-400">{formatDate(p.createdAt)}</p>
                  </div>
                  <span className="text-[13.5px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                    {rupees(p.netPaise)}
                  </span>
                </div>
              ))}
            </Card>
          )}

          {data.entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/12 p-8 text-center">
              <p className="text-[13.5px] text-slate-500 dark:text-gray-400">No sales yet.</p>
            </div>
          ) : (
            <Card>
              {data.entries.map((e) => {
                const positive = e.amountPaise >= 0;
                return (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                    <span className={cn(
                      'w-7 h-7 shrink-0 rounded-full flex items-center justify-center',
                      positive ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400',
                    )}>
                      {positive ? <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /> : <ArrowDownRight className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">{typeLabel(e.type)}</p>
                      <p className="text-[11.5px] text-slate-500 dark:text-gray-400">{formatDate(e.createdAt)} · {e.state === 'paid' ? 'paid out' : e.state}</p>
                    </div>
                    <span className={cn('text-[13.5px] font-semibold shrink-0', positive ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-gray-400')}>
                      {positive ? '+' : '−'}{rupees(e.amountPaise)}
                    </span>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
