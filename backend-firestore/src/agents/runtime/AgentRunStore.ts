import { logger } from '../../utils/logger';
import { AgentEvent, AgentRunDoc, ACTIVE_RUN_STATUSES, ToolCallRecord } from './agent.types';

/**
 * Persistence for agent runs. Firestore is the source of truth, so a run survives a dropped SSE
 * connection, a page refresh and (as `failed: interrupted`) a process restart.
 *
 * Layout (backend-only; firestore.rules' catch-all denies all client access):
 *   agent_runs/{runId}                      run state (AgentRunDoc)
 *   agent_runs/{runId}/events/{seq:08d}     replayable AgentEvent stream
 *   agent_runs/{runId}/tool_calls/{id}      one ToolCallRecord per attempt
 *   agent_runs/{runId}/step_outputs/{stepId} size-capped JSON of each step's output
 */
export interface AgentRunStore {
  createRun(doc: AgentRunDoc): Promise<void>;
  getRun(runId: string): Promise<AgentRunDoc | null>;
  updateRun(runId: string, patch: Partial<AgentRunDoc>): Promise<void>;
  appendEvent(event: AgentEvent): Promise<void>;
  listEvents(runId: string, afterSeq: number, limit?: number): Promise<AgentEvent[]>;
  recordToolCalls(runId: string, calls: ToolCallRecord[]): Promise<void>;
  saveStepOutput(runId: string, stepId: string, output: unknown): Promise<void>;
  listRunsForUser(userId: string, limit: number): Promise<AgentRunDoc[]>;
  findActiveRuns(limit: number): Promise<AgentRunDoc[]>;
}

export const MAX_STEP_OUTPUT_CHARS = 200_000;
export const MAX_RESULT_DATA_CHARS = 100_000;

/** Firestore rejects `undefined`; drop such keys recursively. Arrays keep their positions. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

/** Serialise an output for storage, capping its size and saying so when truncated. */
export function capJson(value: unknown, maxChars: number): { json: string; truncated: boolean } {
  let json: string;
  try {
    json = JSON.stringify(value ?? null);
  } catch {
    json = JSON.stringify({ unserializable: true });
  }
  if (json.length <= maxChars) return { json, truncated: false };
  return { json: json.slice(0, maxChars), truncated: true };
}

const seqId = (seq: number) => String(seq).padStart(8, '0');

export class FirestoreAgentRunStore implements AgentRunStore {
  private get db() {
    // Lazy: importing the runtime must not initialise Firebase (unit tests, non-agent processes).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../config/firebase').db as FirebaseFirestore.Firestore;
  }

  private runs() {
    return this.db.collection('agent_runs');
  }

  async createRun(doc: AgentRunDoc): Promise<void> {
    await this.runs().doc(doc.runId).create(stripUndefined(doc));
  }

  async getRun(runId: string): Promise<AgentRunDoc | null> {
    const snap = await this.runs().doc(runId).get();
    return snap.exists ? (snap.data() as AgentRunDoc) : null;
  }

  async updateRun(runId: string, patch: Partial<AgentRunDoc>): Promise<void> {
    await this.runs().doc(runId).set(stripUndefined({ ...patch, updatedAt: Date.now() }), { merge: true });
  }

  async appendEvent(event: AgentEvent): Promise<void> {
    await this.runs().doc(event.runId).collection('events').doc(seqId(event.seq)).set(stripUndefined(event));
  }

