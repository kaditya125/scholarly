import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  // Email/password auth was never wired up: Signin's submit button was a
  // <Link to="/dashboard"> and Signup's form only called preventDefault(), so the
  // email fields on both pages were decorative. These are what make them real.
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();

export {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
};

/**
 * Firebase returns machine-readable codes ("auth/invalid-credential"). Surfacing those
 * raw — which both auth pages used to do via `err.message` — shows the student a string
 * like "Firebase: Error (auth/invalid-credential)." Map the ones users actually hit.
 */
export function authErrorMessage(err: any): string {
  const code = String(err?.code || '');
  switch (code) {
    case 'auth/invalid-email':          return 'That email address doesn’t look right.';
    case 'auth/user-disabled':          return 'This account has been disabled. Contact support.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':     return 'Incorrect email or password.';
    case 'auth/email-already-in-use':   return 'An account already exists with this email. Try signing in.';
    case 'auth/weak-password':          return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/popup-closed-by-user':   return 'Sign-in window was closed before finishing.';
    case 'auth/popup-blocked':          return 'Your browser blocked the sign-in popup. Allow popups and retry.';
    case 'auth/network-request-failed': return 'Network error. Check your connection and try again.';
    default:                            return err?.message || 'Something went wrong. Please try again.';
  }
}
