import { db } from '../src/config/firebase';
import { usageService } from '../src/services/usage.service';
import { entitlementService, PLAN_LIMITS } from '../src/services/entitlement.service';
import { paymentsService } from '../src/services/payments.service';
import { beginSession, endSession, accrue } from '../src/services/voice/voiceQuota';

interface AttackTestReport {
  name: string;
  category: string;
  passed: boolean;
  details: string;
}

const results: AttackTestReport[] = [];

function record(name: string, category: string, passed: boolean, details: string) {
  results.push({ name, category, passed, details });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} [${category}] ${name}: ${details}`);
}

async function cleanupTestUser(userId: string) {
  try {
    const usageCols = await db.collection('user_usage').listDocuments();
    for (const doc of usageCols) {
      if (doc.id.startsWith(userId)) {
        await doc.delete();
      }
    }
    await db.collection('users').doc(userId).delete();
    await db.collection('voice_usage').doc(userId).delete();
  } catch (e) {}
}

async function runAttackSuite() {
  console.log('====================================================');
  console.log('🚀 STARTING COMPREHENSIVE MONETIZATION ATTACK SUITE');
  console.log('====================================================\n');

  // ──────────────────────────────────────────────────────────
  // TEST 1: FREE CHAT EXACT BOUNDARY (98, 99, 100, 101)
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 1. ATTACK: Free Chat Exact Boundary ---');
  const freeUser = 'attack_test_free_user_01';
  await cleanupTestUser(freeUser);

  // Set user usage to 98
  const period = usageService.getPeriodWindow();
  const usageRef = db.collection('user_usage').doc(`${freeUser}_${period.periodKey}`);
  await usageRef.set({
    userId: freeUser,
    periodKey: period.periodKey,
    chatMessages: 98,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    updatedAt: Date.now(),
  });

  // 99th message
  try {
    const q99 = await usageService.consumeQuota(freeUser, 'chatMessages', 1);
    record('Free Chat 99th Message', 'Chat Quota', q99.used === 99 && q99.remaining === 1, `used=${q99.used}/100, remaining=${q99.remaining}`);
  } catch (err: any) {
    record('Free Chat 99th Message', 'Chat Quota', false, `Unexpected error: ${err.message}`);
  }

  // 100th message
  try {
    const q100 = await usageService.consumeQuota(freeUser, 'chatMessages', 1);
    record('Free Chat 100th Message', 'Chat Quota', q100.used === 100 && q100.remaining === 0, `used=${q100.used}/100, remaining=${q100.remaining}`);
  } catch (err: any) {
    record('Free Chat 100th Message', 'Chat Quota', false, `Unexpected error: ${err.message}`);
  }

  // 101st message (MUST REJECT)
  try {
    await usageService.consumeQuota(freeUser, 'chatMessages', 1);
    record('Free Chat 101st Message (Rejection)', 'Chat Quota', false, 'Allowed 101st message when limit is 100!');
  } catch (err: any) {
    const isExhausted = err.code === 'QUOTA_EXHAUSTED';
    record('Free Chat 101st Message (Rejection)', 'Chat Quota', isExhausted, `Correctly rejected with code=${err.code}: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────
  // TEST 2: PRO CHAT EXACT BOUNDARY (1998, 1999, 2000, 2001)
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 2. ATTACK: Pro Chat Exact Boundary ---');
  const proUser = 'attack_test_pro_user_02';
  await cleanupTestUser(proUser);
  await db.collection('users').doc(proUser).set({
    plan: 'pro',
    subscription: {
      status: 'active',
      planName: 'Sadhya Pro',
      activatedAt: Date.now() - 24 * 60 * 60 * 1000,
      currentPeriodEnd: Date.now() + 29 * 24 * 60 * 60 * 1000,
    },
  });

  const proPeriod = usageService.getPeriodWindow({
    status: 'active',
    activatedAt: Date.now() - 24 * 60 * 60 * 1000,
    currentPeriodEnd: Date.now() + 29 * 24 * 60 * 60 * 1000,
  });

  const proUsageRef = db.collection('user_usage').doc(`${proUser}_${proPeriod.periodKey}`);
  await proUsageRef.set({
    userId: proUser,
    periodKey: proPeriod.periodKey,
    chatMessages: 1998,
    periodStart: proPeriod.periodStart,
    periodEnd: proPeriod.periodEnd,
    updatedAt: Date.now(),
  });

  // 1999th
  try {
    const q1999 = await usageService.consumeQuota(proUser, 'chatMessages', 1);
    record('Pro Chat 1999th Message', 'Pro Quota', q1999.used === 1999 && q1999.remaining === 1, `used=${q1999.used}/2000`);
  } catch (err: any) {
    record('Pro Chat 1999th Message', 'Pro Quota', false, `Unexpected error: ${err.message}`);
  }

  // 2000th
  try {
    const q2000 = await usageService.consumeQuota(proUser, 'chatMessages', 1);
    record('Pro Chat 2000th Message', 'Pro Quota', q2000.used === 2000 && q2000.remaining === 0, `used=${q2000.used}/2000`);
  } catch (err: any) {
    record('Pro Chat 2000th Message', 'Pro Quota', false, `Unexpected error: ${err.message}`);
  }

  // 2001st (MUST REJECT)
  try {
    await usageService.consumeQuota(proUser, 'chatMessages', 1);
    record('Pro Chat 2001st Message (Rejection)', 'Pro Quota', false, 'Allowed 2001st message when limit is 2000!');
  } catch (err: any) {
    const isExhausted = err.code === 'QUOTA_EXHAUSTED';
    record('Pro Chat 2001st Message (Rejection)', 'Pro Quota', isExhausted, `Correctly rejected with code=${err.code}: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────
  // TEST 3: CONCURRENT CHAT ATTACK (10 simultaneous at 99/100)
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 3. ATTACK: Concurrent Race Condition Flooding ---');
  const raceUser = 'attack_test_race_user_03';
  await cleanupTestUser(raceUser);

  const raceUsageRef = db.collection('user_usage').doc(`${raceUser}_${period.periodKey}`);
  await raceUsageRef.set({
    userId: raceUser,
    periodKey: period.periodKey,
    chatMessages: 99,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    updatedAt: Date.now(),
  });

  // Fire 10 simultaneous promises in parallel
  const floodPromises = Array.from({ length: 10 }).map((_, i) =>
    usageService
      .consumeQuota(raceUser, 'chatMessages', 1)
      .then((res) => ({ index: i, success: true, res }))
      .catch((err) => ({ index: i, success: false, code: err.code })),
  );

  const floodResults = await Promise.all(floodPromises);
  const successes = floodResults.filter((r) => r.success);
  const failures = floodResults.filter((r) => !r.success);

  const finalSnap = await raceUsageRef.get();
  const finalUsed = (finalSnap.data() as any)?.chatMessages;

  const passedRace = successes.length === 1 && failures.length === 9 && finalUsed === 100;
  record(
    'Concurrent 10-Request Race Attack at 99/100',
    'Concurrency Security',
    passedRace,
    `successes=${successes.length}, rejections=${failures.length}, finalDbCount=${finalUsed}/100`,
  );

  // ──────────────────────────────────────────────────────────
  // TEST 4: VOICE ATTACK TEST (900s Free / 18000s Pro)
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 4. ATTACK: Voice Monthly Quota & Multi-Tab Block ---');
  const voiceUser = 'attack_test_voice_user_04';
  await cleanupTestUser(voiceUser);

  // 4a. Multi-tab concurrency block
  const v1 = await beginSession(voiceUser);
  const v2 = await beginSession(voiceUser);
  const blockedMultiTab = v1.ok === true && v2.ok === false && v2.code === 'VOICE_SESSION_ALREADY_ACTIVE';
  record('Voice Multi-Tab / Parallel Session Block', 'Voice Security', blockedMultiTab, `first=${v1.ok}, secondCode=${v2.code}`);
  endSession(voiceUser);

  // 4b. Voice quota limit exhaustion (simulate 900 seconds used)
  const voiceUsageRef = db.collection('user_usage').doc(`${voiceUser}_${period.periodKey}`);
  await voiceUsageRef.set({
    userId: voiceUser,
    periodKey: period.periodKey,
    voiceSeconds: 900,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    updatedAt: Date.now(),
  });

  const vExhausted = await beginSession(voiceUser);
  const blockedExhausted = vExhausted.ok === false && vExhausted.code === 'VOICE_MONTHLY_LIMIT';
  record('Voice Quota Reached (900s Limit Block)', 'Voice Security', blockedExhausted, `ok=${vExhausted.ok}, code=${vExhausted.code}, msg=${vExhausted.message}`);
  endSession(voiceUser);

  // ──────────────────────────────────────────────────────────
  // TEST 5: DOCUMENT UPLOAD & SIZE ATTACK (5 docs / 10MB vs 50MB)
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 5. ATTACK: Document Volume and Size Gate ---');
  const docUser = 'attack_test_doc_user_05';
  await cleanupTestUser(docUser);

  const docUsageRef = db.collection('user_usage').doc(`${docUser}_${period.periodKey}`);
  await docUsageRef.set({
    userId: docUser,
    periodKey: period.periodKey,
    documentsUploaded: 4,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    updatedAt: Date.now(),
  });

  // 5th document allowed
  try {
    const d5 = await usageService.consumeQuota(docUser, 'documentsUploaded', 1);
    record('Document 5th Upload', 'Document Quota', d5.used === 5 && d5.remaining === 0, `used=${d5.used}/5`);
  } catch (err: any) {
    record('Document 5th Upload', 'Document Quota', false, `Unexpected error: ${err.message}`);
  }

  // 6th document rejected
  try {
    await usageService.consumeQuota(docUser, 'documentsUploaded', 1);
    record('Document 6th Upload (Rejection)', 'Document Quota', false, 'Allowed 6th document on Free tier!');
  } catch (err: any) {
    const isExhausted = err.code === 'QUOTA_EXHAUSTED';
    record('Document 6th Upload (Rejection)', 'Document Quota', isExhausted, `Correctly rejected code=${err.code}`);
  }

  // Size limit check on plan
  const freeLimits = PLAN_LIMITS.free;
  const proLimits = PLAN_LIMITS.pro;
  record(
    'Document Plan Max Size Gate (10MB Free vs 50MB Pro)',
    'Document Security',
    freeLimits.maxDocumentSizeMB === 10 && proLimits.maxDocumentSizeMB === 50,
    `Free=${freeLimits.maxDocumentSizeMB}MB, Pro=${proLimits.maxDocumentSizeMB}MB`,
  );

  // ──────────────────────────────────────────────────────────
  // TEST 6: PODCAST QUOTA ATTACK (1 Free / 25 Pro)
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 6. ATTACK: Podcast Studio Generation Quota ---');
  const podcastUser = 'attack_test_podcast_user_06';
  await cleanupTestUser(podcastUser);

  // 1st episode allowed
  const p1 = await usageService.consumeQuota(podcastUser, 'podcastsGenerated', 1);
  record('Podcast 1st Generation (Free)', 'Podcast Quota', p1.used === 1 && p1.remaining === 0, `used=${p1.used}/1`);

  // 2nd episode rejected
  try {
    await usageService.consumeQuota(podcastUser, 'podcastsGenerated', 1);
    record('Podcast 2nd Generation (Rejection)', 'Podcast Quota', false, 'Allowed 2nd podcast generation on Free tier!');
  } catch (err: any) {
    const isExhausted = err.code === 'QUOTA_EXHAUSTED';
    record('Podcast 2nd Generation (Rejection)', 'Podcast Quota', isExhausted, `Correctly rejected code=${err.code}`);
  }

  // ──────────────────────────────────────────────────────────
  // TEST 7: MOCK TEST QUOTA (3 Free / 1000 Pro)
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 7. ATTACK: Mock Test Generation Quota ---');
  const testUser = 'attack_test_mock_user_07';
  await cleanupTestUser(testUser);

  await usageService.consumeQuota(testUser, 'mockTestsGenerated', 1);
  await usageService.consumeQuota(testUser, 'mockTestsGenerated', 1);
  const t3 = await usageService.consumeQuota(testUser, 'mockTestsGenerated', 1);
  record('Mock Test 3rd Generation (Free)', 'Mock Test Quota', t3.used === 3 && t3.remaining === 0, `used=${t3.used}/3`);

  // 4th test rejected
  try {
    await usageService.consumeQuota(testUser, 'mockTestsGenerated', 1);
    record('Mock Test 4th Generation (Rejection)', 'Mock Test Quota', false, 'Allowed 4th test generation on Free tier!');
  } catch (err: any) {
    const isExhausted = err.code === 'QUOTA_EXHAUSTED';
    record('Mock Test 4th Generation (Rejection)', 'Mock Test Quota', isExhausted, `Correctly rejected code=${err.code}`);
  }

  // ──────────────────────────────────────────────────────────
  // TEST 8: PAYMENT SECURITY ATTACK (Spoofed signature & Price)
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 8. ATTACK: Payment Gateway Signature & Spoofing ---');
  
  // 8a. Verify webhook signature check rejects invalid signatures
  const fakePayload = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} }));
  const invalidSig = 'invalid_sha256_fake_signature_hex_value';
  const sigVerified = paymentsService.verifyWebhookSignature(fakePayload, invalidSig);
  record(
    'Payment Webhook Invalid Signature Rejection',
    'Payment Security',
    sigVerified === false,
    `sigVerified=${sigVerified} (correctly blocked forged payload)`,
  );

  // 8b. Verify payment callback signature check
  const fakePaymentSig = paymentsService.verifyPaymentSignature(
    'order_fake_order_123',
    'pay_fake_payment_456',
    'invalid_user_supplied_signature',
  );
  record(
    'Payment Callback Invalid HMAC-SHA256 Signature Rejection',
    'Payment Security',
    fakePaymentSig === false,
    `fakePaymentSig=${fakePaymentSig} (correctly blocked forged payment verification)`,
  );

  // ──────────────────────────────────────────────────────────
  // TEST 9: 7-DAY REFUND STATE MACHINE & DOUBLE-REFUND ATTACK
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 9. ATTACK: 7-Day Refund Double-Submit & Status ---');
  const refundUser = 'attack_test_refund_user_09';
  await cleanupTestUser(refundUser);

  const testOrderRef = db.collection('payments').doc('order_attack_test_refund_01');
  await testOrderRef.set({
    userId: refundUser,
    status: 'paid',
    amountRupees: 199,
    planId: 'pro',
    planName: 'Sadhya Pro',
    paymentId: 'pay_attack_test_refund_01',
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago (eligible)
    paidAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
  });

  // If order already marked refunded:
  await testOrderRef.update({ status: 'refunded', refundId: 'rfnd_test_prior' });

  try {
    await paymentsService.requestSelfServiceRefund({
      userId: refundUser,
      orderId: 'order_attack_test_refund_01',
    });
    record('Refund Double-Submit Block', 'Refund Security', false, 'Allowed duplicate refund on already-refunded order!');
  } catch (err: any) {
    const blockedDouble = err.message?.includes('already been refunded');
    record('Refund Double-Submit Block', 'Refund Security', blockedDouble, `Correctly blocked duplicate refund: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────
  // CLEANUP TEST USERS
  // ──────────────────────────────────────────────────────────
  await cleanupTestUser(freeUser);
  await cleanupTestUser(proUser);
  await cleanupTestUser(raceUser);
  await cleanupTestUser(voiceUser);
  await cleanupTestUser(docUser);
  await cleanupTestUser(podcastUser);
  await cleanupTestUser(testUser);
  await cleanupTestUser(refundUser);
  await testOrderRef.delete();

  console.log('\n====================================================');
  console.log('🏁 ATTACK SUITE RUN COMPLETE — RESULTS SUMMARY');
  console.log('====================================================\n');

  const total = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`TOTAL TESTS: ${total}`);
  console.log(`PASSED:      ${passedCount}`);
  console.log(`FAILED:      ${failedCount}`);

  if (failedCount > 0) {
    console.error('\nFAILED TESTS:');
    results.filter((r) => !r.passed).forEach((r) => console.error(`- [${r.category}] ${r.name}: ${r.details}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL ATTACK TESTS PASSED WITHOUT VULNERABILITIES!');
    process.exit(0);
  }
}

runAttackSuite().catch((err) => {
  console.error('Fatal attack suite error:', err);
  process.exit(1);
});
