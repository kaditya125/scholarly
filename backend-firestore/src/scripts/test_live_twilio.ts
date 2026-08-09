async function main() {
  console.log('=== TESTING LIVE TWILIO INTEGRATION ===');

  const accountSid = process.env.TWILIO_ACCOUNT_SID || 'REDACTED';
  const authToken = process.env.TWILIO_AUTH_TOKEN || 'REDACTED';
  const fromNumber = process.env.TWILIO_FROM_NUMBER || '+1234567890'; // Newly purchased Twilio number
  const recipient = process.env.TEST_RECIPIENT || '+910000000000'; // User number

  console.log(`Using Live Account SID: ${accountSid}`);
  console.log(`Twilio Sender Number: ${fromNumber}`);
  console.log(`Target Recipient Number: ${recipient}`);

  console.log('\nSending test SMS via TwilioSmsProvider...');
  
  // Set environment variables BEFORE importing env / SmsProvider
  process.env.TWILIO_ACCOUNT_SID = accountSid;
  process.env.TWILIO_AUTH_TOKEN = authToken;
  process.env.TWILIO_FROM_NUMBER = fromNumber;

  // Dynamic import to prevent hoisting and ensure environment variables are read correctly
  const { TwilioSmsProvider } = await import('../core/notifications/providers/SmsProvider');

  const provider = new TwilioSmsProvider();
  const report = await provider.sendSms(recipient, 'Hello from Scholarly AI! Your Twilio SMS integration is working perfectly in live mode! 🚀');

  console.log('\n=== Twilio Delivery Report ===');
  console.log('Success:', report.success);
  if (report.success) {
    console.log('✅ Message SID:', report.messageId);
    console.log('✅ Live Twilio Verification PASSED!');
    process.exit(0);
  } else {
    console.error('❌ Error Message:', report.error);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Script crashed:', e);
  process.exit(1);
});

export {};
