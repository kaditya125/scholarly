import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

/**
 * RoleLanding — resolves a single route to the correct experience for the caller's productRole.
 *
 * Why this exists: `productRole` was being read but never used to route, so every account landed
 * on the student surfaces. Putting the decision here — rather than in Signin/Signup/OAuth
 * handlers — means it applies equally to fresh sign-ins, deep links, and hard refreshes, which
 * the login-transition handlers never see.
 *
 * Ordering is the whole point:
 *
 *   claimsLoading → loading state   (custom claims arrive a beat AFTER `user` resolves)
 *   student       → render the element passed in (the EXISTING dashboard, not a copy)
 *   teacher       → render the element passed in
 *   null          → /select-role    (never assume a role; missing means "not yet established")
 *
 * The claimsLoading branch must come first. Branching on `role` while claims are still loading
 * would read `null` for everyone on first paint — a teacher would see the student dashboard
 * flash before being corrected, which is exactly the race this component exists to prevent.
 *
 * Renders elements rather than redirecting for the matched role, so the existing dashboard route
 * keeps its URL and no navigation round-trip is introduced. Reusable as-is once a real
 * TeacherDashboard exists: pass it as `teacher`.
 */
export default function RoleLanding({
  student,
  teacher,
}: {
  student: React.ReactNode;
  teacher: React.ReactNode;
}) {
  const { role, claimsLoading } = useAuth();

  if (claimsLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-indigo-500 animate-spin" />
        <p className="text-sm text-slate-500 dark:text-gray-400">Resolving your account…</p>
      </div>
    );
  }

  if (role === 'student') return <>{student}</>;
  if (role === 'teacher') return <>{teacher}</>;

  // No product role. ProtectedRoute normally catches this first; this is defence in depth for
  // any future caller that mounts RoleLanding outside that guard.
  return <Navigate to="/select-role" replace />;
}
