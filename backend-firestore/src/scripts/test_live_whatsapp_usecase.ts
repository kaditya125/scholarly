import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';
import { IWhatsAppProvider } from '../core/notifications/providers/WhatsAppProvider';

async function main() {
  console.log('=== TESTING REAL WHATSAPP USECASE ===');
  
  bootstrapDI();
  
  // Resolve Meta provider dynamically
  const provider = container.resolve<IWhatsAppProvider>(TOKENS.WhatsAppProvider);

  const recipient = '+919102202267';

  // 1. Send Free-Form Text (Requires customer to have messaged the number first)
  console.log('\n--- 1. Sending Live Usecase Study Text Alert ---');
  const textMsg = `Hey Aditya! 🎓 Keep up your 12-day study streak! Your personalized revision summary for "Organic Chemistry" is ready. Let's master it!`;
  const textReport = await provider.sendTextMessage(recipient, textMsg);
  console.log('Text Alert Success:', textReport.success);
  if (textReport.success) {
    console.log('✅ Message SID:', textReport.messageId);
  } else {
    console.warn('❌ Text Alert Error:', textReport.error);
    console.log('\n💡 Note: If you get a 24-hour policy error, please open WhatsApp and send a simple "Hi" message to +1 (555) 159-4613 first to open the customer service window, then try again!');
  }

  // 2. Send Interactive Quick Reply Buttons
  console.log('\n--- 2. Sending Interactive Study Action Buttons ---');
  const buttons = [
    { id: 'start_quiz', title: 'Start Quiz 📝' },
    { id: 'play_podcast', title: 'Play Podcast 🎧' }
  ];
  const btnReport = await provider.sendInteractiveButtonMessage(recipient, 'Choose a study action to begin:', buttons);
  console.log('Buttons Success:', btnReport.success);
  if (btnReport.success) {
    console.log('✅ Message SID:', btnReport.messageId);
  } else {
    console.error('❌ Buttons Error:', btnReport.error);
  }

  // 3. Send Media (PDF Notes)
  console.log('\n--- 3. Sending PDF Study Guide ---');
  const pdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
  const mediaReport = await provider.sendMediaMessage(recipient, 'document', pdfUrl, 'Here is your quick study revision guide!', 'Organic_Chemistry_Guide.pdf');
  console.log('Media Success:', mediaReport.success);
  if (mediaReport.success) {
    console.log('✅ Message SID:', mediaReport.messageId);
  } else {
    console.error('❌ Media Error:', mediaReport.error);
  }

  process.exit(0);
}

main().catch(console.error);
