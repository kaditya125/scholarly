/**
 * Student administration — server-side listing, search, filtering and pagination.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────
 * The previous admin listing called `auth.listUsers()`, which returns one page of at most
 * 1000 accounts and supports no search, no filtering and no sorting. It cannot back a
 * student directory: past 1000 accounts it silently stops showing people, and every
 * filter would have to happen in the browser, which means shipping the entire user table
 * to the client.
 *
 * This queries the Firestore `users` collection instead, which can paginate, filter and
 * sort server-side, and enriches only the returned page from Firebase Auth.
 *
 * ─── WHAT LIVES WHERE (audited, not assumed) ─────────────────────────────────────────
 *   users/{uid}            plan, subscription, email, displayName, photoURL, createdAt,
 *                          onboardingStatus                     ← queryable
 *   Firebase Auth          disabled, lastSignInTime, creationTime, emailVerified
 *                                                               ← NOT queryable
 *   user_usage/{uid}_{key} the five metered counters            ← separate collection
 *   payments/*             amount, status, orderId, paymentId, method
 *
 * The split matters. Account status and last-active exist ONLY in Firebase Auth, which
 * cannot be filtered or sorted server-side. So they are fetched per page for display and
 * are deliberately NOT offered as filters — offering them would mean either post-filtering
 * a page (returning inconsistent page sizes) or scanning every account. Making them real
 * filters requires mirroring `lastSignInTime` / `disabled` onto the user document at
 * login, which touches the student auth path and belongs in its own change.
 *
 * ─── NO DUPLICATE QUOTA LOGIC (§8) ───────────────────────────────────────────────────
 * Usage is never recomputed here. When requested, it comes from
 * `usageService.getUsageSummary()` — the same call the student app uses — so the admin
 * view cannot drift from what the student sees.
 */
import * as admin from 'firebase-admin';
import { db, auth } from '../../config/firebase';
import { usageService } from '../../services/usage.service';

/** Firestore caps `in`/`getUsers` batches; Auth's batch lookup takes at most 100. */
const AUTH_BATCH = 100;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Normalises a Firestore `createdAt`-shaped value to an ISO string, whatever it actually
 * is on disk. `users.createdAt` is a Firestore Timestamp (userIdentity.service.ts writes
 * it via `FieldValue.serverTimestamp()`); `payments.createdAt` is a raw epoch number
 * (payments.service.ts writes it as `Date.now()`). Both go through this so neither write
 * path can silently break the other's reader — `new Date(<Timestamp>)` is an Invalid Date
 * and `.toISOString()` on it throws, which is exactly what was crashing GET
 * /api/admin/students before this. An unparseable value returns null rather than 500ing
 * the whole page over one row.
 */
function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as FirebaseFirestore.Timestamp).toDate().toISOString();
  }
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type StudentSort = 'createdAt' | 'email' | 'displayName';
export type SortDir = 'asc' | 'desc';

export interface ListStudentsParams {
  /** Opaque cursor: the document id to resume after. */
  cursor?: string;
  limit?: number;
  /** Prefix match on email or name, or an exact uid. See searchNote in the response. */
  search?: string;
  plan?: 'free' | 'pro';
  subscriptionStatus?: string;
  sort?: StudentSort;
  dir?: SortDir;
  /** Opt-in: adds a usage summary per student. Costs one read set per student. */
  includeUsage?: boolean;
}

export interface AdminStudentRow {
  id: string;
  name: string;
  email: string;
  plan: 'free' | 'pro';
  subscriptionStatus: string | null;
  createdAt: string | null;
  onboardingStatus: string | null;
  /** From Firebase Auth — display only, not filterable. */
  accountStatus: 'active' | 'suspended' | 'pending';
  lastSignInAt: string | null;
  emailVerified: boolean;
  /** Present only when includeUsage was requested. */
  usage?: Awaited<ReturnType<typeof usageService.getUsageSummary>> | null;
}

export interface ListStudentsResult {
  students: AdminStudentRow[];
  /** Pass back as `cursor` to fetch the following page. Null when this is the last page. */
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
  /** Honest description of what search did, surfaced in the UI so results aren't misread. */
  searchNote?: string;
  /** Filters the caller asked for that this endpoint cannot honour, and why. */
  unsupported?: string[];
}

