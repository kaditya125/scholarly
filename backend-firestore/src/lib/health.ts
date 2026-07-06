import { db } from '../config/firebase';

/** Rejects if the promise does not settle within `ms` milliseconds. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** Lightweight Firestore connectivity probe used by the readiness endpoint. */
export async function checkFirestore(timeoutMs = 3000): Promise<boolean> {
  try {
    await withTimeout(db.collection('_health').doc('readiness').get(), timeoutMs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Aggregate readiness check for the /health/ready endpoint. Firestore is the only
 * hard dependency required to serve the majority of requests, so it gates readiness.
 * (Pinecone/LLM failures degrade specific features but should not fail the whole pod.)
 */
export async function checkReadiness(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
  const firestore = await checkFirestore();
  return { ready: firestore, checks: { firestore } };
}
