/**
 * READ-ONLY diagnostic: inspects which Firebase Auth sign-in providers are
 * enabled for the project, using the service-account credential already in .env.
 * Does NOT modify anything.
 */
import { firebaseApp } from '../config/firebase';
import { env } from '../config/env';

async function main() {
  const projectId = env.FIREBASE_PROJECT_ID || (firebaseApp.options as any).projectId;
  const cred: any = (firebaseApp.options as any).credential;
  const tokenObj = await cred.getAccessToken();
  const accessToken = tokenObj.access_token;

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  console.log('PROJECT:', projectId);
  console.log('HTTP', res.status);
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    console.log('signIn.email:', JSON.stringify(j?.signIn?.email));
    console.log('authorizedDomains:', JSON.stringify(j?.authorizedDomains));
  } catch {
    console.log(text.slice(0, 800));
  }
  process.exit(0);
}
main().catch((e) => { console.error('probe error:', e?.message || e); process.exit(1); });
