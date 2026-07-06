/**
 * Enables the Email/Password sign-in provider for the Firebase project via the
 * Identity Platform Admin API, using the service-account credential in .env.
 *
 * This is the minimal, reversible change required so the provisioned admin
 * account can sign in at the Admin Dashboard. It does not touch users or data.
 * Reverse it anytime in Firebase Console → Authentication → Sign-in method,
 * or by PATCHing signIn.email.enabled back to false.
 */
import { firebaseApp } from '../config/firebase';
import { env } from '../config/env';

async function main() {
  const projectId = env.FIREBASE_PROJECT_ID || (firebaseApp.options as any).projectId;
  const cred: any = (firebaseApp.options as any).credential;
  const { access_token } = await cred.getAccessToken();

  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ signIn: { email: { enabled: true, passwordRequired: true } } }),
  });

  const text = await res.text();
  console.log('HTTP', res.status);
  if (!res.ok) {
    console.error('Failed to update config:', text.slice(0, 800));
    process.exit(1);
  }
  try {
    const j = JSON.parse(text);
    console.log('signIn.email is now:', JSON.stringify(j?.signIn?.email));
  } catch {
    console.log(text.slice(0, 400));
  }
  console.log('Email/Password sign-in enabled.');
  process.exit(0);
}
main().catch((e) => { console.error('enable error:', e?.message || e); process.exit(1); });
