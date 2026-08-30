import React from "react";
import { useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { useProfile } from "../../hooks/api/useProfile";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, role, claimsLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const location = useLocation();

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

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
        <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-indigo-500 animate-spin" />
      </div>
    );
  }

  if (role === 'teacher') {
    return <>{children}</>;
  }

  // Routes that are part of the onboarding/assessment flow — always allow through
  // even when the profile is incomplete, to avoid redirect loops.
  const bypassRoutes = ['/onboarding', '/baseline-assessment', '/welcome', '/assessment', '/assessment/report', '/select-role', '/teacher/onboarding', '/verify-email'];
  const isBypassRoute = bypassRoutes.some((r) => location.pathname.startsWith(r));

  // Student-profile completeness is a STUDENT-ONLY gate.
  //
  // useProfile() fetches the *student* learning profile, so a teacher account never has one and
  // `isComplete` stays falsy for them permanently. Without the role check, every teacher would be
  // redirected into the student onboarding wizard on every non-bypass route — the bug this phase
  // fixes. Teachers reach their own destination via /teacher/onboarding.
  //
  // The profileLoading wait is scoped the same way on purpose: that query polls (refetchInterval)
  // and would never settle for a teacher, producing intermittent spinners on every route.
  if (!isBypassRoute && role === 'student') {
    // Wait for the profile to load before deciding whether to redirect
    if (profileLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
          <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-indigo-500 animate-spin" />
        </div>
      );
    }

    // Authenticated but profile not yet complete → start onboarding
    if (!profile?.isComplete && sessionStorage.getItem('onboarding_skipped') !== 'true') {
      return <Navigate to="/onboarding" replace />;
    }
  }

  return <>{children}</>;
}

export default ProtectedRoute;
