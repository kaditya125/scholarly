/**
 * @file WorkflowNodeRegistry.ts
 * @description Central typed registry for all supported workflow nodes in Scholarly Automation Studio.
 */

import { z } from 'zod';
import { NodeCategory, WorkflowExecutionContext } from '../types/workflow.types';
import { logger } from '../../../utils/logger';

export interface WorkflowNodeHandler<TConfig = any, TInput = any, TOutput = any> {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon?: string;
  configSchema: z.ZodType<TConfig>;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  permissions?: string[];
  requiresStudent?: boolean;
  requiresExamContext?: boolean;
  requiresCanonicalContext?: boolean;
  producesExternalSideEffect?: boolean;
  supportsSimulation?: boolean;

  validateConfig(config: TConfig): { valid: boolean; errors?: string[] };
  execute(ctx: WorkflowExecutionContext, config: TConfig, input: TInput): Promise<TOutput>;
}

export interface NodeCatalogItem {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon?: string;
  requiresStudent: boolean;
  requiresExamContext: boolean;
  requiresCanonicalContext: boolean;
  producesExternalSideEffect: boolean;
  supportsSimulation: boolean;
  configSchemaJson?: Record<string, unknown>;
}

export class WorkflowNodeRegistry {
  private handlers = new Map<string, WorkflowNodeHandler>();

  /**
   * Register a typed workflow node handler.
   */
  public register(handler: WorkflowNodeHandler): void {
    if (this.handlers.has(handler.type)) {
      logger.warn(`[WorkflowNodeRegistry] Overwriting existing handler for type: "${handler.type}"`);
    }
    this.handlers.set(handler.type, handler);
    logger.info(`[WorkflowNodeRegistry] Registered node handler: "${handler.type}" [${handler.category}]`);
  }

  /**
   * Retrieve a registered node handler by type.
   */
  public getNode(type: string): WorkflowNodeHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * List all registered handlers.
   */
  public listNodes(): WorkflowNodeHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Validate configuration for a specific node type.
   */
  public validateNodeConfig(type: string, config: unknown): { valid: boolean; errors?: string[] } {
    const handler = this.handlers.get(type);
    if (!handler) {
      return {
        valid: false,
        errors: [`Unknown node type: "${type}". No handler is registered.`]
      };
    }

    const parseResult = handler.configSchema.safeParse(config);
    if (!parseResult.success) {
      return {
        valid: false,
        errors: parseResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }

    return handler.validateConfig(parseResult.data);
  }

  /**
   * Export the catalog for the frontend visual builder.
   */
  public getCatalog(): NodeCatalogItem[] {
    return Array.from(this.handlers.values()).map(handler => ({
      type: handler.type,
      category: handler.category,
      label: handler.label,
      description: handler.description,
      icon: handler.icon,
      requiresStudent: !!handler.requiresStudent,
      requiresExamContext: !!handler.requiresExamContext,
      requiresCanonicalContext: !!handler.requiresCanonicalContext,
      producesExternalSideEffect: !!handler.producesExternalSideEffect,
      supportsSimulation: handler.supportsSimulation !== false
    }));
  }
}

export const workflowNodeRegistry = new WorkflowNodeRegistry();