export interface StudentStats {
  total: number;
  free: number;
  pro: number;
  /** Registered within the last 7 / 30 days, by `createdAt`. */
  newLast7Days: number;
  newLast30Days: number;
}

export class AdminStudentsService {
  /**
   * Directory totals.
   *
   * Uses Firestore COUNT aggregations, not document reads. The count is computed in the
   * backend and only the number crosses the wire, so this stays cheap as the collection
   * grows — the same reason the analytics endpoint was rewritten after full-collection
   * scans produced 81.7M read units in a month.
   *
   * `createdAt` is a Firestore Timestamp (userIdentity.service.ts writes it via
   * `FieldValue.serverTimestamp()`), so the range bounds must be Timestamps too — a `where`
   * comparison against a raw number silently matches nothing rather than erroring, which is
   * exactly how newLast7Days/newLast30Days were reporting 0 regardless of reality.
   */
  async getStats(): Promise<StudentStats> {
    const users = db.collection('users');
    const now = Date.now();
    const day = 86400000;
    const since7 = admin.firestore.Timestamp.fromMillis(now - 7 * day);
    const since30 = admin.firestore.Timestamp.fromMillis(now - 30 * day);

    const [total, pro, new7, new30] = await Promise.all([
      users.count().get(),
      users.where('plan', '==', 'pro').count().get(),
      users.where('createdAt', '>=', since7).count().get(),
      users.where('createdAt', '>=', since30).count().get(),
    ]);

    const totalCount = total.data().count;
    const proCount = pro.data().count;

    return {
      total: totalCount,
      pro: proCount,
      // Derived rather than counted separately: every account is one or the other, and a
      // second aggregation would be a third of the cost for a number we already have.
      free: Math.max(totalCount - proCount, 0),
      newLast7Days: new7.data().count,
      newLast30Days: new30.data().count,
    };
  }

