import { db, auth } from '../../config/firebase';

/**
 * Student engagement — activity volume and recency, aggregated server-side.
 *
 * ─── WHAT THIS READS ────────────────────────────────────────────────────────────────
 * `chat_sessions` (top-level, 94 documents today) — createdAt (a raw epoch number on
 * disk, verified against real documents) and userId per session. A session is only
 * created when a student actually opens the AI tutor, which makes it a genuine
 * product-usage signal, unlike a sign-in that could just mean the tab was left open.
 *
 * Firebase Auth `lastSignInTime` — reused for an account-level "signed in recently"
 * figure alongside the product-usage one. `auth.listUsers()` is fine here because it is
 * called once per request for an aggregate count, not to back a paginated directory —
 * adminStudents.service.ts's own header explains why listUsers() cannot back that job;
 * a single bounded call for ~32 accounts is a different use entirely.
 *
 * Deliberately excludes users/{uid}/analytics_logs (154 documents across every user's
 * subcollection): reading it means a Firestore collectionGroup scan across every
 * student, which is exactly the full-scan pattern that produced 81.7M read units in a
 * month elsewhere in this admin area (see adminStudents.service.ts). chat_sessions is a
 * single top-level collection and answers the same question — is this student using the
 * product — at a fraction of the cost.
 *
 * ─── COST ────────────────────────────────────────────────────────────────────────
 * The recency windows are `where('createdAt', '>=', cutoff)` range queries, served from
 * chat_sessions' single-field auto-index — not a full scan, and cheap regardless of how
 * large the collection grows. Only the most-active-students aggregation groups results
 * in memory, and only over the already-bounded 30-day window.
 */

const RECENT_LIMIT = 20;
const TOP_STUDENTS_LIMIT = 10;
const SCAN_LIMIT = 5000;

export interface RecentSession {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  title: string | null;
  createdAt: number | null;
}

export interface ActiveStudent {
  userId: string;
  email: string | null;
  displayName: string | null;
  sessionsLast30Days: number;
}

export interface EngagementOverview {
  generatedAt: number;
  totalSessions: number;
  sessionsLast7Days: number;
  sessionsLast30Days: number;
  uniqueActiveLast7Days: number;
  uniqueActiveLast30Days: number;
  signedInLast7Days: number;
  signedInLast30Days: number;
  mostActiveStudents: ActiveStudent[];
  recentSessions: RecentSession[];
}

export class AdminEngagementService {
  async getOverview(): Promise<EngagementOverview> {
    const now = Date.now();
    const day = 86400000;
    const since7 = now - 7 * day;
    const since30 = now - 30 * day;

    const [totalSnap, last7Snap, last30Snap, recentSnap, authCounts] = await Promise.all([
      db.collection('chat_sessions').count().get(),
      db.collection('chat_sessions').where('createdAt', '>=', since7).limit(SCAN_LIMIT).get(),
      db.collection('chat_sessions').where('createdAt', '>=', since30).limit(SCAN_LIMIT).get(),
      db.collection('chat_sessions').orderBy('createdAt', 'desc').limit(RECENT_LIMIT).get(),
      this.countRecentSignIns(since7, since30),
    ]);

    const uniqueLast7 = new Set(last7Snap.docs.map((d) => d.data().userId).filter(Boolean));
    const uniqueLast30 = new Set(last30Snap.docs.map((d) => d.data().userId).filter(Boolean));

    const sessionCountByUser = new Map<string, number>();
    for (const doc of last30Snap.docs) {
      const userId = String(doc.data().userId || '');
      if (!userId) continue;
      sessionCountByUser.set(userId, (sessionCountByUser.get(userId) || 0) + 1);
    }
    const mostActiveStudents: ActiveStudent[] = [...sessionCountByUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_STUDENTS_LIMIT)
      .map(([userId, count]) => ({ userId, email: null, displayName: null, sessionsLast30Days: count }));

    const recentSessions: RecentSession[] = recentSnap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        userId: String(x.userId || ''),
        email: null,
        displayName: null,
        title: (x.title as string) ?? null,
        createdAt: typeof x.createdAt === 'number' ? x.createdAt : null,
      };
    });

    await Promise.all([this.attachIdentities(mostActiveStudents), this.attachIdentities(recentSessions)]);

    return {
      generatedAt: now,
      totalSessions: totalSnap.data().count,
      sessionsLast7Days: last7Snap.size,
      sessionsLast30Days: last30Snap.size,
      uniqueActiveLast7Days: uniqueLast7.size,
      uniqueActiveLast30Days: uniqueLast30.size,
      signedInLast7Days: authCounts.last7,
      signedInLast30Days: authCounts.last30,
      mostActiveStudents,
      recentSessions,
    };
  }

  /** One bounded call for the whole account base (~32 today), not a per-page fetch. */
  private async countRecentSignIns(since7: number, since30: number): Promise<{ last7: number; last30: number }> {
    let last7 = 0;
    let last30 = 0;
    let pageToken: string | undefined;
    do {
      const page = await auth.listUsers(1000, pageToken);
      for (const u of page.users) {
        const t = u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : 0;
        if (t >= since30) last30++;
        if (t >= since7) last7++;
      }
      pageToken = page.pageToken;
    } while (pageToken);
    return { last7, last30 };
  }

  private async attachIdentities<T extends { userId: string; email: string | null; displayName: string | null }>(
    rows: T[],
  ): Promise<void> {
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

export const adminEngagementService = new AdminEngagementService();
