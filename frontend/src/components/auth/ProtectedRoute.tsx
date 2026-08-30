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

  return (
    <>
      {children}
      {/* Policy Consent Gate Modal — Appears whenever active policy requires review and not yet accepted */}
      {requiresReview && !dismissModalForSession && (
        <FirstTimeConsentModal
          isOpen={true}
          isUpdate={!!consentStatus?.lastAcceptedVersion}
          lastAcceptedVersion={consentStatus?.lastAcceptedVersion}
          onConsentAccepted={() => {
            setDismissModalForSession(true);
            refetchConsent();
          }}
        />
      )}
    </>
  );
}

export default ProtectedRoute;

