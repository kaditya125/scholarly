/**
 * @file FlowNodes.ts
 * @description Flow control and durable waiting nodes for Scholarly Automation Studio.
 */

import { z } from 'zod';
import { WorkflowNodeHandler } from '../WorkflowNodeRegistry';
import { WorkflowExecutionContext } from '../../types/workflow.types';

export const FlowWaitNode: WorkflowNodeHandler = {
  type: 'FLOW_WAIT',
  category: 'Flow',
  label: 'Wait / Delay',
  description: 'Durable execution delay that safely pauses workflow across process restarts.',
  icon: 'Clock',
  configSchema: z.object({
    durationMinutes: z.number().int().positive().default(1440), // 24 hours default
    reason: z.string().optional()
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    waiting: z.boolean(),
    durationMinutes: z.number(),
    resumeAt: z.number()
  }),
  validateConfig(config) {
    if (!config.durationMinutes || config.durationMinutes <= 0) {
      return { valid: false, errors: ['durationMinutes must be greater than 0.'] };
    }
    return { valid: true };
  },
  async execute(_ctx: WorkflowExecutionContext, config) {
    const durationMs = (config.durationMinutes ?? 1440) * 60 * 1000;
    const resumeAt = Date.now() + durationMs;

    return {
      waiting: true,
      durationMinutes: config.durationMinutes ?? 1440,
      resumeAt
    };
  }
};
