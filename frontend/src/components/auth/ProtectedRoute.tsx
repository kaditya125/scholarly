import React, { useState } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { useProfile } from "../../hooks/api/useProfile";
import { usePolicyConsent } from "../../lib/hooks/usePolicyConsent";
import FirstTimeConsentModal from "../policies/FirstTimeConsentModal";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, role, claimsLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const location = useLocation();

  const {
    consentStatus,
    isLoading: consentLoading,
    isError: consentCheckFailed,
    requiresReview,
    refetch: refetchConsent,
  } = usePolicyConsent(!!user);

  const [dismissModalForSession, setDismissModalForSession] = useState(false);

  // Show nothing while auth initialises — prevents flash of /signin redirect
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
        <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-indigo-500 animate-spin" />
      </div>
    );
  }

  // Not logged in → go to sign-in, preserving the intended destination
  if (!user) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  // Mandatory Email Verification Gate for Email/Password accounts
  const isGoogleAccount = user.providerData?.some((p) => p.providerId === 'google.com');
  const isPasswordAccount = user.providerData?.some((p) => p.providerId === 'password') || (!user.providerData?.length && !!user.email);
  const isUnverifiedEmail = !user.emailVerified && isPasswordAccount && !isGoogleAccount;

  if (isUnverifiedEmail) {
    if (location.pathname !== '/verify-email') {
      return <Navigate to="/verify-email" replace />;
    }
  }

  /*
   * ── Policy consent gate ──────────────────────────────────────────────────────────────
   *
   * Deliberately ABOVE the role and profile gates. Someone signing up for the first time
   * should agree to the terms and then be walked through onboarding, not be walked through
   * onboarding and shown the agreement somewhere along the way.
   *
   * It also replaces the app rather than sitting on top of it. Previously this rendered as
   * `{children}` plus an overlay, which had three consequences:
   *
   *   · `requiresReview` is `data?.requiresReview ?? false`, so while the status request was
   *     in flight it read false and the dashboard rendered. The gate appeared afterwards, on
   *     top of an app the person had already seen.
   *   · the app stayed mounted behind the gate for the whole time it was open — fetching,
   *     running effects, and reachable by keyboard, since an opaque overlay is not a focus trap.
   *   · it failed open. If /policies/my-consent errored, `data` stayed undefined,
   *     `requiresReview` stayed false, and an account that had never accepted anything walked
   *     straight through.
   *
   * The third one still fails open, but now it does so knowingly and says so — see below.
   */
  // /verify-email is exempt. An unverified account is redirected there by the block above, and
  // replacing that page with the consent gate would hide the resend control — leaving someone
  // who accepts the terms right back on a page they still cannot act on. Verification first.
  const isVerificationFlow = location.pathname.startsWith('/verify-email');

  if (!isVerificationFlow && consentLoading && !dismissModalForSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0b0b0c]">
        <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-[#c8e558] animate-spin" />
      </div>
    );
  }

  if (!isVerificationFlow && requiresReview && !dismissModalForSession) {
    return (
      <FirstTimeConsentModal
        isOpen
        isUpdate={!!consentStatus?.lastAcceptedVersion}
        lastAcceptedVersion={consentStatus?.lastAcceptedVersion}
        onConsentAccepted={() => {
          setDismissModalForSession(true);
          refetchConsent();
        }}
      />
    );
  }

  if (consentCheckFailed) {
    // Chosen deliberately: a transient failure on this one endpoint should not brick the whole
    // product for someone who has already accepted. The cost is that an unconsented account can
    // slip through while the endpoint is down — recorded here rather than hidden, because the
    // alternative is a lockout no user can clear.
    console.warn('[consent] status check failed; proceeding without the gate this session.');
  }

  // Role Gate
  if (!claimsLoading && !role) {
    const roleSetupAllowedPaths = [
      '/select-role',
      '/onboarding',
      '/baseline-assessment',
      '/welcome',
      '/teacher-onboarding',
      '/policies',
    ];
    const isAllowed = roleSetupAllowedPaths.some((p) => location.pathname.startsWith(p));
    if (!isAllowed) {
      return <Navigate to="/select-role" replace />;
    }
  }

  // Workspace routing
  if (role === 'teacher') {
    const studentOnlyPaths = ['/dashboard', '/baseline-assessment', '/welcome'];
    const isStudentOnly = studentOnlyPaths.some((p) => location.pathname.startsWith(p));
    if (isStudentOnly) {
      return <Navigate to="/teach" replace />;
    }
  }

  // Routes that are part of the onboarding/assessment/policy flow — always allow through
  const bypassRoutes = [
    '/onboarding',
    '/baseline-assessment',
    '/welcome',
    '/assessment',
    '/assessment/report',
    '/select-role',
    '/teacher/onboarding',
    '/verify-email',
    '/policies',
  ];
  const isBypassRoute = bypassRoutes.some((r) => location.pathname.startsWith(r));

  // Student-profile completeness is a STUDENT-ONLY gate.
  if (!isBypassRoute && role === 'student') {
    if (profileLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
          <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-indigo-500 animate-spin" />
        </div>
      );
    }

    if (!profile?.isComplete && sessionStorage.getItem('onboarding_skipped') !== 'true') {
      return <Navigate to="/onboarding" replace />;
    }
  }

  // Consent has been dealt with above, so this is just the app.
  return <>{children}</>;
}

export default ProtectedRoute;

