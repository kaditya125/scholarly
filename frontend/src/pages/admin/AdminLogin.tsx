/**
 * Administrative sign-in — deliberately separate from /signin (§30).
 *
 * WHY A SEPARATE PAGE. The student sign-in carries onboarding, policy consent, Google
 * sign-in, "create an account" and password recovery, none of which belong in an
 * administrative session. Mixing them also means an admin redirect drops the operator
 * into the student funnel. This page does one thing: authenticate an existing account
 * and check whether it holds an admin role.
 *
 * WHY IT IS NOT A SECOND AUTH SYSTEM. It signs in through the same Firebase project and
 * the same `auth` instance as everything else (§34: no duplicate business logic). What
 * differs is only what happens next — the claim check and where the user is sent.
 *
 * SECURITY. This page cannot grant anything. It reads the admin claim after sign-in only
 * to decide where to navigate and what to say. A non-admin who signs in here gets a
 * session identical to signing in at /signin, and every admin API still refuses them
 * server-side. Nothing about knowing this URL confers access (§32).
 */
import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Loader2, ShieldCheck } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../lib/AuthContext';
import { canEnterAdminArea } from './shell/adminRoles';

export default function AdminLogin() {
  const { user, adminRole, claimsLoading, refreshClaims, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when sign-in succeeded but the account turned out to hold no admin role. */
  const [notAnAdmin, setNotAnAdmin] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  // Claims only appear in a freshly minted ID token, so a role granted after this
  // session started would otherwise stay invisible until the token expired.
  useEffect(() => {
    if (user) void refreshClaims();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Already an admin → straight through, honouring the intended destination.
  if (user && !claimsLoading && canEnterAdminArea(adminRole)) {
    return <Navigate to={from && from.startsWith('/admin') ? from : '/admin'} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setNotAnAdmin(false);
    setSubmitting(true);
    /*
     * Authentication and everything after it are reported separately, because they fail for
     * unrelated reasons and only the first is about the credential.
     *
     * These were one try/catch. A refreshClaims() failure — a network blip, a slow token mint —
     * therefore told the operator "Those credentials were not accepted" when Firebase had just
     * accepted them, sending them off to reset a password that was never wrong.
     */
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      // Deliberately identical copy for wrong-password and unknown-account: distinguishing
      // them turns this form into an account-existence oracle.
      setError(
        code === 'auth/too-many-requests'
          ? 'Too many attempts. Wait a moment and try again.'
          : 'Those credentials were not accepted.',
      );
      setSubmitting(false);
      return;
    }

    /*
     * Past this point the credential was accepted and the session exists. Anything failing here
     * is a post-authentication fault, so it must not be described as a credential problem — and
     * it is recoverable by retrying rather than by changing anything about the account.
     *
     * No account-existence concern applies now: the caller has already proved they hold this
     * account, so a specific message leaks nothing.
     */
    try {
      // The claim lives on the token, not the credential — force a refresh before reading.
      await refreshClaims();
      navigate(from && from.startsWith('/admin') ? from : '/admin', { replace: true });
    } catch {
      setError('Signed in, but your administrator role could not be read. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Signed in, claims resolved, no admin role. Offer a way out rather than a dead end.
  if (user && !claimsLoading && !canEnterAdminArea(adminRole) && !submitting) {
    if (!notAnAdmin) setNotAnAdmin(true);
  }

  return (
    <div className="min-h-screen bg-[#f4f7fc] dark:bg-[#131314] flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 mb-7">
          <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-slate-900 dark:text-white" aria-hidden>
            <circle cx="17.8" cy="5.4" r="2.5" fill="#c8e558" />
            <path d="M2.6 20.4l6.2-8.4 3.6 4.6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12.4 20.4l4.2-5.4 4.8 5.4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          </svg>
          <div>
            <div className="text-[15px] font-bold text-slate-900 dark:text-white leading-none">Sadhya</div>
            <div className="text-[10.5px] font-medium tracking-[0.08em] text-slate-400 dark:text-gray-500 mt-1 leading-none">
              ADMINISTRATION
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-6 shadow-sm">
          {notAnAdmin ? (
            <div>
              <h1 className="text-[17px] font-semibold text-slate-900 dark:text-white">Not an administrator</h1>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">
                You’re signed in as <span className="font-medium text-slate-700 dark:text-gray-200">{user?.email}</span>,
                but this account doesn’t hold an admin role.
              </p>
              <div className="mt-5 flex gap-2.5">
                <button
                  onClick={() => { setNotAnAdmin(false); void logout(); }}
                  className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                >
                  Use another account
                </button>
                <Link
                  to="/dashboard"
                  className="flex-1 rounded-xl bg-slate-900 dark:bg-white px-4 py-2.5 text-center text-[13px] font-semibold text-white dark:text-slate-900 hover:opacity-90 transition-opacity"
                >
                  My dashboard
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-[17px] font-semibold text-slate-900 dark:text-white">Administrator sign-in</h1>
              <p className="mt-1.5 text-[12.5px] text-slate-500 dark:text-gray-400">
                This area is restricted to platform administrators.
              </p>

              <form onSubmit={onSubmit} className="mt-5 space-y-3.5">
                <div>
                  <label htmlFor="admin-email" className="block text-[12px] font-medium text-slate-600 dark:text-gray-300 mb-1.5">
                    Email
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1d1d1f] px-3.5 py-2.5 text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-[#8FAE2B] focus:ring-2 focus:ring-[#c8e558]/30 transition"
                  />
                </div>
                <div>
                  <label htmlFor="admin-password" className="block text-[12px] font-medium text-slate-600 dark:text-gray-300 mb-1.5">
                    Password
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1d1d1f] px-3.5 py-2.5 text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-[#8FAE2B] focus:ring-2 focus:ring-[#c8e558]/30 transition"
                  />
                </div>

                {error && (
                  <p role="alert" className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-white px-4 py-2.5 text-[13.5px] font-semibold text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-slate-400 dark:text-gray-500">
          <ShieldCheck className="w-3.5 h-3.5 mt-px shrink-0" strokeWidth={1.9} />
          Administrative access is verified on the server and every action is recorded.
        </p>
      </div>
    </div>
  );
}
