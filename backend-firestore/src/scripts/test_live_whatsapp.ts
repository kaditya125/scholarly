async function main() {
  console.log('=== TESTING LIVE META WHATSAPP INTEGRATION ===');

  const dotenv = await import('dotenv');
  dotenv.config();

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1295501346969048';
  const recipient = '+919102202267'; // User WhatsApp number

  console.log(`WhatsApp Phone Number ID: ${phoneNumberId}`);
  console.log(`Recipient Number: ${recipient}`);

  // Dynamic import to prevent hoisting and ensure environment variables are read correctly
  const { MetaWhatsAppProvider } = await import('../core/notifications/providers/WhatsAppProvider');
  
  const provider = new MetaWhatsAppProvider();
  
  console.log('\nSending test WhatsApp Template message ("hello_world")...');
  const report = await provider.sendTemplateMessage(
    recipient,
    'hello_world',
    'en_US',
    []
  );

  console.log('\n=== WhatsApp Delivery Report ===');
  console.log('Success:', report.success);
  if (report.success) {
    console.log('✅ Message ID:', report.messageId);
    console.log('✅ Live WhatsApp Verification PASSED!');
    process.exit(0);
  } else {
    console.error('❌ Error Message:', report.error);
    console.error('\nTIP: If the error is about a "recipient not verified", please make sure you added "+919102202267" to the verified test recipients list on the Meta API Setup page!');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Script crashed:', e);
  process.exit(1);
});

export {};
