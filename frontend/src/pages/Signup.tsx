import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github, GraduationCap, Presentation, ArrowLeft } from 'lucide-react';
import {
  auth,
  googleProvider,
  githubProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile,
  authErrorMessage,
} from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { identityApi, type ProductRole } from '../lib/api/identity';
import {
  AuthShell,
  Field,
  SubmitButton,
  ProviderButton,
  GoogleMark,
  AuthError,
  FlourishLink,
  RoleCard,
} from '../components/auth/AuthShell';

/**
 * Two-step signup, matching the reference: choose who you are, then create the account.
 *
 * The role is collected BEFORE authentication (it is only held in component state), but it
 * is never trusted as an assertion — after the Firebase account exists we call
 * POST /api/users/bootstrap, which derives identity from the verified token and refuses to
 * change a role that already exists. Selecting "teacher" here grants nothing on its own.
 */
export default function Signup() {
  const navigate = useNavigate();
  const { refreshClaims } = useAuth();

  const [step, setStep] = useState<'role' | 'details'>('role');
  const [role, setRole] = useState<ProductRole | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'email' | 'google' | 'github'>(null);

  /**
   * Runs once the Firebase account exists, for every signup path.
   *
   * Bootstrap failure is deliberately NOT fatal: the account has been created, and blocking
   * the user here would strand them with credentials they cannot use. They continue to
   * onboarding role-less, which is the same state every pre-Phase-1 account is already in
   * and which Phase 2's recovery path is designed to resolve.
   */
  const assignRoleAndContinue = async (chosen: ProductRole) => {
    try {
      await identityApi.bootstrap(chosen);
      // Custom claims only appear in a NEWLY MINTED token, so the refresh is mandatory —
      // without it the app keeps seeing the account as having no product role.
      await refreshClaims();
    } catch (err) {
      console.error('Role bootstrap failed; continuing without a product role.', err);
    }
    navigate('/onboarding', { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return setStep('role');
    if (!fullName.trim()) return setError('Please enter your full name.');
    if (!email.trim()) return setError('Please enter your email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');

    setError(null);
    setBusy('email');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // displayName is what the chat greeting and the sidebar avatar read, so set it
      // before the first render of the app shell.
      await updateProfile(cred.user, { displayName: fullName.trim() });
      await assignRoleAndContinue(role);
    } catch (err: any) {
      setError(authErrorMessage(err));
      setBusy(null);
    }
  };

  const handleProvider = async (which: 'google' | 'github') => {
    if (!role) return setStep('role');
    setError(null);
    setBusy(which);
    try {
      await signInWithPopup(auth, which === 'google' ? googleProvider : githubProvider);
      await assignRoleAndContinue(role);
    } catch (err: any) {
      setError(authErrorMessage(err));
      setBusy(null);
    }
  };

  // ── Step 1: who are you? ───────────────────────────────────────────────────
  if (step === 'role') {
    return (
      <AuthShell
        title="Create your account"
        subtitle="First — tell us how you'll be using Scholarly."
        footer={
          <>
            Already have an account? <FlourishLink to="/signin">Sign in</FlourishLink>
          </>
        }
      >
        <fieldset className="space-y-3">
          <legend className="sr-only">Choose your account type</legend>

          <RoleCard
            name="account-type"
            value="student"
            icon={GraduationCap}
            title="I'm a student"
            description="Learn with an AI tutor built around your exam and syllabus."
            selected={role === 'student'}
            onSelect={() => setRole('student')}
          />

          <RoleCard
            name="account-type"
            value="teacher"
            icon={Presentation}
            title="I'm a teacher"
            description="Create content and support your students alongside the AI."
            selected={role === 'teacher'}
            onSelect={() => setRole('teacher')}
          />
        </fieldset>

        <div className="mt-6">
          <SubmitButton type="button" onClick={() => setStep('details')} disabled={!role}>
            Continue
          </SubmitButton>
        </div>

        <p className="mt-4 text-[12px] leading-relaxed text-slate-400 dark:text-gray-600 text-center">
          You can't change this later without help from support, so pick the one that fits.
        </p>
      </AuthShell>
    );
  }

  // ── Step 2: account details ────────────────────────────────────────────────
  return (
    <AuthShell
      title="Create new account"
      subtitle={
        role === 'teacher'
          ? 'Set up your teacher account.'
          : 'Start learning with an AI tutor built around your exam.'
      }
      footer={
        <>
          Already have an account? <FlourishLink to="/signin">Sign in</FlourishLink>
        </>
      }
    >
      <button
        type="button"
        onClick={() => { setStep('role'); setError(null); }}
        disabled={!!busy}
        className="inline-flex items-center gap-1.5 mb-5 text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-60"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
        Signing up as {role === 'teacher' ? 'a teacher' : 'a student'} — change
      </button>

      <AuthError message={error} />

      <form onSubmit={handleSignUp} className="space-y-4">
        <Field
          label="Full Name"
          type="text"
          autoComplete="name"
          placeholder="Your name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={!!busy}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="example@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!!busy}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!!busy}
        />

        <div className="pt-1.5">
          <SubmitButton type="submit" loading={busy === 'email'}>
            Create Account
          </SubmitButton>
        </div>
      </form>

      <div className="mt-3 space-y-2.5">
        <ProviderButton onClick={() => handleProvider('google')} disabled={!!busy}>
          <GoogleMark />
          Sign up with Google
        </ProviderButton>
        <ProviderButton onClick={() => handleProvider('github')} disabled={!!busy}>
          <Github className="w-[18px] h-[18px]" strokeWidth={1.9} />
          Sign up with GitHub
        </ProviderButton>
      </div>

      <p className="mt-5 text-[12px] leading-relaxed text-slate-400 dark:text-gray-600 text-center">
        By creating an account you agree to our Terms of Service and Privacy Policy.
      </p>
    </AuthShell>
  );
}
