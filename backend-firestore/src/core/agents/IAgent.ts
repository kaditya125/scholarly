import { WorkflowRequest } from '../workflow/WorkflowEngine';
import { StudentContext } from '../../types/studentContext.types';

export interface AgentContext {
  request: WorkflowRequest;
  retrievedContext: string;
  sharedState: Record<string, any>; // For passing data (drafts, verification reports) between agents
  studentContext?: StudentContext; // Full student profile, memory, analytics for personalization
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
