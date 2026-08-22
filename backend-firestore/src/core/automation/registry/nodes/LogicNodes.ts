/**
 * @file LogicNodes.ts
 * @description Safe conditional branching and logic nodes for Scholarly Automation Studio.
 */

import { z } from 'zod';
import { WorkflowNodeHandler } from '../WorkflowNodeRegistry';
import { WorkflowExecutionContext } from '../../types/workflow.types';

function extractNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  if (obj[path] !== undefined) return obj[path];

  const parts = path.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined) return undefined;
    curr = curr[part];
  }
  return curr;
}

export const ConditionIfNode: WorkflowNodeHandler = {
  type: 'CONDITION_IF',
  category: 'Logic',
  label: 'IF Condition',
  description: 'Evaluates a safe boolean condition to branch workflow execution.',
  icon: 'GitBranch',
  configSchema: z.object({
    field: z.string().min(1),
    operator: z.enum(['equals', 'not_equals', 'less_than', 'greater_than', 'less_than_or_equal', 'greater_than_or_equal', 'contains', 'in']),
    value: z.unknown()
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    result: z.boolean(),
    evaluatedField: z.string(),
    actualValue: z.unknown(),
    targetValue: z.unknown()
  }),
  validateConfig(config) {
    if (!config.field) {
      return { valid: false, errors: ['field is required.'] };
    }
    return { valid: true };
  },
  async execute(_ctx: WorkflowExecutionContext, config, input) {
    const actual = extractNestedValue(input, config.field);
    const target = config.value;
    let result = false;

    switch (config.operator) {
      case 'equals':
        result = actual === target;
        break;
      case 'not_equals':
        result = actual !== target;
        break;
      case 'less_than':
        result = Number(actual) < Number(target);
        break;
      case 'greater_than':
        result = Number(actual) > Number(target);
        break;
      case 'less_than_or_equal':
        result = Number(actual) <= Number(target);
        break;
      case 'greater_than_or_equal':
        result = Number(actual) >= Number(target);
        break;
      case 'contains':
        result = typeof actual === 'string' && actual.includes(String(target));
        break;
      case 'in':
        result = Array.isArray(target) && target.includes(actual);
        break;
      default:
        result = false;
    }

    return {
      result,
      evaluatedField: config.field,
      actualValue: actual,
      targetValue: target
    };
  }
};

export const FilterListNode: WorkflowNodeHandler = {
  type: 'FILTER_LIST',
  category: 'Logic',
  label: 'Filter List',
  description: 'Filters a list of items based on property threshold or match.',
  icon: 'Filter',
  configSchema: z.object({
    arrayField: z.string().min(1),
    itemField: z.string().min(1),
    operator: z.enum(['equals', 'not_equals', 'less_than', 'greater_than']),
    value: z.unknown()
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    filteredItems: z.array(z.unknown()),
    originalCount: z.number(),
    filteredCount: z.number()
  }),
  validateConfig(config) {
    if (!config.arrayField || !config.itemField) {
      return { valid: false, errors: ['arrayField and itemField are required.'] };
    }
    return { valid: true };
  },
  async execute(_ctx: WorkflowExecutionContext, config, input) {
    const rawList = extractNestedValue(input, config.arrayField);
    if (!Array.isArray(rawList)) {
      return {
        filteredItems: [],
        originalCount: 0,
        filteredCount: 0
      };
    }

    const filtered = rawList.filter(item => {
      const actual = extractNestedValue(item, config.itemField);
      const target = config.value;
      switch (config.operator) {
        case 'equals':
          return actual === target;
        case 'not_equals':
          return actual !== target;
        case 'less_than':
          return Number(actual) < Number(target);
        case 'greater_than':
          return Number(actual) > Number(target);
        default:
          return true;
      }
    });

    return {
      filteredItems: filtered,
      originalCount: rawList.length,
      filteredCount: filtered.length
    };
  }
};
