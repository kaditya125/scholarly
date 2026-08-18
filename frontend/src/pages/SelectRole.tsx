import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Presentation } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { identityApi, type ProductRole } from '../lib/api/identity';
import { AuthShell, SubmitButton, AuthError, RoleCard } from '../components/auth/AuthShell';

/**
 * /select-role — recovery path for an authenticated account that has no productRole.
 *
 * Reached by: interrupted registration, accounts created before the role foundation
 * existed, manually created Firebase users, or a bootstrap call that failed after the
 * Firebase account was created.
 *
 * Deliberately NOT a place where a role is assumed. The architecture decision is that a
 * missing productRole means "not yet established", never "probably a student" — guessing
 * here would silently mint students out of teachers.
 *
 * Wiring (Phase 6, not done here — this file is additive only):
 *   1. App.tsx: <Route path="/select-role" element={<SelectRole />} />  (inside
 *      ProtectedRoute's authenticated area, or as a bypass route alongside /onboarding).
 *   2. ProtectedRoute: after the !user check and once claimsLoading === false,
 *      if (!role) return <Navigate to="/select-role" replace />;
 *   3. Add '/select-role' to ProtectedRoute's bypass list so it cannot redirect to itself.
 */
export default function SelectRole() {
  const navigate = useNavigate();
  const { user, role, refreshClaims } = useAuth();

  const [selected, setSelected] = useState<ProductRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already resolved (e.g. a second tab finished bootstrap, or the token just refreshed) —
  // don't offer a choice that the backend would reject with 409.
  if (role) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  const handleConfirm = async () => {
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      await identityApi.bootstrap(selected);
      // Custom claims only exist in a newly minted token — without this the app keeps
      // seeing the account as role-less and would bounce straight back here.
      await refreshClaims();
      navigate('/onboarding', { replace: true });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        // The account already has a role; the local token is simply stale.
        await refreshClaims();
        navigate('/dashboard', { replace: true });
        return;
      }
      setError(
        err?.response?.data?.error || 'Could not set up your account. Please try again.'
      );
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="One quick thing"
      subtitle={
        user?.displayName
          ? `Welcome back, ${user.displayName.split(' ')[0]} — tell us how you use Sadhya.`
          : 'Tell us how you use Sadhya so we can set things up correctly.'
      }
      footer={
        <span className="text-slate-400 dark:text-gray-600">
          Signed in as {user?.email || 'your account'}
        </span>
      }
    >
      <AuthError message={error} />

      <fieldset className="space-y-3" disabled={busy}>
        <legend className="sr-only">Choose your account type</legend>

        <RoleCard
          name="select-role"
          value="student"
          icon={GraduationCap}
          title="I'm a student"
          description="Learn with an AI tutor built around your exam and syllabus."
          selected={selected === 'student'}
          onSelect={() => setSelected('student')}
        />

        <RoleCard
          name="select-role"
          value="teacher"
          icon={Presentation}
          title="I'm a teacher"
          description="Create content and support your students alongside the AI."
          selected={selected === 'teacher'}
          onSelect={() => setSelected('teacher')}
        />
      </fieldset>

      <div className="mt-6">
        <SubmitButton onClick={handleConfirm} disabled={!selected} loading={busy}>
          Continue
        </SubmitButton>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-slate-400 dark:text-gray-600 text-center">
        You can't change this later without help from support, so pick the one that fits.
      </p>
    </AuthShell>
  );
}
