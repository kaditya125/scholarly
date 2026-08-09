import { BackgroundQueue } from '../core/workflow/jobs/BackgroundQueue';
import { BackgroundWorker } from '../core/workflow/jobs/BackgroundWorker';

async function testQueue() {
  console.log('Starting Queue Test...');

  // Initialize the worker and queue
  const queue = new BackgroundQueue();
  const worker = new BackgroundWorker();
  console.log('Worker initialized. Adding a test job to the queue...');

  // Enqueue a generic test job
  await queue.enqueueGeneric('test-job', { timestamp: Date.now(), message: 'Hello BullMQ!' });

  console.log('Job enqueued. Waiting 3 seconds for the worker to process it...');
  
  // Wait for 3 seconds to let the worker pick it up and process it
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Test complete. Shutting down worker...');
  await worker.close();
  process.exit(0);
}

testQueue().catch(err => {
  console.error('Queue test failed:', err);
  process.exit(1);
});
