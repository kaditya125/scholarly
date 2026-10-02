import { logger } from '../utils/logger';
import { AgentRunDoc } from './runtime/agent.types';
import { agentEventHub } from './runtime/AgentEventHub';
import { AgentRuntime } from './runtime/AgentRuntime';
import { FirestoreAgentRunStore } from './runtime/AgentRunStore';
import { ToolExecutor, getDefaultToolRegistry } from './tools';
import { createDefaultWorkflowRegistry } from './workflows';

/**
 * Production wiring for Agent mode. Everything is created lazily on first use, so importing this
 * module (e.g. from WorkflowEngine's AGENT branch) costs nothing while AGENT_MODE_ENABLED is off.
 */

let runtime: AgentRuntime | null = null;
let recovery: Promise<void> | null = null;

/**
 * Posts a finished run's summary into the chat session it came from, so the conversation history
 * reads naturally. The session must still exist and still belong to the run's owner.
 */
async function postRunSummaryToChat(run: AgentRunDoc): Promise<void> {
  if (!run.sessionId) return;
  const content = run.result?.summary || run.error?.message;
  if (!content) return;
  const { ChatRepository, isForeignSession } = await import('../repositories/chat.repository');
  const repo = new ChatRepository();
  const session = await repo.getSession(run.sessionId);
  if (!session || isForeignSession(session as any, run.userId)) return;
  // `agentRunSummary` lets the chat hide this message when the run's card (attached to the
  // "On it" reply) already shows the same summary; the model still sees it as history.
  const message = { role: 'ai', content, timestamp: Date.now(), agentRunId: run.runId, agentRunSummary: true };
  await repo.saveMessage(run.sessionId, message as any);
}

export function getAgentRuntime(): AgentRuntime {
  if (!runtime) {
    const registry = getDefaultToolRegistry();
    runtime = new AgentRuntime({
      store: new FirestoreAgentRunStore(),
      registry,
      toolExecutor: new ToolExecutor(registry),
      hub: agentEventHub,
      workflows: createDefaultWorkflowRegistry(),
      quota: {
        async consumeAgentRun(userId: string) {
          const { usageService } = await import('../services/usage.service');
          await usageService.consumeQuota(userId, 'agentRuns', 1);
        },
      },
      onRunFinished: postRunSummaryToChat,
    });
  }
  return runtime;
}

/** Marks runs orphaned by a previous process as failed — once per process, on first agent use. */
export function ensureAgentRecovery(): Promise<void> {
  if (!recovery) {
    recovery = getAgentRuntime()
      .recoverInterruptedRuns()
      .then(() => undefined)
      .catch((e) => {
        logger.warn('[agent] recovery scan failed', { error: String(e?.message ?? e) });
      });
  }
  return recovery;
}

export { AgentRuntime, AgentRunError, toPublicRun, isTerminal } from './runtime/AgentRuntime';
export { routeGoal } from './runtime/GoalRouter';
export * from './runtime/agent.types';
