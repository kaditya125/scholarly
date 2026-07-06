import { EventEmitter } from 'events';

export const eventBus = new EventEmitter();

export const EventNames = {
  TEST_COMPLETED: 'TEST_COMPLETED',
  TASK_COMPLETED: 'TASK_COMPLETED',
};
