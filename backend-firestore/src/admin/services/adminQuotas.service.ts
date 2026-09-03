import { db } from '../../config/firebase';
import { PLAN_LIMITS, PlanLimits, PlanType } from '../../services/entitlement.service';

/**
 * Quota and entitlement reporting for the admin area.
 *
 * WHAT THIS READS. `user_usage`, written by services/usage.service.ts — one document per
 * user per billing period, keyed `${userId}_${periodKey}`, carrying a counter per metered
 * feature. Nothing here is derived or estimated: every number below is either a counter
 * that service incremented or a limit from PLAN_LIMITS.
 *
 * WHY periodKey DECIDES THE PLAN. usage.service.ts writes `free_YYYY-MM` for a calendar
 * month on the free tier and `sub_YYYY-MM-DD` for a Pro billing cycle, so the prefix already
 * records which plan the counters were accumulated under. Reading it costs nothing, whereas
 * resolving each user's plan properly would mean one `users` read per record and would also
 * answer the wrong question: a user who upgraded mid-period was metered against the free
 * limits for the usage actually recorded here.
 *
 * WHY ONLY ACTIVE PERIODS. `periodEnd > now` selects the window each user is currently being
 * metered in. Expired documents are last month's history and would make "who is near their
 * limit" meaningless by mixing periods that have already reset.
 */

/** Metrics carried per usage document, paired with the PLAN_LIMITS key that bounds each. */
const METRICS = [
  { key: 'chatMessages', limitKey: 'chatMessages', label: 'Chat messages' },
  { key: 'voiceSeconds', limitKey: 'voiceSeconds', label: 'Voice seconds' },
  { key: 'documentsUploaded', limitKey: 'documentsUploaded', label: 'Documents' },
  { key: 'podcastsGenerated', limitKey: 'podcastsGenerated', label: 'Podcasts' },
  { key: 'mockTestsGenerated', limitKey: 'mockTestsGenerated', label: 'Mock tests' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

/** At or above this fraction of a limit, a user is worth an operator's attention. */
const PRESSURE_THRESHOLD = 0.8;

/** Cap on documents scanned, so one query cannot become unbounded as the base grows. */
const SCAN_LIMIT = 5000;

export interface MetricSummary {
  key: MetricKey;
  label: string;
  /** Total consumed across every active period, both plans. */
  total: number;
  freeLimit: number;
  proLimit: number;
  /** Users at or past their plan's limit for this metric. */
  exhausted: number;
  /** Users at or past PRESSURE_THRESHOLD but not yet exhausted. */
  approaching: number;
}

export interface PressuredUser {
  userId: string;
  email: string | null;
  displayName: string | null;
  plan: PlanType;
  metric: MetricKey;
  metricLabel: string;
  used: number;
  limit: number;
  percent: number;
  periodEnd: number;
}

export interface QuotaOverview {
  generatedAt: number;
  limits: Record<PlanType, PlanLimits>;
  /** Active usage documents scanned, split by the plan their period was metered under. */
  periods: { active: number; free: number; pro: number; truncated: boolean };
  metrics: MetricSummary[];
  pressured: PressuredUser[];
}

export class AdminQuotasService {
  async getOverview(): Promise<QuotaOverview> {
    const now = Date.now();

    const snap = await db
      .collection('user_usage')
      .where('periodEnd', '>', now)
      .limit(SCAN_LIMIT)
      .get();

    const summaries: MetricSummary[] = METRICS.map((m) => ({
      key: m.key,
      label: m.label,
      total: 0,
      freeLimit: PLAN_LIMITS.free[m.limitKey] as number,
      proLimit: PLAN_LIMITS.pro[m.limitKey] as number,
      exhausted: 0,
      approaching: 0,
    }));
    const byKey = new Map(summaries.map((s) => [s.key, s]));

    let free = 0;
    let pro = 0;
    const pressured: PressuredUser[] = [];

    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const periodKey = String(d.periodKey || '');
      // See the header: the prefix is what usage.service.ts wrote, not an inference.
      const plan: PlanType = periodKey.startsWith('free_') ? 'free' : 'pro';
      plan === 'free' ? free++ : pro++;

      // The document id is `${userId}_${periodKey}`, so it is the fallback if the field is absent.
      const userId = String(d.userId || doc.id.split('_')[0] || '');

      for (const m of METRICS) {
        const used = Number(d[m.key] || 0);
        if (used <= 0) continue;

        const summary = byKey.get(m.key)!;
        summary.total += used;

        const limit = PLAN_LIMITS[plan][m.limitKey] as number;
        if (limit <= 0) continue;

        const fraction = used / limit;
        if (fraction >= 1) summary.exhausted++;
        else if (fraction >= PRESSURE_THRESHOLD) summary.approaching++;

        if (fraction >= PRESSURE_THRESHOLD) {
          pressured.push({
            userId,
            email: null,
            displayName: null,
            plan,
            metric: m.key,
            metricLabel: m.label,
            used,
            limit,
            percent: Math.round(fraction * 100),
            periodEnd: Number(d.periodEnd || 0),
          });
        }
      }
    }

    // Worst first, and capped: this is a list an operator acts on, not a data export.
    pressured.sort((a, b) => b.percent - a.percent);
    const top = pressured.slice(0, 50);

    await this.attachIdentities(top);

    return {
      generatedAt: now,
      limits: PLAN_LIMITS,
      periods: {
        active: snap.size,
        free,
        pro,
        truncated: snap.size === SCAN_LIMIT,
      },
      metrics: summaries,
      pressured: top,
    };
  }

  /**
   * Fills in email and name for the shortlist only.
   *
   * Deliberately after the cap: resolving identities for every scanned record would be one
   * read per user to populate rows nobody sees. A user document that has since been deleted
   * simply leaves the row with its id, which is still enough to act on.
   */
  private async attachIdentities(rows: PressuredUser[]): Promise<void> {
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

export const adminQuotasService = new AdminQuotasService();
