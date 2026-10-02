import { EventEmitter } from 'events';
import { AgentEvent } from './agent.types';

/**
 * In-process live fan-out of agent events. Persistence is the store's job; this only lets an open
 * SSE connection see an event the moment the executor emits it instead of waiting for the next
 * Firestore poll. Subscribers must tolerate duplicates (they de-duplicate by `seq`).
 */
export class AgentEventHub {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One listener per open SSE connection; runs are short-lived, so a generous cap is fine.
    this.emitter.setMaxListeners(500);
  }

  publish(event: AgentEvent): void {
    this.emitter.emit(event.runId, event);
  }

  subscribe(runId: string, listener: (event: AgentEvent) => void): () => void {
    this.emitter.on(runId, listener);
    return () => this.emitter.off(runId, listener);
  }

  listenerCount(runId: string): number {
    return this.emitter.listenerCount(runId);
  }
}

export const agentEventHub = new AgentEventHub();
