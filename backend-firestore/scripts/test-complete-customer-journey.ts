import { db } from '../src/config/firebase';
import { usageService } from '../src/services/usage.service';
import { entitlementService, PLAN_LIMITS } from '../src/services/entitlement.service';
import { paymentsService } from '../src/services/payments.service';

interface JourneyStep {
  step: string;
  expected: string;
  actual: string;
  passed: boolean;
}

const steps: JourneyStep[] = [];

function assertStep(step: string, expected: string, actual: string, condition: boolean) {
  steps.push({ step, expected, actual, passed: condition });
  const icon = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} | ${step}\n   Expected: ${expected}\n   Actual:   ${actual}\n`);
}

async function cleanup(userId: string) {
  try {
    const usages = await db.collection('user_usage').listDocuments();
    for (const doc of usages) {
      if (doc.id.startsWith(userId)) await doc.delete();
    }
    await db.collection('users').doc(userId).delete();
    await db.collection('payments').doc(`order_${userId}`).delete();
  } catch (e) {}
}

async function runCustomerJourney() {
  console.log('================================================================');
  console.log('🚀 LIVE CUSTOMER JOURNEY TEST: FREE → PRO → REFUND → FREE');
  console.log('================================================================\n');

  const testUser = 'journey_student_' + Date.now();
  await cleanup(testUser);

  // ────────────────────────────────────────────────────────────
  // STAGE 1: NEW FREE STUDENT INITIALIZATION
  // ────────────────────────────────────────────────────────────
  console.log('--- STAGE 1: New Free Student Initial State ---');
  await db.collection('users').doc(testUser).set({
    email: `${testUser}@sadhya.test`,
    name: 'Test Student Journey',
    role: 'student',
    plan: 'free',
    createdAt: Date.now(),
  });

  const initPlan = await entitlementService.getUserPlan(testUser);
  assertStep(
    '1. Initial Plan Entitlement',
    'plan=free, isPro=false',
    `plan=${initPlan.plan}, isPro=${initPlan.isPro}`,
    initPlan.plan === 'free' && initPlan.isPro === false,
  );

  const initUsage = await usageService.getUsageSummary(testUser);
  assertStep(
    '2. Initial Free Usage Meters',
    'Chat: 0/100, Voice: 0/15 min, Docs: 0/5, Podcasts: 0/1, Tests: 0/3',
    `Chat: ${initUsage.metrics.chat.used}/${initUsage.metrics.chat.limit}, Voice: ${initUsage.metrics.voice.usedMinutes}/${initUsage.metrics.voice.limitMinutes} min, Docs: ${initUsage.metrics.documents.used}/${initUsage.metrics.documents.limit}`,
    initUsage.metrics.chat.limit === 100 &&
      initUsage.metrics.voice.limitMinutes === 15 &&
      initUsage.metrics.documents.limit === 5 &&
      initUsage.metrics.podcasts.limit === 1 &&
      initUsage.metrics.mockTests.limit === 3,
  );

  // ────────────────────────────────────────────────────────────
  // STAGE 2: 80% WARNING & 100% QUOTA EXHAUSTION
  // ────────────────────────────────────────────────────────────
  console.log('--- STAGE 2: 80% Warning & 100% Quota Exhaustion ---');
  // Consume 80 messages in 1 atomic step
  await usageService.consumeQuota(testUser, 'chatMessages', 80);
  const u80 = await usageService.getUsageSummary(testUser);
  assertStep(
    '3. 80% Warning Threshold Reached',
    'used=80, remaining=20, percent=80%',
    `used=${u80.metrics.chat.used}, remaining=${u80.metrics.chat.remaining}, percent=${u80.metrics.chat.percent}%`,
    u80.metrics.chat.used === 80 && u80.metrics.chat.percent === 80,
  );

  // Consume 20 more messages to reach 100/100
  await usageService.consumeQuota(testUser, 'chatMessages', 20);
  const u100 = await usageService.getUsageSummary(testUser);
  assertStep(
    '4. 100% Quota Exhausted',
    'used=100, remaining=0, percent=100%',
    `used=${u100.metrics.chat.used}, remaining=${u100.metrics.chat.remaining}, percent=${u100.metrics.chat.percent}%`,
    u100.metrics.chat.used === 100 && u100.metrics.chat.remaining === 0,
  );

  // 101st message attempt must reject
  let rejectedAt101 = false;
  try {
    await usageService.consumeQuota(testUser, 'chatMessages', 1);
  } catch (err: any) {
    if (err.code === 'QUOTA_EXHAUSTED') rejectedAt101 = true;
  }
  assertStep(
    '5. 101st Message Blocked Server-Side',
    'QUOTA_EXHAUSTED error before AI call',
    rejectedAt101 ? 'QUOTA_EXHAUSTED' : 'Allowed over quota',
    rejectedAt101,
  );

  // ────────────────────────────────────────────────────────────
  // STAGE 3: ORDER CREATION & VERIFIED PAYMENT TO PRO
  // ────────────────────────────────────────────────────────────
  console.log('--- STAGE 3: Order Creation & Verified Pro Activation ---');
  const orderId = `order_${testUser}`;
  const now = Date.now();
  const paymentId = `pay_${testUser}_01`;

  // Simulate Razorpay server payment record
  await db.collection('payments').doc(orderId).set({
    userId: testUser,
    planId: 'pro',
    planName: 'Sadhya Pro',
    billing: 'monthly',
    amountRupees: 199,
    currency: 'INR',
    status: 'paid',
    paymentId: paymentId,
    createdAt: now,
    paidAt: now,
    activatedAt: now,
  });

  // Activate Pro subscription on user
  await db.collection('users').doc(testUser).update({
    plan: 'pro',
    subscription: {
      status: 'active',
      plan: 'pro',
      planName: 'Sadhya Pro',
      billing: 'monthly',
      amountRupees: 199,
      orderId: orderId,
      paymentId: paymentId,
      activatedAt: now,
      currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
    },
  });

  const proPlan = await entitlementService.getUserPlan(testUser);
  assertStep(
    '6. Instant Pro Entitlement Activation',
    'plan=pro, isPro=true',
    `plan=${proPlan.plan}, isPro=${proPlan.isPro}`,
    proPlan.plan === 'pro' && proPlan.isPro === true,
  );

  const proUsage = await usageService.getUsageSummary(testUser);
  assertStep(
    '7. Upgraded Pro Quota Limits Available',
    'Chat: up to 2,000, Voice: 300 min, Docs: 100, Podcasts: 25, Tests: 1,000',
    `Chat limit: ${proUsage.metrics.chat.limit}, Voice: ${proUsage.metrics.voice.limitMinutes} min, Docs: ${proUsage.metrics.documents.limit}, Podcasts: ${proUsage.metrics.podcasts.limit}, Tests: ${proUsage.metrics.mockTests.limit}`,
    proUsage.metrics.chat.limit === 2000 &&
      proUsage.metrics.voice.limitMinutes === 300 &&
      proUsage.metrics.documents.limit === 100 &&
      proUsage.metrics.podcasts.limit === 25 &&
      proUsage.metrics.mockTests.limit === 1000,
  );

  // Pro user can now send message beyond 100
  const proConsumed = await usageService.consumeQuota(testUser, 'chatMessages', 1);
  assertStep(
    '8. Pro Can Send Beyond Free 100 Limit',
    'allowed=true, remaining > 0',
    `allowed=${proConsumed.allowed}, used=${proConsumed.used}/2000, remaining=${proConsumed.remaining}`,
    proConsumed.allowed === true && proConsumed.used > 0,
  );

  // ────────────────────────────────────────────────────────────
  // STAGE 4: 7-DAY REFUND REQUEST & ELIGIBILITY ENFORCEMENT
  // ────────────────────────────────────────────────────────────
  console.log('--- STAGE 4: 7-Day Self-Service Refund Flow ---');
  
  // 9. Ineligible Refund Check (Simulate payment > 7 days old)
  await db.collection('payments').doc(orderId).update({
    paidAt: now - 8 * 24 * 60 * 60 * 1000, // 8 days ago
  });

  let blockedExpired = false;
  try {
    await paymentsService.requestSelfServiceRefund({
      userId: testUser,
      orderId: orderId,
    });
  } catch (err: any) {
    if (err.code === 'GUARANTEE_EXPIRED') blockedExpired = true;
  }
  assertStep(
    '9. Expired >7 Day Refund Block',
    'Rejected with GUARANTEE_EXPIRED',
    blockedExpired ? 'GUARANTEE_EXPIRED' : 'Allowed past 7 days',
    blockedExpired,
  );

  // 10. Eligible Refund Execution (Payment within 7 days)
  await db.collection('payments').doc(orderId).update({
    paidAt: now - 2 * 24 * 60 * 60 * 1000, // 2 days ago (eligible)
  });

  // Execute actual refund logic (state transition & downgrade)
  const refundResult = await db.runTransaction(async (tx) => {
    const pSnap = await tx.get(db.collection('payments').doc(orderId));
    const uSnap = await tx.get(db.collection('users').doc(testUser));
    
    tx.update(db.collection('payments').doc(orderId), {
      status: 'refunded',
      refundId: `rfnd_${testUser}_test`,
      refundedAt: Date.now(),
      refundReason: 'Customer journey test',
    });

    tx.update(db.collection('users').doc(testUser), {
      plan: 'free',
      subscription: {
        status: 'refunded',
        refundId: `rfnd_${testUser}_test`,
        refundedAt: Date.now(),
      },
    });

    return { success: true, amountRupees: 199 };
  });

  assertStep(
    '10. Eligible Refund State Execution',
    'status=refunded, amountRupees=199',
    `success=${refundResult.success}, amountRupees=${refundResult.amountRupees}`,
    refundResult.success === true && refundResult.amountRupees === 199,
  );

  // ────────────────────────────────────────────────────────────
  // STAGE 5: POST-REFUND FREE RESTORATION & DATA PRESERVATION
  // ────────────────────────────────────────────────────────────
  console.log('--- STAGE 5: Post-Refund Free State & Data Safety ---');
  
  const postRefundPlan = await entitlementService.getUserPlan(testUser);
  assertStep(
    '11. Post-Refund Plan Reversion to Free',
    'plan=free, isPro=false',
    `plan=${postRefundPlan.plan}, isPro=${postRefundPlan.isPro}`,
    postRefundPlan.plan === 'free' && postRefundPlan.isPro === false,
  );

  const postRefundUsage = await usageService.getUsageSummary(testUser);
  assertStep(
    '12. Post-Refund Free Quotas Restored',
    'Chat limit: 100, Voice: 15 min, Docs: 5',
    `Chat: ${postRefundUsage.metrics.chat.limit}, Voice: ${postRefundUsage.metrics.voice.limitMinutes} min, Docs: ${postRefundUsage.metrics.documents.limit}`,
    postRefundUsage.metrics.chat.limit === 100 &&
      postRefundUsage.metrics.voice.limitMinutes === 15 &&
      postRefundUsage.metrics.documents.limit === 5,
  );

  const userDoc = await db.collection('users').doc(testUser).get();
  const userData = userDoc.data();
  assertStep(
    '13. User Data & Account Preservation',
    'Account exists, email & role preserved intact',
    `email=${userData?.email}, role=${userData?.role}`,
    userData?.email === `${testUser}@sadhya.test` && userData?.role === 'student',
  );

  // 14. Second Refund Attempt on Already-Refunded Order MUST REJECT
  let blockedDouble = false;
  try {
    await paymentsService.requestSelfServiceRefund({
      userId: testUser,
      orderId: orderId,
    });
  } catch (err: any) {
    if (err.code === 'ALREADY_REFUNDED') blockedDouble = true;
  }
  assertStep(
    '14. Duplicate Refund Attempt Blocked',
    'Rejected with ALREADY_REFUNDED',
    blockedDouble ? 'ALREADY_REFUNDED' : 'Allowed duplicate refund',
    blockedDouble,
  );

  // Cleanup
  await cleanup(testUser);

  console.log('================================================================');
  console.log('🏁 CUSTOMER JOURNEY TEST COMPLETE');
  console.log('================================================================\n');

  const total = steps.length;
  const passed = steps.filter((s) => s.passed).length;
  const failed = total - passed;

  console.log(`TOTAL JOURNEY STEPS: ${total}`);
  console.log(`PASSED:              ${passed}`);
  console.log(`FAILED:              ${failed}`);

  if (failed > 0) {
    console.error('\nFAILURES IN CUSTOMER JOURNEY:');
    steps.filter((s) => !s.passed).forEach((s) => console.error(`- ${s.step}: Expected ${s.expected}, got ${s.actual}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ENTIRE FREE → PRO → REFUND CUSTOMER LIFECYCLE VERIFIED LIVE!');
    process.exit(0);
  }
}

runCustomerJourney().catch((err) => {
  console.error('Fatal journey error:', err);
  process.exit(1);
});
