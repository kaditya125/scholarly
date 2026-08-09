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
}

export interface MasteryStore {
  get(userId: string, conceptId: string): Promise<ConceptMastery | null>;
  set(userId: string, mastery: ConceptMastery): Promise<void>;
  list(userId: string): Promise<ConceptMastery[]>;
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
}

export class MasteryEngine {
  constructor(private readonly store: MasteryStore = new FirestoreMasteryStore()) {}

  /** Fresh neutral mastery for a concept not yet seen. */
  private fresh(conceptId: string, title: string): ConceptMastery {
    return {
      conceptId, title,
      confidence: 0.2, masteryScore: 0.5, attempts: 0, successCount: 0, successRate: 0,
      revisionHistory: [], lastPracticed: 0, learningVelocity: 0, masteryTrend: 'steady', updatedAt: 0,
    };
  }

  /**
   * PURE mastery update. Applies one learning event to the previous state and returns the next
   * state. Uses an exponential-moving-average pull toward the event's target so a single
   * interaction never overreacts.
   */
  applyEvent(prev: ConceptMastery | null, conceptId: string, event: MasteryEvent, title = '', now = Date.now()): ConceptMastery {
    const base = prev || this.fresh(conceptId, title || conceptId);
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
  async recordEvent(userId: string, concept: { id: string; title?: string }, event: MasteryEvent): Promise<void> {
    if (!userId || !concept?.id) return;
    const prev = await this.store.get(userId, concept.id);
    const next = this.applyEvent(prev, concept.id, event, concept.title || '');
    await this.store.set(userId, next);
  }

  /** Record the same event for several concepts (e.g. all concepts matched in a chat turn). */
  async recordConcepts(userId: string, concepts: Array<{ id: string; title?: string }>, event: MasteryEvent): Promise<void> {
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
