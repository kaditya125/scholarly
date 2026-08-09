import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';

async function main() {
  console.log('=== DIRECT ROUTER TEST ===');

  // Disable workers before bootstrap
  process.env.DISABLE_WORKERS = 'true';
  bootstrapDI();

  // Mock background queue
  const { backgroundQueue } = await import('../core/workflow/jobs/BackgroundQueue');
  backgroundQueue.enqueueWorkflowPostExecution = async () => {};
  backgroundQueue.enqueueSessionGenerateTitle = async () => {};
  backgroundQueue.enqueueGeneric = async () => {};
  backgroundQueue.enqueueMediaJob = async () => {};
  backgroundQueue.enqueueNotification = async () => {};

  const { WhatsAppConversationRouter } = await import('../core/whatsapp/WhatsAppConversationRouter');
  const provider = container.resolve<any>(TOKENS.WhatsAppProvider);
  const router = new WhatsAppConversationRouter();

  const phone = '+919102202267';
  const name = 'Aditya';

  console.log(`\nSending "hi" from ${phone}...`);
  await router.routeMessage(phone, name, 'hi');
  console.log('Done! Check your WhatsApp.');

  await new Promise(r => setTimeout(r, 2000));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
export {};
