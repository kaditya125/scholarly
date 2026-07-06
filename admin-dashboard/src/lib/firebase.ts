import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, GithubAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC9zvzKpYi0gu_z3L1IAWSCfdMSzK3OhzM",
  authDomain: "schaolarly.firebaseapp.com",
  projectId: "schaolarly",
  storageBucket: "schaolarly.firebasestorage.app",
  messagingSenderId: "844355408660",
  appId: "1:844355408660:web:277f548e3e2ab818626801",
  measurementId: "G-P70H831WYT"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();

export { signInWithPopup, signOut, onAuthStateChanged };
