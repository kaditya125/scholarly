/**
 * Student Mastery Model (Task 6) — tracks per-concept mastery so the tutor can adapt depth,
 * reinforce weak prerequisites, and measure learning gain over time. Mastery is keyed by a
 * normalized concept slug (derived from the knowledge-graph concept label) with a readable title.
 *
 * The update math is PURE (`applyEvent`) and unit-tested; persistence is a guarded, injectable
 * store. Reads/updates run off the critical path (background) behind the `mastery` flag, so with
 * the flag off nothing about the current pipeline changes.
 */
export type MasteryEvent = 'quiz_correct' | 'quiz_incorrect' | 'chat' | 'mistake' | 'followup' | 'revision';

export type MasteryTrend = 'improving' | 'declining' | 'steady';

export interface ConceptMastery {
  conceptId: string;          // normalized slug
  title: string;              // human-readable label
  /**
   * Hierarchy for rolling concept-level evidence up to topic and subject level, which is what a
   * student can actually act on ("Probability is costing you marks", not "concept
   * bayes-theorem-conditional is at 0.41"). Optional and additive: records written before this
   * existed simply lack them and are still valid — they just cannot be aggregated until the
   * concept is next touched by an event that knows its subject/topic.
   */
  subject?: string;
  topic?: string;
  confidence: number;         // 0..1 — how much evidence backs the estimate
  masteryScore: number;       // 0..1 — current mastery
  attempts: number;           // graded attempts (quiz/mistake)
  successCount: number;
  successRate: number;        // successCount / attempts
  revisionHistory: number[];  // revision timestamps (bounded)
  lastPracticed: number;      // ts
  learningVelocity: number;   // EMA of per-event mastery delta
  masteryTrend: MasteryTrend;
  updatedAt: number;
  /**
   * Ids of the most recent logical events already folded into this record, newest last.
   *
   * Deduplication lives HERE, on the mastery document itself, rather than in a global
   * processedEvents/{eventId} collection. That is deliberate: the transaction already reads and
   * writes this document, so checking and recording identity inside it is atomic BY
   * CONSTRUCTION — there is no window between "is it processed?" and "apply it" for a
   * concurrent duplicate to slip through. It also adds no second collection, no TTL job and no
   * per-event storage growth.
   *
   * Bounded to the most recent PROCESSED_EVENT_HISTORY ids. The trade-off is explicit: a
   * duplicate arriving after that many DIFFERENT submissions have touched the same concept
   * would no longer be recognised. At-most-once delivery makes such an extremely delayed
   * duplicate implausible, and the raw learning events remain available to recompute from.
   */
  processedEventIds?: string[];
}

export interface MasteryStore {
  get(userId: string, conceptId: string): Promise<ConceptMastery | null>;
  set(userId: string, mastery: ConceptMastery): Promise<void>;
  list(userId: string): Promise<ConceptMastery[]>;
  /**
   * Atomic read-modify-write for one concept, if the backing store can do it.
   *
   * Required for correctness, not just performance: a single test submission emits one event per
   * graded question, so many events land on the SAME concept concurrently. With a plain
   * get()-then-set() every one of them reads the same starting state and the last write wins —
   * verified against the real database, where 4 events (3 wrong, 1 correct) persisted as a
   * single attempt with a 100% success rate, silently discarding three quarters of the evidence
   * and inverting the student's actual result.
   *
   * Optional so in-memory/test stores (which have no concurrency) can omit it; MasteryEngine
   * falls back to get/set when it is absent.
   */
  transact?(
    userId: string,
    conceptId: string,
    mutate: (prev: ConceptMastery | null) => ConceptMastery,
  ): Promise<void>;
}

/** Per-event update profile: target mastery, EMA weight, whether it's a graded attempt/success. */
const EVENT_CONFIG: Record<MasteryEvent, { target: number; alpha: number; attempt: boolean; success: boolean | null; revision?: boolean }> = {
  quiz_correct:   { target: 1.0,  alpha: 0.4,  attempt: true,  success: true },
  quiz_incorrect: { target: 0.0,  alpha: 0.4,  attempt: true,  success: false },
  mistake:        { target: 0.1,  alpha: 0.3,  attempt: true,  success: false },
  revision:       { target: 0.85, alpha: 0.15, attempt: false, success: null, revision: true },
  chat:           { target: 0.7,  alpha: 0.08, attempt: false, success: null },
  followup:       { target: 0.4,  alpha: 0.1,  attempt: false, success: null },
};

