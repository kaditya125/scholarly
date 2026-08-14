import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Github } from 'lucide-react';
import {
  auth,
  googleProvider,
  githubProvider,
  signInWithPopup,
  getAdditionalUserInfo,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  authErrorMessage,
} from '../lib/firebase';
import {
  AuthShell,
  Field,
  SubmitButton,
  ProviderButton,
  GoogleMark,
  AuthError,
  FlourishLink,
} from '../components/auth/AuthShell';

export default function Signin() {
  const navigate = useNavigate();
  const location = useLocation() as any;
  // ProtectedRoute stores the page the student was trying to reach, so a session that
  // expired mid-task returns there instead of dumping them on the dashboard.
  const from = location.state?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'email' | 'google' | 'github' | 'reset'>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Real email/password sign-in. This page previously rendered the fields with no state
   * and made the submit button a <Link to="/dashboard">, so email sign-in never worked —
   * clicking it just bounced off ProtectedRoute and back here.
   */
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    setError(null);
    setBusy('email');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleProvider = async (which: 'google' | 'github') => {
    setError(null);
    setNotice(null);
    setBusy(which);
    try {
      const result = await signInWithPopup(auth, which === 'google' ? googleProvider : githubProvider);
      // This page is written for RETURNING users, but the provider popup creates the
      // Firebase account on the spot if none exists — there is no way to ask "student or
      // teacher?" before that happens the way /signup does. getAdditionalUserInfo() is the
      // one place Firebase actually tells us the account is brand new, so we use it to send
      // a first-time visitor straight to role selection instead of bouncing them through
      // `from` (usually /dashboard) only for ProtectedRoute to redirect them a beat later —
      // same destination, one less flash of the wrong page.
      const isNewAccount = getAdditionalUserInfo(result)?.isNewUser ?? false;
      navigate(isNewAccount ? '/select-role' : from, { replace: true });
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Enter your email address first, then choose “Forgot password”.');
      return;
    }
    setError(null);
    setBusy('reset');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice(`Password reset link sent to ${email.trim()}.`);
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Welcome back! Please enter your details."
      footer={
        <>
          Don’t have an account?{' '}
          <FlourishLink to="/signup">Sign up for free</FlourishLink>
        </>
      }
    >
      <AuthError message={error} />
      {notice && (
        <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-[13px] text-emerald-700 dark:text-emerald-400">
          {notice}
        </div>
      )}

      <form onSubmit={handleEmailSignIn} className="space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!!busy}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!!busy}
        />

        <div className="flex items-center justify-between pt-0.5">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 dark:border-white/20 text-indigo-600 focus:ring-indigo-500/30 focus:ring-2"
            />
            <span className="text-[13px] text-slate-600 dark:text-gray-400">Remember for 30 days</span>
          </label>
          <button
            type="button"
            onClick={handleReset}
            disabled={!!busy}
            className="text-[13px] font-medium text-slate-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-60"
          >
            Forgot password
          </button>
        </div>

        <div className="pt-1.5">
          <SubmitButton type="submit" loading={busy === 'email'}>
            Sign in
          </SubmitButton>
        </div>
      </form>

      <div className="mt-3 space-y-2.5">
        <ProviderButton onClick={() => handleProvider('google')} disabled={!!busy}>
          <GoogleMark />
          Sign in with Google
        </ProviderButton>
        <ProviderButton onClick={() => handleProvider('github')} disabled={!!busy}>
          <Github className="w-[18px] h-[18px]" strokeWidth={1.9} />
          Sign in with GitHub
        </ProviderButton>
      </div>
    </AuthShell>
  );
}
