/**
 * @file DataNodes.ts
 * @description Data transformation and variable setting nodes for Scholarly Automation Studio.
 */

import { z } from 'zod';
import { WorkflowNodeHandler } from '../WorkflowNodeRegistry';
import { WorkflowExecutionContext } from '../../types/workflow.types';

export const SetVariableNode: WorkflowNodeHandler = {
  type: 'SET_VARIABLE',
  category: 'Data',
  label: 'Set Variable',
  description: 'Sets or updates a workflow execution variable.',
  icon: 'Database',
  configSchema: z.object({
    variableName: z.string().min(1),
    value: z.unknown()
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    variableName: z.string(),
    value: z.unknown()
  }),
  validateConfig(config) {
    if (!config.variableName) {
      return { valid: false, errors: ['variableName is required.'] };
    }
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config) {
    ctx.variables[config.variableName] = config.value;
    return {
      variableName: config.variableName,
      value: config.value
    };
  }
};

export const ExtractFieldNode: WorkflowNodeHandler = {
  type: 'EXTRACT_FIELD',
  category: 'Data',
  label: 'Extract Field',
  description: 'Extracts a specific nested field from prior node output.',
  icon: 'Scissors',
  configSchema: z.object({
    sourcePath: z.string().min(1),
    outputKey: z.string().default('extractedValue')
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  validateConfig(config) {
    if (!config.sourcePath) {
      return { valid: false, errors: ['sourcePath is required.'] };
    }
    return { valid: true };
  },
  async execute(_ctx: WorkflowExecutionContext, config, input) {
    const parts = config.sourcePath.split('.');
    let curr: any = input;
    for (const part of parts) {
      if (curr === null || curr === undefined) break;
      curr = curr[part];
    }

    return {
      [config.outputKey || 'extractedValue']: curr
    };
  }
};
