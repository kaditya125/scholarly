import { firebaseApp } from './src/config/firebase';

/**
 * Real gRPC health check for Firestore.
 *
 * A TCP probe (Test-NetConnection) only proves the socket opens — it does NOT prove the
 * gRPC/HTTP2 stream can establish (VPNs / DPI firewalls often allow TCP but block gRPC).
 * This performs a tiny actual Firestore read with a hard deadline:
 *   - fast success  => gRPC path healthy, the backfill can run.
 *   - timeout/error => gRPC path blocked (the "14 UNAVAILABLE: No connection established" case).
 */
async function main() {
  const DEADLINE_MS = 15000;
  const t0 = Date.now();
  const db = firebaseApp.firestore();

  const read = db.collection('notebooks').limit(1).get();
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`timed out after ${DEADLINE_MS}ms`)), DEADLINE_MS),
  );

  try {
    const snap: any = await Promise.race([read, timeout]);
    console.log(`\n[Firestore gRPC] OK — read ${snap.size} doc in ${Date.now() - t0}ms. Connection healthy.\n`);
    process.exit(0);
  } catch (e: any) {
    console.error(`\n[Firestore gRPC] FAILED after ${Date.now() - t0}ms: ${e?.message || e}`);
    console.error('  => gRPC path to Firestore is blocked/degraded (not a code issue).');
    console.error('  => Try: disable VPN/proxy, or switch networks (phone hotspot), then re-run.\n');
    process.exit(1);
  }
}

main();
