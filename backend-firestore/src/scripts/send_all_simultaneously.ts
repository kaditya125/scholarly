import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';

async function main() {
  console.log('=== DISPATCHING TO ALL CHANNELS SIMULTANEOUSLY ===');
  
  bootstrapDI();

  const { TwilioSmsProvider } = await import('../core/notifications/providers/SmsProvider');
  const { MetaWhatsAppProvider } = await import('../core/notifications/providers/WhatsAppProvider');
  const { emailNotificationService } = await import('../core/notifications/EmailNotificationService');

  const smsProvider = new TwilioSmsProvider();
  const waProvider = new MetaWhatsAppProvider();

  const recipient = '+919102202267';
  const emailRecipient = 'adityakumar.study@scholarly.ai';

  console.log(`Sending to SMS: ${recipient}`);
  console.log(`Sending to WhatsApp: ${recipient}`);
  console.log(`Sending to Email: ${emailRecipient}`);

  // Setup directory profile for email lookups
  const { db } = await import('../config/firebase');
  await db.collection('userDirectory').doc('live_simul_user').set({
    uid: 'live_simul_user',
    email: emailRecipient
  });

  const payload = {
    userId: 'live_simul_user',
    category: 'learning' as const,
    type: 'podcast.completed',
    title: 'Atomic Structure Audio Summary',
    body: 'Great job! Your customized revision podcast for Atomic Structure is ready to play. 🎧',
    priority: 'high' as const
  };

  // 1. Send SMS
  const smsPromise = smsProvider.sendSms(
    recipient,
    'Scholarly Live SMS: Your customized revision podcast for Atomic Structure is ready! 🎧'
  ).then(r => console.log('Twilio SMS result:', r));

  // 2. Send WhatsApp
  const waPromise = waProvider.sendTemplateMessage(
    recipient,
    'hello_world',
    'en_US',
    []
  ).then(r => console.log('Meta WhatsApp result:', r));

  // 3. Send Email
  const emailPromise = emailNotificationService.sendCriticalAlert(payload)
    .then(() => console.log('Nodemailer Email dispatched successfully.'));

  await Promise.all([smsPromise, waPromise, emailPromise]);

  console.log('\n=== All Channels Dispatched! ===');
  process.exit(0);
}

main().catch(console.error);

export {};
