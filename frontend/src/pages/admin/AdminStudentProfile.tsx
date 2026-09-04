/**
 * Administrative view of one student.
 *
 * Not the student's own profile: this answers operator questions — what plan are they on,
 * what have they consumed, what have they paid, what is failing for them.
 *
 * ─── QUOTAS COME FROM THE STUDENT APP'S OWN SOURCE (§8) ──────────────────────────────
 * Every used/limit/remaining figure is rendered straight from the `usage` object the API
 * returns, which the backend obtains from `usageService.getUsageSummary()` — the same
 * call the student app makes. Nothing is recomputed here. If this file ever starts doing
 * arithmetic on limits, the admin and student views can disagree about the same account,
 * which is exactly the failure §8 exists to prevent.
 *
 * ─── NULL IS NOT ZERO (§37, §"Data integrity") ───────────────────────────────────────
 * A section that failed to load arrives as `null` and renders as "unavailable". A section
 * that loaded and is empty renders as "none". Those are different facts: "no payments"
 * and "payments could not be read" must never look alike to someone deciding whether to
 * refund an account.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, Brain, CheckCircle2, CreditCard, Gauge, RefreshCw, ShieldAlert,
  TrendingDown, TrendingUp, User,
} from 'lucide-react';
import { api } from '../../lib/api/client';

interface UsageMetric { used: number; limit: number; remaining: number; percent: number }
interface VoiceMetric {
  usedSeconds: number; usedMinutes: number; limitMinutes: number;
  remainingMinutes: number; percent: number;
}
interface UsageSummary {
  plan: 'free' | 'pro';
  isPro: boolean;
  periodKey: string;
  periodStart: number;
  periodEnd: number;
  resetsAt: number;
  metrics: {
    chat: UsageMetric;
    voice: VoiceMetric;
    documents: UsageMetric;
    podcasts: UsageMetric;
    mockTests: UsageMetric;
  };
}

interface PaymentRecord {
  orderId: string; paymentId: string | null; planName: string | null; billing: string | null;
  amountRupees: number | null; currency: string; status: string; method: string | null;
  createdAt: string | null;
}

interface MasteryConceptRow {
  conceptId: string;
  title: string;
  subject: string | null;
  topic: string | null;
  masteryScore: number;
  masteryPercent: number;
  level: 'weak' | 'developing' | 'strong';
  trend: 'improving' | 'declining' | 'steady';
  attempts: number;
  successRate: number;
  lastPracticed: string | null;
}

interface MasterySummary {
  concepts: MasteryConceptRow[];
  totalConcepts: number;
  averageMasteryPercent: number | null;
  weakCount: number;
  developingCount: number;
  strongCount: number;
  lastPracticed: string | null;
  truncated: boolean;
}

interface StudentDetail {
  id: string; name: string; email: string;
  plan: 'free' | 'pro';
  subscriptionStatus: string | null;
  subscription: Record<string, unknown> | null;
  createdAt: string | null;
  onboardingStatus: string | null;
  accountStatus: 'active' | 'suspended' | 'pending';
  lastSignInAt: string | null;
  emailVerified: boolean;
  usage: UsageSummary | null;
  billing: {
    records: PaymentRecord[]; totalPaidRupees: number; paidCount: number;
    failedCount: number; refundedCount: number; truncated: boolean;
  } | null;
  stats: Record<string, unknown> | null;
  documentCount: number | null;
  mastery: MasterySummary | null;
  activity: { available: false; reason: string };
}

const TABS = ['Overview', 'Usage', 'Billing', 'Mastery', 'Activity'] as const;
type Tab = (typeof TABS)[number];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const relative = (iso: string | null): string => {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
};

/** Renders a metered feature exactly as the entitlement service reported it. */
function QuotaBar({ label, used, limit, remaining, percent, unit }: {
  label: string; used: number; limit: number; remaining: number; percent: number; unit?: string;
}) {
  const pct = Math.min(Math.max(percent, 0), 100);
  // Colour is a reading aid only — the threshold does not change any decision the server makes.
  const tone = pct >= 90 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-[#c8e558]';
  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium text-slate-700 dark:text-gray-200">{label}</span>
        <span className="text-[12px] tabular-nums text-slate-500 dark:text-gray-400">
          {used.toLocaleString('en-IN')} / {limit.toLocaleString('en-IN')}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.07] overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 dark:text-gray-500 tabular-nums">
        <span>{pct.toFixed(0)}% used</span>
        <span>{remaining.toLocaleString('en-IN')}{unit ? ` ${unit}` : ''} left</span>
      </div>
    </div>
  );
}

