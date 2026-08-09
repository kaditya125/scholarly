/** Implicit + explicit feedback signals (Task 8). */
export type FeedbackSignal =
  | 'thumbs_up'
  | 'thumbs_down'
  | 'copied'
  | 'regenerated'
  | 'followup'
  | 'citation_opened'
  | 'quiz_requested'
  | 'dwell';

export interface FeedbackEvent {
  userId: string;
  signal: FeedbackSignal;
  sessionId?: string;
  messageId?: string;
  category?: string;
  workflow?: string;
  model?: string;
  /** Numeric payload where relevant (e.g. dwell milliseconds). */
  value?: number;
  ts?: number;
}

export interface FeedbackSummary {
  total: number;
  thumbsUp: number;
  thumbsDown: number;
  regenerated: number;
  copied: number;
  followups: number;
  citationsOpened: number;
  quizzesRequested: number;
  avgDwellMs: number;
  /** Simple satisfaction proxy in [0,1]: up / (up + down), 0.5 when no explicit votes. */
  satisfaction: number;
}

const VALID: Set<FeedbackSignal> = new Set([
  'thumbs_up', 'thumbs_down', 'copied', 'regenerated', 'followup', 'citation_opened', 'quiz_requested', 'dwell',
]);

/** Persistence seam so the service is unit-testable without Firestore. */
export interface FeedbackStore {
  append(event: FeedbackEvent): Promise<void>;
  recent(userId: string, limit: number): Promise<FeedbackEvent[]>;
}

/** Firestore-backed store (guarded — a failed write must never affect the user response). */
class FirestoreFeedbackStore implements FeedbackStore {
  async append(event: FeedbackEvent): Promise<void> {
    try {
      const { db } = require('../../config/firebase');
      await db.collection('users').doc(event.userId).collection('feedback').add(event);
    } catch { /* non-fatal */ }
  }
  async recent(userId: string, limit: number): Promise<FeedbackEvent[]> {
    try {
      const { db } = require('../../config/firebase');
      const snap = await db.collection('users').doc(userId).collection('feedback')
        .orderBy('ts', 'desc').limit(limit).get();
      return snap.docs.map((d: any) => d.data() as FeedbackEvent);
    } catch { return []; }
  }
}

/**
 * FeedbackService (Task 8) — captures the signals that indicate answer quality/usefulness and
 * stores them for the LearningEngine + analytics to consume. It does NOT train models; it
 * accumulates evidence the application uses to improve routing/retrieval/prompt/cache decisions.
 * Capture is fully guarded; an invalid or failed signal never affects the response.
 */
export class FeedbackService {
  constructor(private readonly store: FeedbackStore = new FirestoreFeedbackStore()) {}

  async record(event: FeedbackEvent): Promise<void> {
    if (!event || !event.userId || !VALID.has(event.signal)) return;
    await this.store.append({ ...event, ts: event.ts ?? Date.now() });
  }

  async getRecent(userId: string, limit = 100): Promise<FeedbackEvent[]> {
    return this.store.recent(userId, limit);
  }

  /** Aggregate signals into a compact summary (pure). Used by analytics + the LearningEngine. */
  summarize(events: FeedbackEvent[]): FeedbackSummary {
    const count = (s: FeedbackSignal) => events.filter((e) => e.signal === s).length;
    const thumbsUp = count('thumbs_up');
    const thumbsDown = count('thumbs_down');
    const dwellEvents = events.filter((e) => e.signal === 'dwell' && typeof e.value === 'number');
    const avgDwellMs = dwellEvents.length
      ? dwellEvents.reduce((a, e) => a + (e.value || 0), 0) / dwellEvents.length
      : 0;
    const votes = thumbsUp + thumbsDown;
    return {
      total: events.length,
      thumbsUp,
      thumbsDown,
      regenerated: count('regenerated'),
      copied: count('copied'),
      followups: count('followup'),
      citationsOpened: count('citation_opened'),
      quizzesRequested: count('quiz_requested'),
      avgDwellMs,
      satisfaction: votes === 0 ? 0.5 : thumbsUp / votes,
    };
  }
}

export const feedbackService = new FeedbackService();
