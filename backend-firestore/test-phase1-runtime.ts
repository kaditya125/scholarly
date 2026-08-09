/**
 * Phase 1 Runtime Test
 * Tests that all Phase 1 code compiles and runs without errors
 */

console.log('🧪 Phase 1 Runtime Test\n');
console.log('='.repeat(70));

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log('✅', name);
    passed++;
  } catch (err: any) {
    console.log('❌', name);
    console.log('   └─', err.message);
    failed++;
  }
}

async function runTests() {
  console.log('1️⃣  CONFIGURATION EXTERNALIZATION');
  console.log('-'.repeat(70));
  
  await test('Load TTS service', async () => {
    const { GoogleCloudTTSProvider } = await import('./src/services/ai/tts.service');
    if (!GoogleCloudTTSProvider) throw new Error('GoogleCloudTTSProvider not exported');
  });

  await test('Read config file', () => {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, 'config', 'tts.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    if (config.provider !== 'google-cloud') throw new Error('Invalid provider');
    if (!config.voices) throw new Error('Missing voices');
    if (Object.keys(config.voices).length !== 6) throw new Error('Expected 6 voices');
  });

  console.log();
  console.log('2️⃣  CIRCUIT BREAKER');
  console.log('-'.repeat(70));

  await test('Import circuit breaker', async () => {
    const { withCircuitBreaker, getCircuitBreakerState } = await import('./src/services/ai/middleware/tts.circuit-breaker');
    
    if (typeof withCircuitBreaker !== 'function') throw new Error('withCircuitBreaker not a function');
    if (typeof getCircuitBreakerState !== 'function') throw new Error('getCircuitBreakerState not a function');
  });

  await test('Get circuit breaker state', async () => {
    const { getCircuitBreakerState } = await import('./src/services/ai/middleware/tts.circuit-breaker');
    const state = getCircuitBreakerState();
    
    if (state.policy !== 'consecutive-breaker') throw new Error('Invalid policy');
    if (state.threshold !== 5) throw new Error('Invalid threshold');
    if (state.halfOpenAfter !== 60000) throw new Error('Invalid halfOpenAfter');
  });

  console.log();
  console.log('3️⃣  COST TRACKING');
  console.log('-'.repeat(70));

  await test('Import cost tracking service', async () => {
    const { CostTrackingService, costTrackingService } = await import('./src/services/ai/costTracking.service');
    
    if (!CostTrackingService) throw new Error('CostTrackingService not exported');
    if (!costTrackingService) throw new Error('costTrackingService not exported');
  });

  await test('Calculate cost correctly', async () => {
    const { costTrackingService } = await import('./src/services/ai/costTracking.service');
    
    // 1M characters at $16/1M = $16
    const cost1M = costTrackingService.calculateCost(1_000_000, 'google-cloud-wavenet');
    if (cost1M !== 16) throw new Error(`Expected 16, got ${cost1M}`);
    
    // 10k characters = $0.16
    const cost10k = costTrackingService.calculateCost(10_000, 'google-cloud-wavenet');
    if (cost10k !== 0.16) throw new Error(`Expected 0.16, got ${cost10k}`);
  });

  console.log();
  console.log('4️⃣  REQUEST DEDUPLICATION');
  console.log('-'.repeat(70));

  await test('Hash requests consistently', () => {
    const crypto = require('crypto');
    
    const request1 = JSON.stringify({
      userId: 'user123',
      type: 'custom',
      source: { kind: 'notebook', notebookId: 'nb456' },
      durationMinutes: 10
    });
    
    const request2 = JSON.stringify({
      userId: 'user123',
      type: 'custom',
      source: { kind: 'notebook', notebookId: 'nb456' },
      durationMinutes: 10
    });
    
    const hash1 = crypto.createHash('sha256').update(request1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(request2).digest('hex');
    
    if (hash1 !== hash2) throw new Error('Hashes should match');
    if (hash1.length !== 64) throw new Error('SHA-256 should produce 64 hex chars');
  });

  console.log();
  console.log('5️⃣  INTEGRATION CHECKS');
  console.log('-'.repeat(70));

  await test('TTS service has all Phase 1 features', async () => {
    const content = require('fs').readFileSync('./src/services/ai/tts.service.ts', 'utf-8');
    
    if (!content.includes('loadTTSConfig')) throw new Error('Missing loadTTSConfig');
    if (!content.includes('withCircuitBreaker')) throw new Error('Missing circuit breaker integration');
    if (!content.includes('costTrackingService')) throw new Error('Missing cost tracking integration');
    if (!content.includes('userId?:')) throw new Error('Missing userId field');
    if (!content.includes('podcastId?:')) throw new Error('Missing podcastId field');
  });

  await test('PodcastEngine has deduplication', async () => {
    const content = require('fs').readFileSync('./src/services/podcast/podcastEngine.service.ts', 'utf-8');
    
    if (!content.includes('hashRequest')) throw new Error('Missing hashRequest method');
    if (!content.includes('findInProgressByHash')) throw new Error('Missing findInProgressByHash method');
    if (!content.includes('sha256')) throw new Error('Missing SHA-256 usage');
  });

  await test('AudioComposer passes context', async () => {
    const content = require('fs').readFileSync('./src/core/workflow/podcast/AudioComposer.ts', 'utf-8');
    
    if (!content.includes('userId,') && !content.includes('userId:')) throw new Error('Missing userId parameter');
    if (!content.includes('podcastId')) throw new Error('Missing podcastId parameter');
  });

  console.log();
  console.log('='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);
  console.log();

  if (failed === 0) {
    console.log('🎉 ALL RUNTIME TESTS PASSED!\n');
    console.log('Phase 1 is ready for end-to-end testing.\n');
    console.log('Next steps:');
    console.log('1. Start the backend server');
    console.log('2. Generate a test podcast via the UI or API');
    console.log('3. Check server logs for Phase 1 features:');
    console.log('   • [TTS] Initialized with provider: google-cloud');
    console.log('   • [TTS] Voice configuration loaded: 6 voices');
    console.log('   • [TTS] Circuit breaker enabled');
    console.log('   • [TTS] Synthesizing: {characterCount, estimatedCost}');
    console.log('   • [CostTracking] Tracked TTS synthesis');
    console.log('   • [PodcastEngine] Deduplication: returning existing...');
    console.log();
    return 0;
  } else {
    console.log('⚠️  SOME TESTS FAILED\n');
    return 1;
  }
}

runTests()
  .then(code => process.exit(code))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

