/**
 * @file TriggerNodes.ts
 * @description Trigger node implementations for Scholarly Automation Studio.
 */

import { z } from 'zod';
import { WorkflowNodeHandler } from '../WorkflowNodeRegistry';
import { WorkflowExecutionContext } from '../../types/workflow.types';

export const EventTriggerNode: WorkflowNodeHandler = {
  type: 'TRIGGER_EVENT',
  category: 'Trigger',
  label: 'Event Trigger',
  description: 'Starts workflow when a matching platform or educational event occurs.',
  icon: 'Zap',
  configSchema: z.object({
    eventType: z.string().min(1),
    filterCondition: z
      .object({
        field: z.string(),
        operator: z.enum(['equals', 'not_equals', 'less_than', 'greater_than', 'contains', 'in']),
        value: z.unknown()
      })
      .optional()
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    eventType: z.string(),
    payload: z.record(z.unknown()),
    timestamp: z.number()
  }),
  validateConfig(config) {
    if (!config.eventType) {
      return { valid: false, errors: ['eventType is required'] };
    }
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config, input) {
    return {
      eventType: config.eventType,
      payload: ctx.triggerEvent || input || {},
      timestamp: Date.now()
    };
  }
};

export const ManualTriggerNode: WorkflowNodeHandler = {
  type: 'TRIGGER_MANUAL',
  category: 'Trigger',
  label: 'Manual Trigger',
  description: 'Triggered manually by an administrator or teacher for testing or immediate execution.',
  icon: 'Play',
  configSchema: z.object({
    allowStudentOverride: z.boolean().default(true)
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    triggeredBy: z.string(),
    studentId: z.string().optional(),
    timestamp: z.number()
  }),
  validateConfig() {
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext) {
    return {
      triggeredBy: ctx.organizationId || ctx.teacherId || 'admin',
      studentId: ctx.studentId,
      timestamp: Date.now()
    };
  }
};

export const ScheduleTriggerNode: WorkflowNodeHandler = {
  type: 'TRIGGER_SCHEDULE',
  category: 'Trigger',
  label: 'Schedule Trigger',
  description: 'Executes automatically on a recurring cron or interval schedule.',
  icon: 'Calendar',
  configSchema: z.object({
    cronExpression: z.string().optional(),
    intervalMinutes: z.number().int().positive().optional(),
    timezone: z.string().default('Asia/Kolkata')
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    scheduledExecutionTime: z.number(),
    timezone: z.string()
  }),
  validateConfig(config) {
    if (!config.cronExpression && !config.intervalMinutes) {
      return { valid: false, errors: ['Either cronExpression or intervalMinutes must be specified.'] };
    }
    return { valid: true };
  },
  async execute(_ctx: WorkflowExecutionContext, config) {
    return {
      scheduledExecutionTime: Date.now(),
      timezone: config.timezone || 'Asia/Kolkata'
    };
  }
};
