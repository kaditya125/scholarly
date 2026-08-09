import { Queue } from 'bullmq';
import { env } from '../config/env';

async function checkQueue() {
  const connection = { url: env.REDIS_URL || 'redis://localhost:6379' };
  const queue = new Queue('background-jobs', { connection });

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ]);

    console.log('--- Background Job Queue Status ---');
    console.log(`Connection: ${connection.url}`);
    console.log(`Queue Name: ${queue.name}`);
    console.log('-----------------------------------');
    console.log(`Waiting:   ${waiting}`);
    console.log(`Active:    ${active}`);
    console.log(`Completed: ${completed}`);
    console.log(`Failed:    ${failed}`);
    console.log(`Delayed:   ${delayed}`);
    console.log('-----------------------------------');

    if (failed > 0) {
      console.log('Recent Failed Jobs:');
      const failedJobs = await queue.getFailed(0, 5);
      for (const job of failedJobs) {
        console.log(`- Job ${job.id} (${job.name}): ${job.failedReason}`);
      }
    }

  } catch (err: any) {
    console.error('Error connecting to BullMQ / Redis:', err.message);
  } finally {
    await queue.close();
    process.exit(0);
  }
}

checkQueue();