const REVISION_HISTORY_MAX = 20;
/** How many recent event ids each concept remembers for deduplication. */
const PROCESSED_EVENT_HISTORY = 50;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function slugifyConcept(label: string): string {
  return (label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unknown';
}

class FirestoreMasteryStore implements MasteryStore {
  async get(userId: string, conceptId: string): Promise<ConceptMastery | null> {
    try {
      const { db } = require('../../config/firebase');
      const snap = await db.collection('users').doc(userId).collection('mastery').doc(conceptId).get();
      return snap.exists ? (snap.data() as ConceptMastery) : null;
    } catch { return null; }
  }
  async set(userId: string, mastery: ConceptMastery): Promise<void> {
    try {
      const { db } = require('../../config/firebase');
      await db.collection('users').doc(userId).collection('mastery').doc(mastery.conceptId).set(mastery, { merge: true });
    } catch { /* non-fatal */ }
  }
  async list(userId: string): Promise<ConceptMastery[]> {
    try {
      const { db } = require('../../config/firebase');
      const snap = await db.collection('users').doc(userId).collection('mastery').get();
      return snap.docs.map((d: any) => d.data() as ConceptMastery);
    } catch { return []; }
  }
  /** Atomic read-modify-write. Firestore retries the callback on contention. */
  async transact(
    userId: string,
    conceptId: string,
    mutate: (prev: ConceptMastery | null) => ConceptMastery,
  ): Promise<void> {
    try {
      const { db } = require('../../config/firebase');
      const ref = db.collection('users').doc(userId).collection('mastery').doc(conceptId);
      await db.runTransaction(async (tx: any) => {
        const snap = await tx.get(ref);
        const prev = snap.exists ? (snap.data() as ConceptMastery) : null;
        tx.set(ref, mutate(prev), { merge: true });
      });
    } catch (err: any) {
      // Never silent. A discarded write here is LOST STUDENT EVIDENCE — mastery would then be
      // computed from an incomplete record and reported to the student as fact. The previous
      // empty catch is how 4 graded answers silently persisted as 2 attempts.
      //
      // Rethrown so the caller decides: the subscriber logs and continues (one dropped batch
      // must not fail the submission the student just made), but it can no longer happen
      // invisibly, and the raw learning events remain the source of truth for recomputation.
      const { logger } = require('../../utils/logger');
      logger.error('[MasteryEngine] transactional mastery write FAILED — evidence not recorded', {
        userId, conceptId, error: err?.message, code: err?.code,
      });
      throw err;
    }
  }
}

export class MasteryEngine {
  constructor(private readonly store: MasteryStore = new FirestoreMasteryStore()) {}

  /** Fresh neutral mastery for a concept not yet seen. */
  private fresh(conceptId: string, title: string, subject?: string, topic?: string): ConceptMastery {
    return {
      conceptId, title, subject, topic,
      confidence: 0.2, masteryScore: 0.5, attempts: 0, successCount: 0, successRate: 0,
      revisionHistory: [], lastPracticed: 0, learningVelocity: 0, masteryTrend: 'steady', updatedAt: 0,
    };
  }

  /**
   * PURE mastery update. Applies one learning event to the previous state and returns the next
   * state. Uses an exponential-moving-average pull toward the event's target so a single
   * interaction never overreacts.
   */
  applyEvent(
    prev: ConceptMastery | null,
    conceptId: string,
    event: MasteryEvent,
    title = '',
    now = Date.now(),
    hierarchy?: { subject?: string; topic?: string },
  ): ConceptMastery {
    const base = prev || this.fresh(conceptId, title || conceptId, hierarchy?.subject, hierarchy?.topic);
    const cfg = EVENT_CONFIG[event];
    const prevMastery = base.masteryScore;
    const masteryScore = clamp01(prevMastery + cfg.alpha * (cfg.target - prevMastery));
    const attempts = base.attempts + (cfg.attempt ? 1 : 0);
    const successCount = base.successCount + (cfg.success === true ? 1 : 0);
    const successRate = attempts > 0 ? successCount / attempts : 0;
    const delta = masteryScore - prevMastery;
    const learningVelocity = base.learningVelocity * 0.7 + delta * 0.3;
    const masteryTrend: MasteryTrend = learningVelocity > 0.02 ? 'improving' : learningVelocity < -0.02 ? 'declining' : 'steady';
    const confidence = clamp01(0.2 + 0.08 * attempts + (cfg.attempt ? 0.05 : 0.02));
    const revisionHistory = cfg.revision
      ? [...base.revisionHistory, now].slice(-REVISION_HISTORY_MAX)
      : base.revisionHistory;

    return {
      conceptId,
      title: title || base.title,
      // Newly-supplied hierarchy wins (it backfills older records); otherwise keep what we had.
      subject: hierarchy?.subject ?? base.subject,
      topic: hierarchy?.topic ?? base.topic,
      confidence: Math.min(0.95, confidence),
      masteryScore,
      attempts,
      successCount,
      successRate,
      revisionHistory,
      lastPracticed: now,
      learningVelocity,
      masteryTrend,
      updatedAt: now,
    };
  }

  async get(userId: string, conceptId: string): Promise<ConceptMastery | null> {
    return this.store.get(userId, conceptId);
  }

  /** Read-modify-write a single concept (guarded). */
  async recordEvent(
    userId: string,
    concept: { id: string; title?: string; subject?: string; topic?: string },
    event: MasteryEvent,
  ): Promise<void> {
    if (!userId || !concept?.id) return;
    const hierarchy = { subject: concept.subject, topic: concept.topic };
    const mutate = (prev: ConceptMastery | null) =>
      this.applyEvent(prev, concept.id, event, concept.title || '', Date.now(), hierarchy);

    // Atomic where supported — concurrent events for the same concept are the normal case
    // (one test submission emits one event per question), and a plain get/set loses all but
    // the last of them.
    if (this.store.transact) {
      await this.store.transact(userId, concept.id, mutate);
      return;
    }
    await this.store.set(userId, mutate(await this.store.get(userId, concept.id)));
  }

  /**
   * Apply SEVERAL events to ONE concept in a single atomic read-modify-write.
   *
   * This is the correct shape for graded submissions, and replaces emitting one racing write
   * per question. A test submission already contains the complete result set, so its evidence
   * for a given topic is known in full at submission time: read the concept once, fold every
   * outcome in through the same pure applyEvent, write once.
   *
   * Measured necessity: with one write per question, 4 events for a single topic persisted as
   * 2 attempts — Firestore transactions on the same document contended and the losers were
   * discarded. Folding them into one write removes the contention rather than retrying harder.
   * Ordering within the batch is preserved, so EMA smoothing and trend behave exactly as they
   * would have sequentially.
   */
  async recordBatch(
    userId: string,
    concept: { id: string; title?: string; subject?: string; topic?: string },
    events: MasteryEvent[],
    eventId?: string,
  ): Promise<{ deduplicated: boolean }> {
    if (!userId || !concept?.id || events.length === 0) return { deduplicated: false };
    const hierarchy = { subject: concept.subject, topic: concept.topic };
    let deduplicated = false;

    const mutate = (prev: ConceptMastery | null) => {
      // The dedup check runs INSIDE the transaction callback, against the state that
      // transaction actually read. Two concurrent deliveries of the same eventId cannot both
      // pass: Firestore aborts and retries the loser, which then re-runs this closure, sees the
      // id recorded by the winner, and no-ops.
      if (eventId && prev?.processedEventIds?.includes(eventId)) {
        deduplicated = true;
        return prev;
      }
      deduplicated = false; // reset on transaction retry

      let acc = prev;
      for (const ev of events) {
        acc = this.applyEvent(acc, concept.id, ev, concept.title || '', Date.now(), hierarchy);
      }
      if (eventId) {
        acc!.processedEventIds = [...(prev?.processedEventIds || []), eventId].slice(-PROCESSED_EVENT_HISTORY);
      } else {
        acc!.processedEventIds = prev?.processedEventIds;
      }
      return acc!;
    };

    if (this.store.transact) {
      await this.store.transact(userId, concept.id, mutate);
      return { deduplicated };
    }
    await this.store.set(userId, mutate(await this.store.get(userId, concept.id)));
    return { deduplicated };
  }

  /** Record the same event for several concepts (e.g. all concepts matched in a chat turn). */
  async recordConcepts(
    userId: string,
    concepts: Array<{ id: string; title?: string; subject?: string; topic?: string }>,
    event: MasteryEvent,
  ): Promise<void> {
    for (const c of concepts.slice(0, 10)) {
      await this.recordEvent(userId, c, event);
    }
  }

  /** Weak concepts (below threshold) that actually have evidence, weakest first. Returns titles. */
  async getWeakConcepts(userId: string, threshold = 0.5, limit = 5): Promise<string[]> {
    const all = await this.store.list(userId);
    return all
      .filter((m) => m.attempts + m.revisionHistory.length > 0 && m.masteryScore < threshold)
      .sort((a, b) => a.masteryScore - b.masteryScore)
      .slice(0, limit)
      .map((m) => m.title || m.conceptId);
  }

  /** Aggregate mastery snapshot for analytics/observability (Increment 8). */
  async snapshot(userId: string): Promise<{ concepts: number; avgMastery: number; weak: number; improving: number }> {
    const all = await this.store.list(userId);
    if (all.length === 0) return { concepts: 0, avgMastery: 0, weak: 0, improving: 0 };
    const avgMastery = all.reduce((a, m) => a + m.masteryScore, 0) / all.length;
    return {
      concepts: all.length,
      avgMastery,
      weak: all.filter((m) => m.masteryScore < 0.5).length,
      improving: all.filter((m) => m.masteryTrend === 'improving').length,
    };
  }
}

export const masteryEngine = new MasteryEngine();
