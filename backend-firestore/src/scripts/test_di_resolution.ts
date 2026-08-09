import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';

async function main() {
  console.log('=== VERIFYING DI RESOLUTION WITH LIVE ENV CONFIGS ===');
  
  bootstrapDI();

  const smsProvider = container.resolve<any>(TOKENS.SmsProvider);
  const waProvider = container.resolve<any>(TOKENS.WhatsAppProvider);

  console.log('Resolved SMS Provider Class:', smsProvider.constructor.name);
  console.log('Resolved WhatsApp Provider Class:', waProvider.constructor.name);

  if (smsProvider.constructor.name === 'TwilioSmsProvider' && waProvider.constructor.name === 'MetaWhatsAppProvider') {
    console.log('✅ DI resolves live production Twilio and Meta providers successfully!');
    process.exit(0);
  } else {
    console.error('❌ DI resolution failed to match production config.');
    process.exit(1);
  }
}

main().catch(console.error);
