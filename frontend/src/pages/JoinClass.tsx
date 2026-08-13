import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  Loader2, Check, AlertTriangle, ArrowRight, CalendarDays, BookOpen, Globe, IndianRupee,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useInvitationPreview, useEnrollmentMutations } from '../hooks/api/useEnrollments';
import { useSeo } from '../lib/useSeo';

/**
 * /join/:code — where an invitation link lands.
 *
 * ── Why this route sits OUTSIDE ProtectedRoute ────────────────────────────────────────
 * A shared link is opened by people in every possible state: signed out, signed in, or
 * half-way through onboarding. ProtectedRoute would bounce a signed-out visitor to /signin
 * (recoverable) but would also divert a student with an incomplete profile into the onboarding
 * wizard, losing the invitation entirely. So this page owns its own gate and degrades:
 *
 *   signed out  → explain what this is, offer sign-in that returns here
 *   signed in   → preview the class, offer to join
 *
 * Accepting is still fully authenticated — the API requires a verified token, and the server
 * decides whether the code is usable. Nothing here grants access; it only asks.
 */

function Mark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15" />
      <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf9f7] dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased flex flex-col">
      <header className="px-5 sm:px-8 py-5">
        <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Scholarly home">
          <Mark />
          <span className="text-[16px] font-semibold tracking-[-0.02em]">Scholarly</span>
        </Link>
      </header>
      <main className="flex-1 flex items-start justify-center px-5 sm:px-8 pb-16">
        <div className="w-full max-w-[34rem] pt-6">{children}</div>
      </main>
    </div>
  );
}

export default function JoinClass() {
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  const signedIn = !!user;
  const { data: preview, isLoading, isError, error } = useInvitationPreview(code, signedIn);
  const { acceptInvitation } = useEnrollmentMutations();

  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useSeo({
    title: 'Join a class on Scholarly',
    description: 'You have been invited to join a class on Scholarly.',
  });

  const handleJoin = async () => {
    setJoinError(null);
    try {
      await acceptInvitation.mutateAsync(code as string);
      setJoined(true);
    } catch (e: any) {
      setJoinError(e?.response?.data?.error ?? 'We could not add you to this class.');
    }
  };

  if (authLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-2.5 text-[13.5px] text-slate-500 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading…
        </div>
      </Shell>
    );
  }

  // ── Signed out ──
  if (!signedIn) {
    return (
      <Shell>
        <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-[-0.03em]">
          You&rsquo;ve been invited to a class
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
          Sign in or create a free Scholarly account to see the class and decide whether to join.
          Nothing happens to your account until you choose to.
        </p>
        <div className="mt-7 flex flex-col sm:flex-row gap-3">
          <Link
            to="/signin"
            state={{ from: location }}
            className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 text-[14.5px] font-semibold transition-colors"
          >
            Sign in to continue
            <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden />
          </Link>
          <Link
            to="/signup"
            state={{ role: 'student', from: location }}
            className="inline-flex items-center justify-center h-12 px-6 rounded-xl border border-slate-200 dark:border-white/12 text-[14.5px] font-semibold hover:bg-white dark:hover:bg-white/[0.04] transition-colors"
          >
            Create an account
          </Link>
        </div>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-2.5 text-[13.5px] text-slate-500 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Looking up this invitation…
        </div>
      </Shell>
    );
  }

  if (isError || !preview) {
    const msg = (error as any)?.response?.data?.error ?? 'This invitation link is not valid.';
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" strokeWidth={2} aria-hidden />
          <h1 className="mt-3 text-[18px] font-semibold tracking-[-0.02em]">Invitation not found</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">{msg}</p>
          <p className="mt-2 text-[13px] text-slate-500 dark:text-gray-400">
            Ask your teacher for a fresh link.
          </p>
          <Link to="/dashboard" className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold underline underline-offset-2">
            Go to Scholarly
          </Link>
        </div>
      </Shell>
    );
  }

  const c = preview.class;
  const meta = [c.subject, c.grade, c.board].filter(Boolean).join(' · ');
  const isPaid = c.pricing.type === 'paid';

  if (joined) {
    return (
      <Shell>
        <div className="rounded-2xl border border-[#c8e558] bg-[#c8e558]/[0.08] p-6">
          <span className="inline-flex w-10 h-10 rounded-xl bg-[#c8e558] items-center justify-center">
            <Check className="w-5 h-5 text-slate-900" strokeWidth={2.5} aria-hidden />
          </span>
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">You&rsquo;re in</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
            You&rsquo;ve joined <span className="font-medium">{c.title}</span>. Your teacher can now see
            you on the class roster.
          </p>
          <Link to="/dashboard" className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[14px] font-semibold">
            Go to Scholarly
            <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-gray-400">
        Class invitation
      </p>
      <h1 className="mt-2 text-[26px] sm:text-[30px] font-semibold tracking-[-0.03em]">{c.title}</h1>
      {meta && <p className="mt-1.5 text-[14.5px] text-slate-500 dark:text-gray-400">{meta}</p>}

      {c.description && (
        <p className="mt-4 text-[14.5px] leading-relaxed text-slate-600 dark:text-gray-300">{c.description}</p>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] divide-y divide-slate-100 dark:divide-white/[0.06]">
        {[
          { icon: IndianRupee, label: 'Price', value: isPaid ? `₹${c.pricing.amountINR.toLocaleString('en-IN')}` : 'Free' },
          { icon: BookOpen, label: 'Topics', value: c.syllabusCount > 0 ? `${c.syllabusCount} in the syllabus` : 'Syllabus not published yet' },
          { icon: Globe, label: 'Mode', value: c.mode === 'offline' ? 'In person' : c.mode === 'hybrid' ? 'Hybrid' : 'Online' },
          ...(c.startDate ? [{ icon: CalendarDays, label: 'Starts', value: c.startDate }] : []),
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-3 px-5 py-3">
            <row.icon className="w-4 h-4 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={1.9} aria-hidden />
            <span className="w-20 shrink-0 text-[12.5px] text-slate-500 dark:text-gray-400">{row.label}</span>
            <span className="text-[13.5px] font-medium">{row.value}</span>
          </div>
        ))}
      </div>

      {joinError && (
        <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-500/[0.07] p-4 text-[13.5px] text-red-800 dark:text-red-300">
          {joinError}
        </div>
      )}

      {isPaid ? (
        <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.07] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={2} aria-hidden />
            <div>
              <p className="text-[14px] font-semibold text-amber-800 dark:text-amber-300">
                This class can&rsquo;t be joined yet
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-amber-800 dark:text-amber-300">
                It&rsquo;s a paid class, and buying classes isn&rsquo;t available on Scholarly yet.
                Your teacher will be able to let you in once it is.
              </p>
            </div>
          </div>
        </div>
      ) : !preview.usable ? (
        <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.07] p-5 text-[13.5px] text-amber-800 dark:text-amber-300">
          {preview.reason ?? 'This invitation can no longer be used.'}
        </div>
      ) : (
        <>
          <button
            onClick={handleJoin}
            disabled={acceptInvitation.isPending}
            className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 text-[14.5px] font-semibold transition-colors disabled:opacity-60"
          >
            {acceptInvitation.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
            Join this class
          </button>
          <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500 dark:text-gray-400">
            Joining lets your teacher see you on this class&rsquo;s roster. It does not give them
            access to your private notebooks, conversations or anything outside this class.
          </p>
        </>
      )}
    </Shell>
  );
}
