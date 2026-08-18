import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';
import { db } from '../config/firebase';
import { IWhatsAppProvider } from '../core/notifications/providers/WhatsAppProvider';

async function main() {
  console.log('=== INITIATING REAL WHATSAPP STUDENT SIMULATION ===');
  bootstrapDI();

  // Mock background queue to prevent Upstash Redis limit crashes
  const { backgroundQueue } = await import('../core/workflow/jobs/BackgroundQueue');
  backgroundQueue.enqueueWorkflowPostExecution = async () => {};
  backgroundQueue.enqueueSessionGenerateTitle = async () => {};
  backgroundQueue.enqueueGeneric = async () => {};
  backgroundQueue.enqueueMediaJob = async () => {};
  backgroundQueue.enqueueNotification = async () => {};

  const provider = container.resolve<IWhatsAppProvider>(TOKENS.WhatsAppProvider);
  const recipient = '+919102202267';

  // 1. Send Welcome Message & Interactive Buttons
  const greeting = `Hi Aditya! 🎓 Welcome to *Sadhya AI*.\n\nI am your AI study companion. How would you like to continue learning today?\n\n*Interactive Options:*`;
  const buttons = [
    { id: 'start_quiz', title: 'Start Quiz 📝' },
    { id: 'play_podcast', title: 'Play Podcast 🎧' }
  ];

  console.log('Sending greeting & interactive menu...');
  const res1 = await provider.sendInteractiveButtonMessage(recipient, greeting, buttons);
  console.log('Send Menu Status:', res1);

  // 2. Send instruction message explaining the E2E simulation steps
  const instructions = `🤖 *Sadhya AI Simulation Console:*\n\nI have initialized your learning session! Please try the following steps on your phone:\n\n1️⃣ Tap *Start Quiz 📝* or reply *quiz* to begin a stateful quiz.\n2️⃣ Answer the quiz questions by replying with the numbers (e.g. *1*, *2*, *3*).\n3️⃣ Send any doubt question (e.g. *What is Chemical Kinetics?*) to test the GraphRAG notebook search.\n4️⃣ Upload a photo/screenshot of a textbook question to test the OCR Vision solver.\n5️⃣ Send a PDF document to test indexing.\n\nLet me know in the console once you have completed these steps!`;
  
  console.log('Sending simulation steps instructions...');
  const res2 = await provider.sendTextMessage(recipient, instructions);
  console.log('Send Instructions Status:', res2);

  console.log('=== INITIALIZATION Dispatched! ===');
  process.exit(0);
}

main().catch(console.error);

export {};
