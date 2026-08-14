import { useState } from 'react';
import { Gift, Copy, Check, Loader2, Users } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useMyReferrals } from '../hooks/api/useReferrals';
import { cn } from '../lib/utils';

/**
 * /refer — Phase 3L. A referral grants nothing on the class/enrolment side (that's still only
 * invitation or purchase, per enrollment.service.ts) — it only ever extends both accounts' Pro
 * access, and only once someone actually signs up.
 *
 * The referral link carries the caller's own uid (`?ref=<uid>`), not a minted code — see
 * referral.controller.ts for why that's safe here.
 */

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]', className)}>
      {children}
    </div>
  );
}

function formatDate(value: unknown): string {
  let date: Date | null = null;
  if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (value && typeof value === 'object' && '_seconds' in (value as any)) date = new Date((value as any)._seconds * 1000);
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Refer() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useMyReferrals();
  const [copied, setCopied] = useState(false);

  const link = user?.uid ? `${window.location.origin}/signup?ref=${user.uid}` : '';

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-[720px] mx-auto px-5 sm:px-6 py-8 space-y-6">
      <header>
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">Invite friends</h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-gray-400">
          Share your link. When someone signs up with it, you both get Pro access.
        </p>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2.5 text-[13.5px] text-slate-500 dark:text-gray-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading…
        </div>
      )}

      {isError && (
        <Card className="p-5 border-red-500/30">
          <p className="text-[13.5px] text-red-800 dark:text-red-300">We couldn&rsquo;t load your referrals.</p>
        </Card>
      )}

      {data && (
        <>
          <Card className="p-6">
            <div className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-[#c8e558]/25 flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5 text-[#5f7516] dark:text-[#c8e558]" strokeWidth={2} aria-hidden />
              </span>
              <div>
                {data.rewardRule.active ? (
                  <p className="text-[14.5px] font-semibold">
                    You get {data.rewardRule.referrerRewardDays} days of Pro, they get {data.rewardRule.referredRewardDays}
                  </p>
                ) : (
                  <p className="text-[14.5px] font-semibold text-slate-500 dark:text-gray-400">
                    Referral rewards are paused right now
                  </p>
                )}
                <p className="text-[12.5px] text-slate-500 dark:text-gray-400">Applied the moment they finish signing up.</p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                readOnly
                value={link}
                onClick={(e) => e.currentTarget.select()}
                className="flex-1 h-11 px-3.5 rounded-xl border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-white/[0.04] text-[13.5px] font-mono truncate"
              />
              <button
                onClick={copy}
                className="shrink-0 inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13.5px] font-semibold"
              >
                {copied ? <Check className="w-4 h-4" strokeWidth={2} aria-hidden /> : <Copy className="w-4 h-4" strokeWidth={2} aria-hidden />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </Card>

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
              People you&rsquo;ve referred ({data.referrals.length})
            </h2>
            {data.referrals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/12 p-8 text-center">
                <Users className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" strokeWidth={1.9} aria-hidden />
                <p className="mt-3 text-[13.5px] text-slate-500 dark:text-gray-400">Nobody yet — share your link above.</p>
              </div>
            ) : (
              <Card>
                {data.referrals.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-slate-100 dark:bg-white/[0.08] flex items-center justify-center text-[11px] font-semibold text-slate-600 dark:text-gray-300">
                      {r.referredUid.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate" title={r.referredUid}>{r.referredUid.slice(0, 12)}…</p>
                      <p className="text-[11.5px] text-slate-500 dark:text-gray-400">{formatDate(r.createdAt)}</p>
                    </div>
                    <span className="text-[12.5px] font-semibold text-[#5f7516] dark:text-[#c8e558] shrink-0">
                      +{r.referrerRewardDays}d
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
