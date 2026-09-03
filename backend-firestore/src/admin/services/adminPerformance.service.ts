import { db } from '../../config/firebase';

/**
 * Student performance — quiz results, aggregated server-side.
 *
 * ─── WHAT THIS READS ────────────────────────────────────────────────────────────────
 * `quiz_attempts`, a top-level collection: one document per attempt, carrying real
 * scoring — score, correctCount, incorrectCount, unattemptedCount, accuracy,
 * maxMarks, topicBreakdown, status ('completed' | 'in-progress'), createdAt,
 * completedAt (both already ISO 8601 strings on disk — verified against real
 * documents, not assumed; nothing here needs a Timestamp/number conversion).
 *
 * Deliberately excludes users/{uid}/assessments (the baseline placement test): of the
 * 13 that exist, 10 have an empty `responses` array — started, never answered. A
 * metric built on that right now would mostly describe absence, not performance.
 * Revisit once real completions accumulate.
 *
 * Only `status === 'completed'` attempts count toward averages and the topic
 * breakdown. An in-progress attempt has no final score — including it would average
 * in a number that does not mean what the label says.
 *
 * ─── COST ────────────────────────────────────────────────────────────────────────
 * quiz_attempts is small today (41 documents) so a capped full scan is cheap. SCAN_LIMIT
 * exists so this stays true as the collection grows — past it, this needs the same
 * treatment adminStudents.service.ts already documents doing for the 81.7M-read-unit
 * incident: paginate, or move the aggregate to a write-time counter.
 */

const SCAN_LIMIT = 5000;
/** A topic needs at least this many completed attempts before its accuracy is reported —
 *  below that, one lucky or unlucky attempt swings the average past what it means. */
const MIN_ATTEMPTS_FOR_TOPIC = 2;
const RECENT_LIMIT = 20;

interface TopicBreakdownEntry {
  topic?: string;
  correct?: number;
  incorrect?: number;
  unattempted?: number;
  total?: number;
}

export interface TopicStat {
  topic: string;
  attempts: number;
  averageAccuracy: number;
  totalQuestions: number;
  totalCorrect: number;
}

export interface RecentAttempt {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  topic: string;
  mode: string | null;
  score: number | null;
  maxMarks: number | null;
  accuracy: number | null;
  totalQuestions: number;
  timeSpentSeconds: number | null;
  completedAt: string | null;
}

export interface PerformanceOverview {
  generatedAt: number;
  totalAttempts: number;
  completedAttempts: number;
  inProgressAttempts: number;
  averageAccuracy: number | null;
  averageTimeSpentSeconds: number | null;
  weakestTopics: TopicStat[];
  strongestTopics: TopicStat[];
  recentAttempts: RecentAttempt[];
  truncated: boolean;
}

export class AdminPerformanceService {
  async getOverview(): Promise<PerformanceOverview> {
    const snap = await db.collection('quiz_attempts').limit(SCAN_LIMIT).get();

    let completed = 0;
    let inProgress = 0;
    let accuracySum = 0;
    let accuracyCount = 0;
    let timeSum = 0;
    let timeCount = 0;

    const byTopic = new Map<string, { correct: number; total: number; attempts: number }>();
    const recentCandidates: RecentAttempt[] = [];

    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const status = String(d.status || '');
      if (status !== 'completed') {
        inProgress++;
        continue;
      }
      completed++;

      const accuracy = typeof d.accuracy === 'number' ? d.accuracy : null;
      if (accuracy !== null) {
        accuracySum += accuracy;
        accuracyCount++;
      }
      if (typeof d.timeSpentSeconds === 'number') {
        timeSum += d.timeSpentSeconds;
        timeCount++;
      }

      const breakdown = Array.isArray(d.topicBreakdown) ? (d.topicBreakdown as TopicBreakdownEntry[]) : [];
      for (const t of breakdown) {
        const topic = String(t.topic || d.topic || 'Untitled');
        const entry = byTopic.get(topic) || { correct: 0, total: 0, attempts: 0 };
        entry.correct += Number(t.correct || 0);
        entry.total += Number(t.total || 0);
        entry.attempts += 1;
        byTopic.set(topic, entry);
      }

      recentCandidates.push({
        id: doc.id,
        userId: String(d.userId || ''),
        email: null,
        displayName: null,
        topic: String(d.topic || d.title || 'Untitled'),
        mode: (d.mode as string) ?? null,
        score: typeof d.score === 'number' ? d.score : null,
        maxMarks: typeof d.maxMarks === 'number' ? d.maxMarks : null,
        accuracy,
        totalQuestions: Number(d.totalQuestions || 0),
        timeSpentSeconds: typeof d.timeSpentSeconds === 'number' ? d.timeSpentSeconds : null,
        // Verified on real documents: already an ISO string, not a Timestamp or epoch
        // number — passed through as-is, same as the frontend already expects.
        completedAt: typeof d.completedAt === 'string' ? d.completedAt : null,
      });
    }

    recentCandidates.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    const recentAttempts = recentCandidates.slice(0, RECENT_LIMIT);
    await this.attachIdentities(recentAttempts);

    const topicStats: TopicStat[] = [...byTopic.entries()]
      .filter(([, v]) => v.attempts >= MIN_ATTEMPTS_FOR_TOPIC && v.total > 0)
      .map(([topic, v]) => ({
        topic,
        attempts: v.attempts,
        averageAccuracy: Math.round((v.correct / v.total) * 100),
        totalQuestions: v.total,
        totalCorrect: v.correct,
      }));

    const weakestTopics = [...topicStats].sort((a, b) => a.averageAccuracy - b.averageAccuracy).slice(0, 10);
    const strongestTopics = [...topicStats].sort((a, b) => b.averageAccuracy - a.averageAccuracy).slice(0, 10);

    return {
      generatedAt: Date.now(),
      totalAttempts: snap.size,
      completedAttempts: completed,
      inProgressAttempts: inProgress,
      averageAccuracy: accuracyCount > 0 ? Math.round(accuracySum / accuracyCount) : null,
      averageTimeSpentSeconds: timeCount > 0 ? Math.round(timeSum / timeCount) : null,
      weakestTopics,
      strongestTopics,
      recentAttempts,
      truncated: snap.size === SCAN_LIMIT,
    };
  }

  /** Same pattern as adminQuotas.service.ts: resolve identities only for the shortlist
   *  actually rendered, not every attempt scanned. */
  private async attachIdentities(rows: RecentAttempt[]): Promise<void> {
    const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
    if (ids.length === 0) return;

    const docs = await Promise.all(
      ids.map((id) =>
        db
          .collection('users')
          .doc(id)
          .get()
          .catch(() => null),
      ),
    );

    const identities = new Map<string, { email: string | null; displayName: string | null }>();
    docs.forEach((doc, i) => {
      if (!doc || !doc.exists) return;
      const u = doc.data() as Record<string, unknown>;
      identities.set(ids[i], {
        email: (u.email as string) ?? null,
        displayName: (u.displayName as string) ?? null,
      });
    });

    for (const row of rows) {
      const found = identities.get(row.userId);
      if (found) {
        row.email = found.email;
        row.displayName = found.displayName;
      }
    }
  }
}

export const adminPerformanceService = new AdminPerformanceService();
