import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, RefreshCw, LogOut, CheckCircle2 } from 'lucide-react';
import {
  auth,
  sendEmailVerification,
  reload,
  signOut,
  authErrorMessage,
} from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api/client';
import { identityApi, type ProductRole } from '../lib/api/identity';
import {
  AuthShell,
  SubmitButton,
  AuthError,
} from '../components/auth/AuthShell';

function maskEmail(rawEmail?: string | null): string {
  if (!rawEmail) return 'your email';
  const parts = rawEmail.split('@');
  if (parts.length !== 2) return rawEmail;
  const [name, domain] = parts;
  if (name.length <= 2) {
    return `${name[0] || '*'}*@${domain}`;
  }
  const maskedName = `${name.slice(0, 2)}${'*'.repeat(Math.min(4, name.length - 2))}${name.slice(-1)}`;
  return `${maskedName}@${domain}`;
}

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshUser, refreshClaims, loading: authLoading } = useAuth();

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Retrieve stashed signup details (role and referral code)
  const savedRole = (sessionStorage.getItem('pending_role') as ProductRole) || 'student';
  const savedRef = sessionStorage.getItem('pending_ref');

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleFinishVerification = useCallback(
    async (roleToAssign: ProductRole) => {
      try {
        if (auth.currentUser) {
          await reload(auth.currentUser).catch(() => {});
          await auth.currentUser.getIdToken(true).catch(() => {});
        }
        await identityApi.bootstrap(roleToAssign, savedRef);
        await refreshClaims();
      } catch (err: any) {
        // If already bootstrapped (409) or warning, continue
        console.warn('[VerifyEmail] Bootstrap status:', err);
      }
      sessionStorage.removeItem('pending_role');
      sessionStorage.removeItem('pending_ref');
      navigate(roleToAssign === 'teacher' ? '/teacher/onboarding' : '/onboarding', { replace: true });
    },
    [navigate, refreshClaims, savedRef]
  );

  // If user is already verified when arriving, automatically continue to onboarding
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/signin', { replace: true });
      return;
    }

    if (user.emailVerified) {
      void handleFinishVerification(savedRole);
    }
  }, [user, authLoading, navigate, savedRole, handleFinishVerification]);

  // Primary Check: "I've verified my email"
  const handleCheckVerified = async () => {
    if (!auth.currentUser) return;
    setError(null);
    setNotice(null);
    setChecking(true);

    try {
      // Force reload the user's token and state from Firebase Auth servers
      await reload(auth.currentUser);
      refreshUser();

      if (auth.currentUser.emailVerified) {
        setNotice('Email verified successfully! Setting up your workspace...');
        await handleFinishVerification(savedRole);
      } else {
        setError("Your email hasn't been verified yet. Please check your inbox, click the verification link, and click below to continue.");
      }
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  // Secondary Action: Resend verification email via ZeptoMail
  const handleResend = async () => {
    if (!auth.currentUser || cooldown > 0 || resending) return;
    setError(null);
    setNotice(null);
    setResending(true);

    try {
      // First try Sadhya backend ZeptoMail delivery
      try {
        const token = await auth.currentUser.getIdToken();
        const { data } = await api.post('/auth/send-verification-email', {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setNotice(data.message || `Verification link sent again to ${auth.currentUser.email}. Please check your inbox.`);
      } catch (backendErr) {
        // Fallback to client SDK if backend is unreachable
        await sendEmailVerification(auth.currentUser);
        setNotice(`Verification link sent again to ${auth.currentUser.email}. Please check your inbox and spam folder.`);
      }
      setCooldown(60);
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  // Switch account / Sign out
  const handleSignOut = async () => {
    sessionStorage.removeItem('pending_role');
    sessionStorage.removeItem('pending_ref');
    await signOut(auth);
    navigate('/signup', { replace: true });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
        <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-[#c8e558] animate-spin" />
      </div>
    );
  }

  const userEmail = user?.email || (location.state as { email?: string } | null)?.email;

  return (
    <AuthShell
      title="Verify your email"
      subtitle="One quick step to activate your account."
      footer={
        <div className="flex items-center justify-between w-full text-[13px]">
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Use a different email
          </button>

          <button
            type="button"
            onClick={() => navigate('/signin')}
            className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
          >
            Back to login
          </button>
        </div>
      }
    >
      <AuthError message={error} />

      {notice && (
        <div className="mb-5 p-3.5 rounded-xl bg-[#c8e558]/10 border border-[#c8e558]/30 flex items-start gap-2.5 text-[13px] text-slate-800 dark:text-gray-200">
          <CheckCircle2 className="w-4 h-4 text-[#728c1c] dark:text-[#c8e558] shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      <div className="text-center py-4 space-y-3">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-[#c8e558]/15 border border-[#c8e558]/30 flex items-center justify-center text-slate-900 dark:text-[#c8e558]">
          <Mail className="w-6 h-6" />
        </div>

        <p className="text-[14px] text-slate-600 dark:text-gray-300">
          We&rsquo;ve sent a verification link to:
        </p>
        <p className="text-[15px] font-semibold text-slate-900 dark:text-white font-mono bg-slate-100 dark:bg-white/[0.05] py-1.5 px-3 rounded-lg inline-block border border-slate-200 dark:border-white/10">
          {userEmail ? maskEmail(userEmail) : 'your email address'}
        </p>

        <p className="text-[13px] text-slate-500 dark:text-gray-400 pt-1 max-w-[22rem] mx-auto leading-relaxed">
          Please check your inbox (and spam/junk folder) and click the link to confirm your email.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        <SubmitButton
          loading={checking}
          onClick={handleCheckVerified}
        >
          {checking ? 'Checking verification status...' : "I've verified my email"}
        </SubmitButton>

        <button
          type="button"
          disabled={cooldown > 0 || resending}
          onClick={handleResend}
          className="w-full h-11 rounded-xl border border-slate-200 dark:border-white/10 text-[13.5px] font-medium text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/[0.04] active:bg-slate-100 dark:active:bg-white/[0.07] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
          {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend verification email'}
        </button>
      </div>
    </AuthShell>
  );
}
