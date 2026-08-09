/**
 * Phase 1 Implementation Test Script
 * Tests: Configuration loading, Circuit breaker, Cost tracking
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(70));
console.log('PHASE 1 IMPLEMENTATION TEST');
console.log('='.repeat(70));
console.log();

let passed = 0;
let failed = 0;

function test(name, condition, details) {
  if (condition) {
    console.log('✅', name);
    passed++;
  } else {
    console.log('❌', name);
    if (details) console.log('   └─', details);
    failed++;
  }
}

// Test 1: Configuration file exists
console.log('1️⃣  CONFIGURATION EXTERNALIZATION');
console.log('-'.repeat(70));

const configPath = path.join(__dirname, 'config', 'tts.config.json');
const configExists = fs.existsSync(configPath);
test('TTS config file exists', configExists, `Missing: ${configPath}`);

if (configExists) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    test('Config has provider field', config.provider === 'google-cloud');
    test('Config has voices field', config.voices && typeof config.voices === 'object');
    test('Config has 6 voice roles', Object.keys(config.voices || {}).length === 6);
    test('Config has defaultVoice', config.defaultVoice && config.defaultVoice.name);
    test('Config has audioConfig', config.audioConfig && config.audioConfig.format === 'MP3');
    test('Config has generationConfig', config.generationConfig && config.generationConfig.batchSize === 10);
    test('Config has costLimits', config.costLimits && config.costLimits.monthlyBudget === 500);
  } catch (err) {
    test('Config is valid JSON', false, err.message);
  }
}
console.log();

// Test 2: Environment variables documented
console.log('2️⃣  ENVIRONMENT VARIABLES');
console.log('-'.repeat(70));

const envExamplePath = path.join(__dirname, '.env.example');
const envExampleExists = fs.existsSync(envExamplePath);
test('.env.example exists', envExampleExists);

if (envExampleExists) {
  const envContent = fs.readFileSync(envExamplePath, 'utf-8');
  test('TTS_PROVIDER documented', envContent.includes('TTS_PROVIDER'));
  test('TTS voice vars documented', envContent.includes('TTS_VOICE_HOST'));
  test('TTS batch size documented', envContent.includes('TTS_BATCH_SIZE'));
  test('TTS cost limits documented', envContent.includes('TTS_MONTHLY_BUDGET'));
}
console.log();

// Test 3: Circuit breaker implementation
console.log('3️⃣  CIRCUIT BREAKER');
console.log('-'.repeat(70));

const circuitBreakerPath = path.join(__dirname, 'src', 'services', 'ai', 'middleware', 'tts.circuit-breaker.ts');
const circuitBreakerExists = fs.existsSync(circuitBreakerPath);
test('Circuit breaker file exists', circuitBreakerExists);

if (circuitBreakerExists) {
  const cbContent = fs.readFileSync(circuitBreakerPath, 'utf-8');
  test('Imports cockatiel', cbContent.includes('from \'cockatiel\''));
  test('Exports withCircuitBreaker', cbContent.includes('export function withCircuitBreaker'));
  test('Uses ConsecutiveBreaker', cbContent.includes('ConsecutiveBreaker'));
  test('Configures halfOpenAfter', cbContent.includes('halfOpenAfter'));
}
console.log();

// Test 4: Cost tracking service
console.log('4️⃣  COST TRACKING');
console.log('-'.repeat(70));

const costTrackingPath = path.join(__dirname, 'src', 'services', 'ai', 'costTracking.service.ts');
const costTrackingExists = fs.existsSync(costTrackingPath);
test('Cost tracking service exists', costTrackingExists);

if (costTrackingExists) {
  const ctContent = fs.readFileSync(costTrackingPath, 'utf-8');
  test('Exports CostTrackingService', ctContent.includes('export class CostTrackingService'));
  test('Has trackSynthesis method', ctContent.includes('async trackSynthesis'));
  test('Has getPodcastCost method', ctContent.includes('async getPodcastCost'));
  test('Has getMonthlyCost method', ctContent.includes('async getMonthlyCost'));
  test('Has wouldExceedBudget method', ctContent.includes('async wouldExceedBudget'));
  test('Has calculateCost method', ctContent.includes('calculateCost'));
  test('Uses Firestore collections', ctContent.includes('podcast_costs') && ctContent.includes('podcast_monthly_costs'));
}
console.log();

// Test 5: TTS service integration
console.log('5️⃣  TTS SERVICE INTEGRATION');
console.log('-'.repeat(70));

const ttsServicePath = path.join(__dirname, 'src', 'services', 'ai', 'tts.service.ts');
const ttsServiceExists = fs.existsSync(ttsServicePath);
test('TTS service file exists', ttsServiceExists);

if (ttsServiceExists) {
  const ttsContent = fs.readFileSync(ttsServicePath, 'utf-8');
  test('Imports circuit breaker', ttsContent.includes('from \'./middleware/tts.circuit-breaker\''));
  test('Imports cost tracking', ttsContent.includes('from \'./costTracking.service\''));
  test('Has loadTTSConfig function', ttsContent.includes('function loadTTSConfig'));
  test('Has VoiceConfig interface', ttsContent.includes('interface VoiceConfig'));
  test('Has TTSConfig interface', ttsContent.includes('interface TTSConfig'));
  test('Uses withCircuitBreaker', ttsContent.includes('withCircuitBreaker'));
  test('Calls costTrackingService', ttsContent.includes('costTrackingService'));
  test('TTSRequest has userId field', ttsContent.includes('userId?:'));
  test('TTSRequest has podcastId field', ttsContent.includes('podcastId?:'));
}
console.log();

// Test 6: Request deduplication
console.log('6️⃣  REQUEST DEDUPLICATION');
console.log('-'.repeat(70));

const podcastEnginePath = path.join(__dirname, 'src', 'services', 'podcast', 'podcastEngine.service.ts');
const podcastEngineExists = fs.existsSync(podcastEnginePath);
test('Podcast engine service exists', podcastEngineExists);

if (podcastEngineExists) {
  const peContent = fs.readFileSync(podcastEnginePath, 'utf-8');
  test('Imports crypto module', peContent.includes('import crypto from \'crypto\'') || peContent.includes('import * as crypto'));
  test('Has hashRequest method', peContent.includes('hashRequest'));
  test('Has findInProgressByHash method', peContent.includes('findInProgressByHash'));
  test('Uses SHA-256 hashing', peContent.includes('sha256'));
  test('Stores requestHash', peContent.includes('requestHash'));
}
console.log();

// Test 7: AudioComposer integration
console.log('7️⃣  AUDIO COMPOSER INTEGRATION');
console.log('-'.repeat(70));

const audioComposerPath = path.join(__dirname, 'src', 'core', 'workflow', 'podcast', 'AudioComposer.ts');
const audioComposerExists = fs.existsSync(audioComposerPath);
test('AudioComposer file exists', audioComposerExists);

if (audioComposerExists) {
  const acContent = fs.readFileSync(audioComposerPath, 'utf-8');
  test('Passes userId to synthesize', acContent.includes('userId,') || acContent.includes('userId:'));
  test('Passes podcastId to synthesize', acContent.includes('podcastId') && acContent.includes('synthesize'));
}
console.log();

// Test 8: Documentation
console.log('8️⃣  DOCUMENTATION');
console.log('-'.repeat(70));

const phase1DocPath = path.join(__dirname, '..', 'PODCAST_PHASE1_IMPLEMENTATION.md');
const phase1DocExists = fs.existsSync(phase1DocPath);
test('Phase 1 implementation doc exists', phase1DocExists);

if (phase1DocExists) {
  const docContent = fs.readFileSync(phase1DocPath, 'utf-8');
  test('Doc has configuration reference', docContent.includes('Configuration Reference'));
  test('Doc has testing requirements', docContent.includes('Testing Requirements'));
  test('Doc has rollback procedure', docContent.includes('Rollback Procedure'));
  test('Doc has monitoring guidelines', docContent.includes('Monitoring'));
}
console.log();

// Summary
console.log('='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total:  ${passed + failed}`);
console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
console.log();

if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED! Phase 1 implementation is complete.');
  console.log();
  console.log('Next steps:');
  console.log('1. Update backend .env file with TTS configuration');
  console.log('2. Restart the backend service');
  console.log('3. Test podcast generation end-to-end');
  console.log('4. Monitor logs for circuit breaker and cost tracking');
  process.exit(0);
} else {
  console.log('⚠️  SOME TESTS FAILED. Please fix the issues above.');
  console.log();
  console.log('Run this test again after fixes:');
  console.log('  node test-phase1.js');
  process.exit(1);
}
