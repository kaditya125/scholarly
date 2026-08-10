import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github } from 'lucide-react';
import {
  auth,
  googleProvider,
  githubProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile,
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

export default function Signup() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'email' | 'google' | 'github'>(null);

  /**
   * Real account creation. The previous version's form only called preventDefault(), so
   * no account was ever created from this page — only the OAuth buttons worked.
   *
   * New accounts go to /onboarding rather than /dashboard: ProtectedRoute would redirect
   * there anyway (profile.isComplete is false), and routing straight there avoids a
   * visible bounce through the dashboard.
   */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
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
      navigate('/onboarding', { replace: true });
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleProvider = async (which: 'google' | 'github') => {
    setError(null);
    setBusy(which);
    try {
      await signInWithPopup(auth, which === 'google' ? googleProvider : githubProvider);
      navigate('/onboarding', { replace: true });
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthShell
      title="Create new account"
      subtitle="Start learning with an AI tutor built around your exam."
      footer={
        <>
          Already have an account?{' '}
          <FlourishLink to="/signin">Sign in</FlourishLink>
        </>
      }
    >
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
