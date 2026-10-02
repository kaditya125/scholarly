/**
 * Steps in a wave run in parallel, so two events can be emitted at once. If the slower write
 * published second, a live subscriber would see seq 9 before seq 8 — and a client tracking a
 * high-water mark drops the late one for good (observed live: event 8 missing from the stream).
 */
import { AgentEmitter } from '../../../src/agents/runtime/AgentEmitter';
import { AgentEventHub } from '../../../src/agents/runtime/AgentEventHub';
import { delay } from './helpers';

function rig(writeDelays: Record<number, number> = {}) {
  const persisted: number[] = [];
  const published: number[] = [];
  const store: any = {
    appendEvent: jest.fn(async (e: any) => {
      await delay(writeDelays[e.seq] ?? 0);
      persisted.push(e.seq);
    }),
  };
  const hub = new AgentEventHub();
  hub.subscribe('run-1', (e) => published.push(e.seq));
  return { emitter: new AgentEmitter(store, hub, 'run-1', 0), persisted, published, store };
}

describe('AgentEmitter', () => {
  it('publishes concurrent events in sequence order even when the first write is slowest', async () => {
    const { emitter, persisted, published } = rig({ 1: 40, 2: 5, 3: 0 });
    await Promise.all([
      emitter.emit('agent.step.started', { stepId: 'a' }),
      emitter.emit('agent.step.started', { stepId: 'b' }),
      emitter.emit('agent.tool.started', { stepId: 'a' }),
    ]);
    expect(published).toEqual([1, 2, 3]);
    // Writes are deliberately concurrent, so they may COMPLETE in any order — replay reads them
    // back ordered by seq. Only delivery to live subscribers has to be ordered.
    expect(persisted.sort()).toEqual([1, 2, 3]);
  });

  it('overlaps the writes rather than queueing them, so ordering costs the slowest, not the sum', async () => {
    const { emitter } = rig({ 1: 60, 2: 60, 3: 60 });
    const startedAt = Date.now();
    await Promise.all([emitter.emit('agent.step.started'), emitter.emit('agent.step.started'), emitter.emit('agent.tool.started')]);
    expect(Date.now() - startedAt).toBeLessThan(150); // serialised would be ~180ms+
  });

  it('assigns every concurrent emit a distinct sequence number', async () => {
    const { emitter } = rig();
    const events = await Promise.all(Array.from({ length: 12 }, () => emitter.emit('agent.step.completed')));
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(emitter.lastSeq).toBe(12);
  });

  it('keeps the run going, and the order intact, when a write fails', async () => {
    const { emitter, published, store } = rig();
    store.appendEvent.mockRejectedValueOnce(new Error('firestore unavailable'));
    await Promise.all([emitter.emit('agent.step.started'), emitter.emit('agent.step.completed')]);
    expect(published).toEqual([1, 2]); // the failed write is still delivered live
  });
});
