import { bootstrapDI } from '../core/di/registry';
import { eventBus, EventBus } from '../core/events/EventBus';

async function main() {
  console.log('--- Verifying Redis Distributed EventBus (Priority 10) ---');
  
  bootstrapDI();

  // Client A is the default eventBus singleton.
  // Let's create Client B to act as a second distributed node.
  console.log('Initializing Client B (distributed node)...');
  const clientB = new EventBus();
  
  // Wait a short time for Redis connections to settle
  await new Promise(resolve => setTimeout(resolve, 2000));

  let eventReceived = false;
  let receivedPayload: any = null;

  // Client B subscribes to event
  clientB.subscribe('podcast.completed', (payload) => {
    console.log('[Client B] Distributed event received!', payload);
    eventReceived = true;
    receivedPayload = payload;
  });

  console.log('Client A publishing "podcast.completed" event...');
  const testPayload = {
    podcastId: 'pod_dist_999',
    userId: 'user_dist_888',
    durationMs: 360000
  };

  await eventBus.publish('podcast.completed', testPayload);
  
  // Wait for propagation over Redis network
  console.log('Waiting for Redis pub/sub propagation...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Cleanup connections
  await eventBus.close();
  await clientB.close();

  if (eventReceived && receivedPayload?.podcastId === 'pod_dist_999') {
    console.log('\n✅ distributed EventBus verification PASSED!');
    process.exit(0);
  } else {
    console.error('\n❌ distributed EventBus verification FAILED! Client B did not receive the event.');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Verification crashed:', e);
  process.exit(1);
});
