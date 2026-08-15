import { useState } from 'react';
import { Copy, Gift, Users, CheckCircle2, Share2, Loader2 } from 'lucide-react';
import { useMyReferrals } from '../../hooks/api/useReferrals';
import { cn } from '../../lib/utils';

/**
 * /teach/referrals — Phase 3L (Referrals & Entitlements).
 * Exposes the referral system to teachers.
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
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TeacherReferrals() {
  const { data, isLoading, isError } = useMyReferrals();
  const [copied, setCopied] = useState(false);

  const referralLink = data?.referralCode
    ? `${window.location.origin}/signup?ref=${data.referralCode}`
    : '';

  const totalRewards = data?.referrals.reduce((sum, r) => sum + (r.referrerRewardDays || 0), 0) || 0;

  const copyToClipboard = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">Referrals</h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-gray-400">
          Invite students or other teachers and earn platform rewards.
        </p>
      </div>

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
          <Card className="p-6 sm:p-8 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/10 dark:to-[#141416]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="max-w-md">
                <h2 className="text-[18px] font-semibold flex items-center gap-2">
                  <Gift className="w-5 h-5 text-indigo-500" />
                  Invite & Earn
                </h2>
                <p className="mt-2 text-[13.5px] text-slate-600 dark:text-gray-400 leading-relaxed">
                  Share your link. When someone joins using it, you earn <strong className="text-slate-900 dark:text-white">{data.rewardRule.referrerRewardDays} days</strong> of Pro access, and they get <strong className="text-slate-900 dark:text-white">{data.rewardRule.referredRewardDays} days</strong> free!
                </p>
              </div>

              <div className="w-full sm:w-auto">
                <p className="text-[11.5px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                  Your Referral Link
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-11 px-4 flex items-center bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden min-w-[240px]">
                    <span className="text-[13.5px] text-slate-900 dark:text-white truncate">
                      {referralLink}
                    </span>
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className="h-11 px-5 inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-[13.5px] font-semibold transition-colors shrink-0"
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-6">
              <p className="text-[12.5px] font-medium text-slate-500 dark:text-gray-400">Total Referrals</p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <Users className="w-5 h-5 mb-0.5 text-slate-900 dark:text-white" strokeWidth={2} aria-hidden />
                <span className="text-[28px] sm:text-[34px] font-bold tracking-[-0.03em]">
                  {data.referrals.length}
                </span>
              </div>
            </Card>
            <Card className="p-6">
              <p className="text-[12.5px] font-medium text-slate-500 dark:text-gray-400">Days Earned</p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <Gift className="w-5 h-5 mb-0.5 text-emerald-600 dark:text-emerald-400" strokeWidth={2} aria-hidden />
                <span className="text-[28px] sm:text-[34px] font-bold tracking-[-0.03em] text-emerald-600 dark:text-emerald-400">
                  {totalRewards}
                </span>
              </div>
            </Card>
          </div>

          <section>
            <h2 className="text-[16px] font-semibold mb-4">Referral History</h2>
            {data.referrals.length === 0 ? (
              <Card className="p-8 text-center">
                <Share2 className="w-8 h-8 mx-auto text-slate-300 dark:text-gray-600 mb-3" />
                <p className="text-[13.5px] text-slate-500 dark:text-gray-400">
                  No referrals yet. Share your link to get started!
                </p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                      <th className="px-5 py-3 text-[11.5px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-widest">Date</th>
                      <th className="px-5 py-3 text-[11.5px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-widest text-right">Earned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.referrals.map((ref) => (
                      <tr key={ref.id} className="border-b border-slate-100 dark:border-white/5 last:border-0 hover:bg-slate-50/50 dark:hover:bg-white/[0.01]">
                        <td className="px-5 py-3.5 text-[13.5px] text-slate-900 dark:text-white">
                          {formatDate(ref.createdAt)}
                        </td>
                        <td className="px-5 py-3.5 text-[13.5px] font-medium text-emerald-600 dark:text-emerald-400 text-right">
                          +{ref.referrerRewardDays} days
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
