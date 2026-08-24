/**
 * One-time cleanup: expire Pro entitlements that were granted by TEST-mode payments.
 *
 * Context. Payment documents did not record an `environment` until 2026-08-24, so a payment made
 * against `rzp_test_` keys wrote `plan: 'pro'` indistinguishably from a live one. Two accounts
 * hold production Pro that way. New orders are environment-stamped and cross-environment
 * application is refused, so this can only ever affect the pre-existing backlog.
 *
 * Design rules this script obeys:
 *   - Financial history is never deleted. Payment/order documents are only annotated.
 *   - An entitlement is expired ONLY when its origin is proven test-derived by asking Razorpay
 *     which account owns the order. Anything ambiguous is skipped and reported, never guessed.
 *   - Idempotent: re-running skips anything already marked.
 *   - It is a standalone script. It is deliberately NOT wired into payment processing — future
 *     entitlement correctness comes from the environment stamp, not from this cleanup.
 *
 * Usage:
 *   node scripts/expire-test-derived-pro.js            # dry run, writes nothing
 *   node scripts/expire-test-derived-pro.js --apply    # performs the migration
 */
const admin = require('firebase-admin');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');
const REASON = 'TEST_MODE_PAYMENT';

function authHeader(id, secret) {
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

/** Asks each Razorpay account whether it owns the order. 200 = owns it. */
async function classifyOrder(orderId) {
  const live = { id: process.env.RAZORPAY_LIVE_KEY_ID, secret: process.env.RAZORPAY_LIVE_KEY_SECRET };
  const cur = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
  const curMode = (cur.id || '').startsWith('rzp_live_') ? 'live' : 'test';

  const probes = [];
  if (cur.id && cur.secret) probes.push([curMode, cur]);
  if (live.id && live.secret && live.id !== cur.id) probes.push(['live', live]);

  const owners = [];
  for (const [mode, creds] of probes) {
    try {
      const r = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
        headers: { Authorization: authHeader(creds.id, creds.secret) },
      });
      if (r.status === 200) owners.push(mode);
    } catch { /* network issue -> treat as unknown below */ }
  }
  if (owners.includes('live')) return 'live';
  if (owners.includes('test')) return 'test';
  return 'unknown';
}

(async () => {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
  const db = admin.firestore();
  db.settings({ databaseId: 'default', ignoreUndefinedProperties: true });

  console.log(`\n=== expire-test-derived-pro  [${APPLY ? 'APPLY' : 'DRY RUN — nothing will be written'}] ===\n`);

  const pros = await db.collection('users').where('plan', '==', 'pro').get();
  console.log(`users with plan=pro: ${pros.size}\n`);

  const plan = [];
  for (const doc of pros.docs) {
    const u = doc.data();
    const sub = u.subscription || {};
    const orderId = sub.orderId || null;

    if (u.entitlementSource === 'test' && u.subscription?.status === 'expired') {
      plan.push({ uid: doc.id, orderId, action: 'SKIP', why: 'already expired by a previous run' });
      continue;
    }
    if (!orderId) {
      plan.push({ uid: doc.id, orderId: '(none)', action: 'SKIP', why: 'no order on subscription — origin cannot be established' });
      continue;
    }

    const orderSnap = await db.collection('payments').doc(orderId).get();
    if (!orderSnap.exists) {
      plan.push({ uid: doc.id, orderId, action: 'SKIP', why: 'order document missing — ownership ambiguous' });
      continue;
    }
    const o = orderSnap.data();

    if (o.userId && o.userId !== doc.id) {
      plan.push({ uid: doc.id, orderId, action: 'SKIP', why: `order belongs to ${o.userId} — ownership ambiguous` });
      continue;
    }

    const env = o.environment || await classifyOrder(orderId);
    const row = {
      uid: doc.id, orderId, paymentId: sub.paymentId || o.paymentId || '(none)',
      amount: sub.amountRupees ?? o.amountRupees, env,
      current: `${u.plan}/${sub.status || 'active'}`, paymentStatus: o.status,
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '(unknown)',
    };
    if (env === 'test') { row.action = 'EXPIRE'; row.next = 'free/expired'; row.why = REASON; }
    else if (env === 'live') { row.action = 'KEEP'; row.why = 'legitimate live payment'; }
    else { row.action = 'SKIP'; row.why = 'environment could not be determined confidently'; }
    plan.push(row);
  }

  for (const r of plan) {
    console.log(`  ${r.action.padEnd(6)} user=${r.uid}`);
    console.log(`         order=${r.orderId}  payment=${r.paymentId ?? '-'}  ₹${r.amount ?? '?'}  env=${r.env ?? '-'}`);
    console.log(`         current=${r.current ?? '-'} -> ${r.next ?? '(unchanged)'}   reason=${r.why}`);
  }

  const toExpire = plan.filter(r => r.action === 'EXPIRE');
  console.log(`\nsummary: ${toExpire.length} to expire, ${plan.filter(r => r.action === 'KEEP').length} kept, ${plan.filter(r => r.action === 'SKIP').length} skipped`);

  if (!APPLY) {
    console.log('\nDRY RUN — no writes performed. Re-run with --apply to execute.\n');
    return;
  }

  const now = Date.now();
  for (const r of toExpire) {
    // Annotate the payment record (history preserved, nothing deleted).
    await db.collection('payments').doc(r.orderId).set({
      environment: 'test',
      environmentVerifiedAt: now,
      note: 'Environment established retroactively from the Razorpay account that owns this order.',
    }, { merge: true });

    // Expire the entitlement, keeping the original subscription payload for audit.
    const userRef = db.collection('users').doc(r.uid);
    const snap = await userRef.get();
    const sub = (snap.data() || {}).subscription || {};
    await userRef.set({
      plan: 'free',
      entitlementSource: 'test',
      subscription: {
        ...sub,
        status: 'expired',
        expiredAt: now,
        expirationReason: REASON,
        expiredBy: 'expire-test-derived-pro migration',
      },
    }, { merge: true });
    console.log(`  expired user=${r.uid} order=${r.orderId}`);
  }
  console.log(`\napplied to ${toExpire.length} user(s). Payment history left intact.\n`);
})().catch(e => { console.error('MIGRATION ERROR:', e.message); process.exit(1); });