function Unavailable({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.09] px-4 py-6 text-center">
      <p className="text-[12.5px] text-slate-500 dark:text-gray-400">{what} could not be loaded.</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-gray-500">{label}</div>
      <div className="mt-1 text-[13px] text-slate-800 dark:text-gray-100 break-words">{children}</div>
    </div>
  );
}

export default function AdminStudentProfile() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');

  const load = async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const res = await api.get<StudentDetail>(`/admin/students/${id}`);
      setData(res.data);
    } catch (err: unknown) {
      const r = (err as { response?: { status?: number; data?: { error?: string } } }).response;
      setError(
        r?.status === 404 ? 'No student with that id.'
          : r?.status === 403 ? 'This account is not authorised to view students.'
          : r?.data?.error || 'Unable to load this student.',
      );
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-xl bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
        <div className="h-9 w-64 rounded-lg bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
        <div className="grid sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-100 dark:bg-white/[0.05] animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] px-4 py-12 text-center">
        <AlertCircle className="w-5 h-5 mx-auto text-slate-400" strokeWidth={1.9} />
        <p className="mt-2.5 text-[13.5px] text-slate-600 dark:text-gray-300">{error}</p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Link to="/admin/students" className="rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]">
            Back to students
          </Link>
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]">
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const m = data.usage?.metrics;

  return (
    <div className="space-y-5">
      <Link to="/admin/students" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} /> All students
      </Link>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-slate-400" strokeWidth={1.9} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white truncate">{data.name}</h2>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                data.plan === 'pro'
                  ? 'bg-[#f2f7e3] dark:bg-[#1e2416] text-[#5A7410] dark:text-[#c8e558]'
                  : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400'
              }`}>{data.plan === 'pro' ? 'Pro' : 'Free'}</span>
              {data.accountStatus === 'suspended' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                  <ShieldAlert className="w-3 h-3" strokeWidth={2} /> Suspended
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-gray-400 truncate">{data.email}</p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-gray-500 truncate">{data.id}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 dark:border-white/[0.05]">
          <Field label="Registered">{fmtDate(data.createdAt)}</Field>
          <Field label="Last seen">{relative(data.lastSignInAt)}</Field>
          <Field label="Email verified">
            {data.emailVerified
              ? <span className="inline-flex items-center gap-1 text-[#5A7410] dark:text-[#c8e558]"><CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} /> Yes</span>
              : <span className="text-slate-400 dark:text-gray-500">No</span>}
          </Field>
          <Field label="Onboarding">{data.onboardingStatus ?? '—'}</Field>
        </div>

        {/*
          Administrative ACTIONS (suspend, reactivate, adjust entitlement) are deliberately
          absent. Each one mutates a real account, so each needs its own audited endpoint
          and a confirmation step (§22) — and there is no admin audit log to record them in
          yet. Shipping the buttons before the audit trail would mean state changes nobody
          can reconstruct. They arrive with the audit slice.
        */}
        <p className="mt-4 text-[11.5px] text-slate-400 dark:text-gray-500">
          Read-only. Account actions arrive with the audit log, so every change is recorded.
        </p>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-slate-200/70 dark:border-white/[0.07]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-[#c8e558] text-slate-900 dark:text-white'
                : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-4 space-y-3">
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-slate-400" strokeWidth={1.9} /> Billing
            </h3>
            {data.billing === null ? <Unavailable what="Billing" /> : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Total paid">₹{data.billing.totalPaidRupees.toLocaleString('en-IN')}</Field>
                <Field label="Successful">{data.billing.paidCount}</Field>
                <Field label="Failed">{data.billing.failedCount}</Field>
                <Field label="Refunded">{data.billing.refundedCount}</Field>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-4 space-y-3">
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-slate-400" strokeWidth={1.9} /> Plan & content
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plan">{data.plan === 'pro' ? 'Pro' : 'Free'}</Field>
              <Field label="Subscription">{data.subscriptionStatus ?? '—'}</Field>
              <Field label="Documents">
                {data.documentCount === null
                  ? <span className="text-slate-400 dark:text-gray-500">unavailable</span>
                  : data.documentCount}
              </Field>
              <Field label="Usage period">{data.usage?.periodKey ?? '—'}</Field>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-4 space-y-3">
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-slate-400" strokeWidth={1.9} /> Mastery
            </h3>
            {data.mastery === null ? <Unavailable what="Mastery" /> : data.mastery.totalConcepts === 0 ? (
              <p className="text-[12.5px] text-slate-500 dark:text-gray-400">
                No concepts tracked yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Average mastery">{data.mastery.averageMasteryPercent ?? '—'}%</Field>
                <Field label="Concepts tracked">{data.mastery.totalConcepts}</Field>
                <Field label="Weak">
                  <span className={data.mastery.weakCount > 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
                    {data.mastery.weakCount}
                  </span>
                </Field>
                <Field label="Last practiced">{relative(data.mastery.lastPracticed)}</Field>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Usage' && (
        data.usage === null || !m ? <Unavailable what="Usage" /> : (
          <div className="space-y-3">
            <p className="text-[12px] text-slate-500 dark:text-gray-400">
              Current period <span className="font-medium text-slate-700 dark:text-gray-200">{data.usage.periodKey}</span>
              {' · '}resets {fmtDate(new Date(data.usage.resetsAt).toISOString())}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <QuotaBar label="AI Chat" used={m.chat.used} limit={m.chat.limit} remaining={m.chat.remaining} percent={m.chat.percent} />
              <QuotaBar label="Voice" used={m.voice.usedMinutes} limit={m.voice.limitMinutes} remaining={m.voice.remainingMinutes} percent={m.voice.percent} unit="min" />
              <QuotaBar label="Documents" used={m.documents.used} limit={m.documents.limit} remaining={m.documents.remaining} percent={m.documents.percent} />
              <QuotaBar label="Podcasts" used={m.podcasts.used} limit={m.podcasts.limit} remaining={m.podcasts.remaining} percent={m.podcasts.percent} />
              <QuotaBar label="Mock tests" used={m.mockTests.used} limit={m.mockTests.limit} remaining={m.mockTests.remaining} percent={m.mockTests.percent} />
            </div>
            <p className="text-[11.5px] text-slate-400 dark:text-gray-500">
              Figures come from the same entitlement service the student app uses, so this matches
              what the student sees.
            </p>
          </div>
        )
      )}

      {tab === 'Billing' && (
        data.billing === null ? <Unavailable what="Billing" /> :
        data.billing.records.length === 0 ? (
          <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] px-4 py-12 text-center">
            <p className="text-[13px] text-slate-500 dark:text-gray-400">No payment records for this student.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[680px]">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500 border-b border-slate-200/70 dark:border-white/[0.07]">
                    <th className="px-4 py-2.5 font-semibold">Date</th>
                    <th className="px-4 py-2.5 font-semibold">Plan</th>
                    <th className="px-4 py-2.5 font-semibold">Amount</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {data.billing.records.map((p) => (
                    <tr key={p.orderId} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 text-[12.5px] text-slate-600 dark:text-gray-300 tabular-nums">{fmtDate(p.createdAt)}</td>
                      <td className="px-4 py-2.5 text-[12.5px] text-slate-600 dark:text-gray-300">
                        {p.planName ?? '—'}{p.billing ? <span className="text-slate-400"> · {p.billing}</span> : null}
                      </td>
                      <td className="px-4 py-2.5 text-[12.5px] text-slate-800 dark:text-gray-100 tabular-nums font-medium">
                        {p.amountRupees === null ? '—' : `₹${p.amountRupees.toLocaleString('en-IN')}`}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          p.status === 'paid' ? 'bg-[#f2f7e3] dark:bg-[#1e2416] text-[#5A7410] dark:text-[#c8e558]'
                          : p.status === 'failed' ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                          : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400'
                        }`}>{p.status}</span>
                      </td>
                      {/* Order/payment ids only. No card data is stored or shown (§9). */}
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400 dark:text-gray-500 truncate max-w-[200px]">
                        {p.paymentId ?? p.orderId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.billing.truncated && (
              <p className="px-4 py-2.5 text-[11.5px] text-amber-600 dark:text-amber-400 border-t border-slate-200/70 dark:border-white/[0.07]">
                Showing the 50 most recent payments — this student has more.
              </p>
            )}
          </div>
        )
      )}

      {tab === 'Mastery' && (
        data.mastery === null ? <Unavailable what="Mastery" /> :
        data.mastery.totalConcepts === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.09] px-5 py-10 text-center">
            <Brain className="w-5 h-5 mx-auto text-slate-400" strokeWidth={1.9} />
            <p className="mt-2.5 text-[13px] font-medium text-slate-700 dark:text-gray-200">No mastery evidence yet</p>
            <p className="mt-1.5 text-[12.5px] text-slate-500 dark:text-gray-400 max-w-md mx-auto">
              This fills in the first time the student completes a graded quiz or test. Nothing
              is wrong — most students simply haven't yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-gray-500">Average</div>
                <div className="mt-1 text-[20px] font-semibold text-slate-900 dark:text-white tabular-nums">
                  {data.mastery.averageMasteryPercent ?? '—'}%
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-gray-500">Concepts</div>
                <div className="mt-1 text-[20px] font-semibold text-slate-900 dark:text-white tabular-nums">
                  {data.mastery.totalConcepts}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-gray-500">Weak · Developing · Strong</div>
                <div className="mt-1 text-[13px] font-medium tabular-nums">
                  <span className="text-amber-600 dark:text-amber-400">{data.mastery.weakCount}</span>
                  <span className="text-slate-300 dark:text-gray-600"> · </span>
                  <span className="text-slate-600 dark:text-gray-300">{data.mastery.developingCount}</span>
                  <span className="text-slate-300 dark:text-gray-600"> · </span>
                  <span className="text-[#5A7410] dark:text-[#c8e558]">{data.mastery.strongCount}</span>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-gray-500">Last practiced</div>
                <div className="mt-1 text-[13px] font-medium text-slate-700 dark:text-gray-200">
                  {relative(data.mastery.lastPracticed)}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.06]">
                <p className="text-[12px] text-slate-500 dark:text-gray-400">
                  Weakest first — this is what an operator can actually act on.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[720px]">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500 border-b border-slate-200/70 dark:border-white/[0.07]">
                      <th className="px-4 py-2.5 font-semibold">Concept</th>
                      <th className="px-4 py-2.5 font-semibold">Mastery</th>
                      <th className="px-4 py-2.5 font-semibold">Trend</th>
                      <th className="px-4 py-2.5 font-semibold">Attempts</th>
                      <th className="px-4 py-2.5 font-semibold">Success rate</th>
                      <th className="px-4 py-2.5 font-semibold">Last practiced</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                    {data.mastery.concepts.map((c) => (
                      <tr key={c.conceptId} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03]">
                        <td className="px-4 py-2.5">
                          <div className="text-[12.5px] font-medium text-slate-800 dark:text-gray-100">{c.title}</div>
                          {(c.subject || c.topic) && (
                            <div className="text-[11px] text-slate-400 dark:text-gray-500">
                              {[c.subject, c.topic].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-slate-100 dark:bg-white/[0.08] overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  c.level === 'weak' ? 'bg-amber-500'
                                  : c.level === 'developing' ? 'bg-slate-400 dark:bg-gray-500'
                                  : 'bg-[#8FAE2B]'
                                }`}
                                style={{ width: `${Math.min(c.masteryPercent, 100)}%` }}
                              />
                            </div>
                            <span className="text-[12px] font-medium tabular-nums text-slate-700 dark:text-gray-200">
                              {c.masteryPercent}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-[11.5px] font-medium ${
                            c.trend === 'improving' ? 'text-[#5A7410] dark:text-[#c8e558]'
                            : c.trend === 'declining' ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-500 dark:text-gray-400'
                          }`}>
                            {c.trend === 'improving' && <TrendingUp className="w-3.5 h-3.5" strokeWidth={2} />}
                            {c.trend === 'declining' && <TrendingDown className="w-3.5 h-3.5" strokeWidth={2} />}
                            {c.trend === 'improving' ? 'Improving' : c.trend === 'declining' ? 'Declining' : 'Steady'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[12.5px] text-slate-600 dark:text-gray-300 tabular-nums">{c.attempts}</td>
                        <td className="px-4 py-2.5 text-[12.5px] text-slate-600 dark:text-gray-300 tabular-nums">
                          {Math.round(c.successRate * 100)}%
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-slate-400 dark:text-gray-500 whitespace-nowrap">
                          {relative(c.lastPracticed)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.mastery.truncated && (
                <p className="px-4 py-2.5 text-[11.5px] text-amber-600 dark:text-amber-400 border-t border-slate-200/70 dark:border-white/[0.07]">
                  Showing the first 200 concepts — this student has more.
                </p>
              )}
            </div>
          </div>
        )
      )}

      {tab === 'Activity' && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.09] px-5 py-10 text-center">
          <p className="text-[13px] font-medium text-slate-700 dark:text-gray-200">Activity is not recorded yet</p>
          <p className="mt-1.5 text-[12.5px] text-slate-500 dark:text-gray-400 max-w-md mx-auto">
            {data.activity.reason} Building the event model is its own piece of work — until it
            exists, this tab shows nothing rather than reconstructing a plausible history from
            registration and sign-in timestamps.
          </p>
        </div>
      )}
    </div>
  );
}
