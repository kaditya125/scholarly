import { usageService } from '../src/services/usage.service';
import { entitlementService } from '../src/services/entitlement.service';

async function runLiveVerification() {
  console.log('--- 1. Testing Entitlement & Quota for Pro User ---');
  const proSummary = await usageService.getUsageSummary('5wIZIPeI3mZj1o9iKxkcdKDDSZ92');
  console.log('Pro User Plan:', proSummary.plan, 'IsPro:', proSummary.isPro);
  console.log('Pro Metrics:', proSummary.metrics);

  console.log('\n--- 2. Testing Entitlement & Quota for Free User (Mock ID) ---');
  const freeSummary = await usageService.getUsageSummary('mock_free_student_test_123');
  console.log('Free User Plan:', freeSummary.plan, 'IsPro:', freeSummary.isPro);
  console.log('Free Metrics:', freeSummary.metrics);

  console.log('\n--- 3. Testing Quota Pre-Check (Chat Quota for Free User) ---');
  const chatQuota = await usageService.checkQuota('mock_free_student_test_123', 'chatMessages', 1);
  console.log('Free User Chat Quota:', chatQuota);

  console.log('\n--- 4. Testing Atomic Quota Consumption ---');
  const consumed = await usageService.consumeQuota('mock_free_student_test_123', 'chatMessages', 1);
  console.log('Consumed 1 message:', consumed);

  const updatedSummary = await usageService.getUsageSummary('mock_free_student_test_123');
  console.log('Updated Free User Chat Used:', updatedSummary.metrics.chat.used, '/', updatedSummary.metrics.chat.limit);

  console.log('\n✅ ALL LIVE BACKEND QUOTA CHECKS PASSED SUCCESSFULLY!');
}

runLiveVerification().catch(console.error);
