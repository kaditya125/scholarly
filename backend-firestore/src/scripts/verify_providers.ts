import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';
import { ISmsProvider } from '../core/notifications/providers/SmsProvider';
import { IWhatsAppProvider } from '../core/notifications/providers/WhatsAppProvider';

async function main() {
  console.log('--- Verifying Providers Abstraction Layer (Priority 1) ---');
  
  // 1. Bootstrap DI Container
  bootstrapDI();
  
  // 2. Resolve Providers
  const smsProvider = container.resolve<ISmsProvider>(TOKENS.SmsProvider);
  const waProvider = container.resolve<IWhatsAppProvider>(TOKENS.WhatsAppProvider);
  
  if (!smsProvider) {
    throw new Error('SmsProvider could not be resolved from DI Container!');
  }
  if (!waProvider) {
    throw new Error('WhatsAppProvider could not be resolved from DI Container!');
  }
  
  console.log('✅ Resolved SMS Provider:', smsProvider.constructor.name);
  console.log('✅ Resolved WhatsApp Provider:', waProvider.constructor.name);
  
  // 3. Test Mock delivery
  console.log('\n--- Testing Mock Deliveries ---');
  const smsResult = await smsProvider.sendSms('+1234567890', 'Hello from Sadhya DI Verify!');
  console.log('SMS Result:', smsResult);
  
  const waResult = await waProvider.sendTextMessage('+1234567890', 'Hello from WhatsApp DI Verify!');
  console.log('WhatsApp Result:', waResult);
  
  if (smsResult.success && waResult.success) {
    console.log('\n✅ Verification PASSED!');
    process.exit(0);
  } else {
    console.error('\n❌ Verification FAILED!');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Verification crashed:', e);
  process.exit(1);
});
