/**
 * Gate for every /admin route.
 *
 * ─── WHAT THIS IS AND IS NOT ─────────────────────────────────────────────────────────
 * This is a ROUTING convenience, not a security boundary. It reads the admin role from
 * the Firebase ID token's custom claims via useAuth(), which lives in browser memory and
 * can be edited in devtools. Anyone determined enough can render these screens.
 *
 * That is acceptable, and deliberate, because the screens are empty without data: every
 * admin endpoint independently verifies the caller's token signature and role claim
 * server-side (requireRoles / requireAdmin in the backend's rbac.middleware). A forged
 * client role produces an admin-shaped shell whose every request returns 403.
 *
 * So: never move an authorisation decision into this file. If a rule matters, it belongs
 * on the endpoint (§32).
 *
 * ─── WHY NOT ProtectedRoute ──────────────────────────────────────────────────────────
 * ProtectedRoute sends unauthenticated users to /signin, runs the student policy-consent
 * modal and the email-verification gate, and loads the student profile. None of that
 * belongs in an admin session, and the redirect would drop an admin into the student
 * sign-in flow — which §30 explicitly rules out. Admins go to /admin/login instead.
 */
import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../lib/AuthContext';
import { canEnterAdminArea } from './adminRoles';

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, loading, adminRole, claimsLoading } = useAuth();
  const location = useLocation();

  // Wait for BOTH the session and the claims. Rendering on `user` alone would flash the
  // "not authorised" screen at a legitimate admin for as long as the claims take to
  // resolve, because adminRole is still null at that point.
  if (loading || claimsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7fc] dark:bg-[#131314]">
        <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-[#8FAE2B] animate-spin" />
      </div>
    );
  }

  // No session at all → the admin entry point, never the student one.
  if (!user) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  /**
   * Signed in, but not an admin.
   *
   * Deliberately NOT redirected to /admin/login: they are already authenticated, so a
   * login page would be a confusing dead end. Deliberately NOT 404'd either — the
   * account is known and the honest answer is that it lacks the role. There is nothing
   * to conceal from someone already holding a valid session, and the admin URL is not
   * the secret; the role is (§30: no security through obscurity).
   */
  if (!canEnterAdminArea(adminRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7fc] dark:bg-[#131314] px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-[19px] font-semibold text-slate-900 dark:text-white">
            You don’t have access to this area
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400">
            This account is signed in, but it isn’t an administrator. If you reached this by
            mistake, head back to your dashboard.
          </p>
          <a
            href="/dashboard"
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-slate-900 dark:bg-white px-4 py-2.5 text-[13.5px] font-semibold text-white dark:text-slate-900 hover:opacity-90 transition-opacity"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
