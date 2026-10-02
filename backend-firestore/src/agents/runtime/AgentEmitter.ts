import { logger } from '../../utils/logger';
import { AgentEvent, AgentEventType } from './agent.types';
import { AgentEventHub } from './AgentEventHub';
import { AgentRunStore } from './AgentRunStore';

/**
 * Emits a run's events: assigns the next `seq`, persists the event (so it can be replayed), then
 * publishes it live. One emitter per executing run — the run's lease guarantees a single writer,
 * so a local counter is enough for a monotonic sequence.
 */
export class AgentEmitter {
  private seq: number;
  /** Serialises persistence + publication so they happen in `seq` order (see `emit`). */
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: AgentRunStore,
    private readonly hub: AgentEventHub,
    private readonly runId: string,
    startSeq = 0,
  ) {
    this.seq = startSeq;
  }

  get lastSeq(): number {
    return this.seq;
  }

  async emit(
    type: AgentEventType,
    fields: { label?: string; stepId?: string; tool?: string; data?: Record<string, unknown> } = {},
  ): Promise<AgentEvent> {
    const event: AgentEvent = { runId: this.runId, seq: ++this.seq, type, ts: Date.now(), ...fields };
    // Steps in a wave run in parallel, so two emits can be in flight at once. Without ordering,
    // the faster write publishes first and a subscriber sees seq 9 before seq 8.
    //
    // The write STARTS now (concurrently with any in-flight ones) and only the publish waits its
    // turn: ordering costs the slowest write, not the sum of them. Serialising the writes too made
    // a cancellation take 8 s instead of ~1 s, because every queued event added a round trip.
    const persisted = this.store.appendEvent(event).catch((e: any) => {
      // A lost event must not kill the run; the live subscriber still gets it and the run doc
      // keeps the authoritative state.
      logger.warn('[agent] event persistence failed', { runId: this.runId, seq: event.seq, type, error: String(e?.message ?? e) });
    });
    const delivery = this.tail.then(async () => {
      await persisted;
      this.hub.publish(event);
    });
    this.tail = delivery.catch(() => undefined);
    await delivery;
    return event;
  }
}