  /**
   * One page of students.
   *
   * Reads at most `limit + 1` user documents plus one batched Auth lookup, regardless of
   * how many accounts exist. Nothing here scans the collection.
   */
  async listStudents(params: ListStudentsParams = {}): Promise<ListStudentsResult> {
    const limit = Math.min(Math.max(Number(params.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const unsupported: string[] = [];
    let searchNote: string | undefined;

    const search = params.search?.trim();

    // ── Exact-id lookup ───────────────────────────────────────────────────────────────
    // A uid is not a prefix of anything, so treat it as a direct fetch rather than a
    // query. This is what makes "paste a user ID into search" work.
    if (search && !search.includes('@') && !search.includes(' ') && search.length >= 20) {
      const doc = await db.collection('users').doc(search).get();
      const rows = doc.exists ? await this.hydrate([doc], params.includeUsage) : [];
      return {
        students: rows,
        nextCursor: null,
        hasMore: false,
        pageSize: rows.length,
        searchNote: doc.exists ? 'Exact match on user ID.' : 'No account with that user ID.',
      };
    }

    let query: FirebaseFirestore.Query = db.collection('users');

    /**
     * Search.
     *
     * Firestore has no substring or full-text search, so this is a PREFIX match built
     * from a range query. "adi" finds "aditya@…"; "ditya" finds nothing. The response
     * says so in `searchNote` rather than letting an operator conclude the account does
     * not exist. Real substring search needs an external index (Algolia/Typesense) or a
     * denormalised token array, which is a deliberate later decision, not a silent one.
     *
     * Firestore also requires the first orderBy to be the range field, so searching
     * overrides the caller's sort.
     */
    let sortField: string = params.sort || 'createdAt';
    let sortDir: SortDir = params.dir || 'desc';

    if (search) {
      const field = search.includes('@') ? 'email' : 'displayName';
      query = query
        .where(field, '>=', search)
        .where(field, '<=', search + '');
      sortField = field;
      sortDir = 'asc';
      searchNote = `Prefix match on ${field === 'email' ? 'email' : 'name'} — matches from the start of the value, not anywhere within it.`;
    }

    if (params.plan) query = query.where('plan', '==', params.plan);
    if (params.subscriptionStatus) {
      query = query.where('subscription.status', '==', params.subscriptionStatus);
    }

    // Filters that cannot be served from Firestore. Reported, never silently dropped.
    if ((params as Record<string, unknown>).accountStatus) {
      unsupported.push('accountStatus — lives in Firebase Auth, which cannot be queried server-side');
    }
    if ((params as Record<string, unknown>).lastActive) {
      unsupported.push('lastActive — lives in Firebase Auth, which cannot be queried server-side');
    }
    if ((params as Record<string, unknown>).usageLevel) {
      unsupported.push('usageLevel — usage is a separate collection and cannot be joined in a Firestore query');
    }

    query = query.orderBy(sortField, sortDir);

    // Cursor. startAfter on a document snapshot keeps the cursor stable across pages even
    // when the sort field has duplicate values.
    if (params.cursor) {
      const cursorDoc = await db.collection('users').doc(params.cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    // One extra row tells us whether another page exists without a second count query.
    const snap = await query.limit(limit + 1).get();
    const docs = snap.docs.slice(0, limit);
    const hasMore = snap.docs.length > limit;

    const students = await this.hydrate(docs, params.includeUsage);

    return {
      students,
      nextCursor: hasMore && docs.length > 0 ? docs[docs.length - 1].id : null,
      hasMore,
      pageSize: students.length,
      searchNote,
      unsupported: unsupported.length ? unsupported : undefined,
    };
  }

  /**
   * Adds the Auth-only fields to a page of user documents.
   *
   * `auth.getUsers` is a single batched call per 100 uids, so this is O(1) network round
   * trips per page rather than one per student — the N+1 that §38 rules out. Accounts
   * present in Firestore but missing from Auth (deleted identity, orphaned document) are
   * kept and marked, because hiding them would make the directory disagree with the
   * database.
   */
  private async hydrate(
    docs: FirebaseFirestore.QueryDocumentSnapshot[] | FirebaseFirestore.DocumentSnapshot[],
    includeUsage?: boolean,
  ): Promise<AdminStudentRow[]> {
    if (docs.length === 0) return [];

    const ids = docs.map((d) => d.id);
    const authById = new Map<string, import('firebase-admin/auth').UserRecord>();

    for (let i = 0; i < ids.length; i += AUTH_BATCH) {
      const batch = ids.slice(i, i + AUTH_BATCH).map((uid) => ({ uid }));
      try {
        const res = await auth.getUsers(batch);
        res.users.forEach((u) => authById.set(u.uid, u));
      } catch {
        // A failed enrichment must not fail the listing — the Firestore data is still
        // the useful part. Those rows fall back to 'pending' below.
      }
    }

    const rows: AdminStudentRow[] = docs.map((d) => {
      const data = (d.data() || {}) as Record<string, any>;
      const authUser = authById.get(d.id);
      const lastSignInTime = authUser?.metadata?.lastSignInTime || null;

      return {
        id: d.id,
        name: data.displayName || (data.email ? String(data.email).split('@')[0] : d.id),
        email: data.email || authUser?.email || '—',
        plan: data.plan === 'pro' ? 'pro' : 'free',
        subscriptionStatus: data.subscription?.status ?? null,
        createdAt: toIso(data.createdAt) ?? authUser?.metadata?.creationTime ?? null,
        onboardingStatus: data.onboardingStatus ?? null,
        accountStatus: authUser?.disabled ? 'suspended' : lastSignInTime ? 'active' : 'pending',
        lastSignInAt: lastSignInTime,
        emailVerified: Boolean(authUser?.emailVerified),
      };
    });

    /**
     * Usage is opt-in because it is the expensive part: one summary per student, each
     * reading that student's usage document and plan. Fine for a 25-row page on request,
     * wrong as a default for a directory listing.
     */
    if (includeUsage) {
      await Promise.all(
        rows.map(async (row) => {
          try {
            row.usage = await usageService.getUsageSummary(row.id);
          } catch {
            row.usage = null; // absent, not zero — the UI must distinguish these
          }
        }),
      );
    }

    return rows;
  }

  /**
   * Everything the admin needs about one student.
   *
   * Composed from the existing sources rather than a new denormalised record (§34):
   *   identity + account   users/{uid} + Firebase Auth
   *   plan + subscription  users/{uid}.plan / .subscription
   *   usage                usageService.getUsageSummary() — the student app's own call
   *   billing              payments where userId == uid
   *   gamification         user_stats/{uid}
   *   documents            notebooks where userId == uid  (COUNT only)
   *
   * Each section is fetched independently and may come back null. A student with no
   * payments is not an error, and one failing section must not blank the whole profile —
   * §37's partial-failure rule. `null` means "could not load"; the UI distinguishes that
   * from an empty list, because "no payments" and "payments unavailable" are different
   * facts and conflating them is how an operator ends up misreading an account.
   */
  async getStudentDetail(userId: string): Promise<StudentDetail | null> {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return null;

    const [row] = await this.hydrate([doc], false);
    const data = (doc.data() || {}) as Record<string, any>;

    const [usage, payments, stats, documentCount] = await Promise.all([
      usageService.getUsageSummary(userId).catch(() => null),
      this.getPayments(userId).catch(() => null),
      db.collection('user_stats').doc(userId).get()
        .then((s) => (s.exists ? (s.data() as Record<string, any>) : null))
        .catch(() => null),
      db.collection('notebooks').where('userId', '==', userId).count().get()
        .then((s) => s.data().count)
        .catch(() => null),
    ]);

    return {
      ...row,
      subscription: data.subscription ?? null,
      usage,
      billing: payments,
      stats,
      documentCount,
      /**
       * Deliberately empty. There is no event/audit collection in this database — the
       * activity timeline has no source to read from, so the API reports the absence
       * instead of assembling a plausible-looking history out of createdAt and
       * lastSignInTime. Building the event model is its own slice (§11).
       */
      activity: { available: false, reason: 'No event collection exists yet — activity is not recorded.' },
    };
  }

  /**
   * A student's payment history.
   *
   * Capped at 50 and ordered newest-first: this feeds a profile panel, not an accounting
   * export, and an unbounded query on a collection that grows per transaction is the
   * pattern that produced the Firestore bill.
   *
   * Returns only administrative metadata. Razorpay never gives us card data and none is
   * stored, but the field list here is explicit so it stays that way (§9).
   */
  private async getPayments(userId: string): Promise<PaymentSummary> {
    const snap = await db.collection('payments')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const records = snap.docs.map((d) => {
      const p = d.data() as Record<string, any>;
      return {
        orderId: p.orderId ?? d.id,
        paymentId: p.paymentId ?? null,
        planName: p.planName ?? null,
        billing: p.billing ?? null,
        amountRupees: typeof p.amountRupees === 'number' ? p.amountRupees : null,
        currency: p.currency ?? 'INR',
        status: p.status ?? 'unknown',
        method: p.method ?? null,
        createdAt: toIso(p.createdAt),
      };
    });

    const paid = records.filter((r) => r.status === 'paid');
    return {
      records,
      totalPaidRupees: paid.reduce((sum, r) => sum + (r.amountRupees || 0), 0),
      paidCount: paid.length,
      failedCount: records.filter((r) => r.status === 'failed').length,
      refundedCount: records.filter((r) => r.status === 'refunded').length,
      truncated: records.length === 50,
    };
  }
}

export interface PaymentSummary {
  records: Array<{
    orderId: string;
    paymentId: string | null;
    planName: string | null;
    billing: string | null;
    amountRupees: number | null;
    currency: string;
    status: string;
    method: string | null;
    createdAt: string | null;
  }>;
  totalPaidRupees: number;
  paidCount: number;
  failedCount: number;
  refundedCount: number;
  /** True when the 50-record cap was hit, so the UI can say the list is partial. */
  truncated: boolean;
}

export interface StudentDetail extends AdminStudentRow {
  subscription: Record<string, any> | null;
  usage: Awaited<ReturnType<typeof usageService.getUsageSummary>> | null;
  billing: PaymentSummary | null;
  stats: Record<string, any> | null;
  documentCount: number | null;
  activity: { available: false; reason: string };
}

export const adminStudentsService = new AdminStudentsService();