  async listEvents(runId: string, afterSeq: number, limit = 500): Promise<AgentEvent[]> {
    const snap = await this.runs()
      .doc(runId)
      .collection('events')
      .where('seq', '>', afterSeq)
      .orderBy('seq', 'asc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data() as AgentEvent);
  }

  async recordToolCalls(runId: string, calls: ToolCallRecord[]): Promise<void> {
    if (calls.length === 0) return;
    const batch = this.db.batch();
    for (const call of calls) {
      batch.set(this.runs().doc(runId).collection('tool_calls').doc(call.id), stripUndefined(call));
    }
    await batch.commit();
  }

  async saveStepOutput(runId: string, stepId: string, output: unknown): Promise<void> {
    const { json, truncated } = capJson(output, MAX_STEP_OUTPUT_CHARS);
    await this.runs().doc(runId).collection('step_outputs').doc(stepId).set({ stepId, json, truncated, savedAt: Date.now() });
  }

  async listRunsForUser(userId: string, limit: number): Promise<AgentRunDoc[]> {
    // Newest-first in the query, so a student with more runs than the page size still sees their
    // latest ones. Needs the (userId ASC, createdAt DESC) composite index in firestore.indexes.json.
    try {
      const snap = await this.runs().where('userId', '==', userId).orderBy('createdAt', 'desc').limit(limit).get();
      return snap.docs.map((d) => d.data() as AgentRunDoc);
    } catch (e: any) {
      // FAILED_PRECONDITION (gRPC 9) means that index is not deployed yet. Fall back to an
      // equality-only read sorted in memory: correct for typical run counts, and it degrades to
      // "may miss the very newest" only past the fetch window — better than failing the request.
      const missingIndex = e?.code === 9 || /index/i.test(String(e?.message ?? ''));
      if (!missingIndex) throw e;
      logger.warn('[agent] agent_runs (userId, createdAt) index missing — falling back to in-memory ordering', {
        userId,
      });
      const snap = await this.runs().where('userId', '==', userId).limit(Math.max(limit * 3, 50)).get();
      return snap.docs
        .map((d) => d.data() as AgentRunDoc)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    }
  }

  async findActiveRuns(limit: number): Promise<AgentRunDoc[]> {
    const snap = await this.runs().where('status', 'in', [...ACTIVE_RUN_STATUSES]).limit(limit).get();
    return snap.docs.map((d) => d.data() as AgentRunDoc);
  }
}

/** Test double with the same semantics (ordering, merge-patching, size capping). */
export class InMemoryAgentRunStore implements AgentRunStore {
  readonly runsById = new Map<string, AgentRunDoc>();
  readonly events = new Map<string, AgentEvent[]>();
  readonly toolCalls = new Map<string, ToolCallRecord[]>();
  readonly stepOutputs = new Map<string, Map<string, { json: string; truncated: boolean }>>();

  async createRun(doc: AgentRunDoc): Promise<void> {
    if (this.runsById.has(doc.runId)) throw new Error(`run ${doc.runId} already exists`);
    this.runsById.set(doc.runId, JSON.parse(JSON.stringify(stripUndefined(doc))));
  }

  async getRun(runId: string): Promise<AgentRunDoc | null> {
    const run = this.runsById.get(runId);
    return run ? JSON.parse(JSON.stringify(run)) : null;
  }

  async updateRun(runId: string, patch: Partial<AgentRunDoc>): Promise<void> {
    const run = this.runsById.get(runId);
    if (!run) throw new Error(`run ${runId} not found`);
    this.runsById.set(runId, { ...run, ...JSON.parse(JSON.stringify(stripUndefined(patch))), updatedAt: Date.now() });
  }

  async appendEvent(event: AgentEvent): Promise<void> {
    const list = this.events.get(event.runId) ?? [];
    list.push(JSON.parse(JSON.stringify(stripUndefined(event))));
    this.events.set(event.runId, list);
  }

  async listEvents(runId: string, afterSeq: number, limit = 500): Promise<AgentEvent[]> {
    return (this.events.get(runId) ?? [])
      .filter((e) => e.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit);
  }

  async recordToolCalls(runId: string, calls: ToolCallRecord[]): Promise<void> {
    const list = this.toolCalls.get(runId) ?? [];
    list.push(...calls);
    this.toolCalls.set(runId, list);
  }

  async saveStepOutput(runId: string, stepId: string, output: unknown): Promise<void> {
    const byStep = this.stepOutputs.get(runId) ?? new Map();
    byStep.set(stepId, capJson(output, MAX_STEP_OUTPUT_CHARS));
    this.stepOutputs.set(runId, byStep);
  }

  async listRunsForUser(userId: string, limit: number): Promise<AgentRunDoc[]> {
    return [...this.runsById.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async findActiveRuns(limit: number): Promise<AgentRunDoc[]> {
    return [...this.runsById.values()].filter((r) => ACTIVE_RUN_STATUSES.includes(r.status)).slice(0, limit);
  }
}
