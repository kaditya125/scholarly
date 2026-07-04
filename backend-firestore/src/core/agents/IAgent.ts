import { WorkflowRequest } from '../workflow/WorkflowEngine';

export interface AgentContext {
  request: WorkflowRequest;
  retrievedContext: string;
  sharedState: Record<string, any>; // For passing data (drafts, verification reports) between agents
}

export interface IAgent {
  name: string;
  description: string;

  /**
   * Executes the agent's core responsibility.
   * Agents communicate by reading from and writing to context.sharedState.
   */
  execute(context: AgentContext): Promise<void>;

  /**
   * For the final agent in the chain that formats the output to the user.
   */
  executeStream?(context: AgentContext): AsyncGenerator<string, void, unknown>;
}
