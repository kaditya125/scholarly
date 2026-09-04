import { db } from '../../config/firebase';
import { PLAN_LIMITS, PlanType } from '../../services/entitlement.service';

/**
 * Per-feature usage detail for the admin "Usage" pages (AI Chat, Voice, Documents,
 * Podcasts, Tests).
 *
 * Reads the exact same source as adminQuotas.service.ts — `user_usage`, one document per
 * user per billing period, written by services/usage.service.ts — but drills into a single
 * metric instead of summarising all five. Everything below is a real counter or a value
 * from PLAN_LIMITS; there is no derived trend, because usage.service.ts does not persist a
 * history, only the live counter for the period a user is currently metered in (see
 * adminQuotas.service.ts's header comment for why the period, not the calendar, decides
 * the plan a document is read under).
 */

export const USAGE_METRICS = {
  chatMessages: { label: 'AI Chat', unit: 'messages' },
  voiceSeconds: { label: 'Voice', unit: 'seconds' },
  documentsUploaded: { label: 'Documents', unit: 'documents' },
  podcastsGenerated: { label: 'Podcasts', unit: 'podcasts' },
  mockTestsGenerated: { label: 'Tests & exams', unit: 'tests' },
} as const;

export type UsageMetricKey = keyof typeof USAGE_METRICS;
export const USAGE_METRIC_KEYS = Object.keys(USAGE_METRICS) as UsageMetricKey[];

/** At or above this fraction of a limit, a user is worth an operator's attention. */
const PRESSURE_THRESHOLD = 0.8;

/** Cap on documents scanned, matching adminQuotas.service.ts's SCAN_LIMIT. */
const SCAN_LIMIT = 5000;

/** Histogram bands of usage-as-fraction-of-limit. */
const BANDS = [
  { key: '0-25', min: 0, max: 0.25 },
  { key: '25-50', min: 0.25, max: 0.5 },
  { key: '50-75', min: 0.5, max: 0.75 },
  { key: '75-100', min: 0.75, max: 1 },
  { key: '100+', min: 1, max: Infinity },
] as const;

export interface UsageTopConsumer {
  userId: string;
  email: string | null;
  displayName: string | null;
  plan: PlanType;
  used: number;
  limit: number;
  percent: number;
  periodEnd: number;
}

export interface UsageMetricDetail {
  generatedAt: number;
  metric: UsageMetricKey;
  label: string;
  unit: string;
  total: number;
  freeLimit: number;
  proLimit: number;
  /** Users with any usage on this metric, split free/pro. Distinct from adminQuotas'
   *  `periods`, which counts every active usage document regardless of this metric. */
  usersWithUsage: { free: number; pro: number };
  exhausted: number;
  approaching: number;
  distribution: { band: string; count: number }[];
  topConsumers: UsageTopConsumer[];
  scan: { documentsScanned: number; truncated: boolean };
}

export class AdminUsageService {
  async getMetricDetail(metric: UsageMetricKey): Promise<UsageMetricDetail> {
    const now = Date.now();
    const def = USAGE_METRICS[metric];

    const snap = await db
      .collection('user_usage')
      .where('periodEnd', '>', now)
      .limit(SCAN_LIMIT)
      .get();

    let total = 0;
    let exhausted = 0;
    let approaching = 0;
    let freeUsers = 0;
    let proUsers = 0;
    const distribution: Record<string, number> = Object.fromEntries(BANDS.map((b) => [b.key, 0]));
    const consumers: UsageTopConsumer[] = [];

    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const used = Number(d[metric] || 0);
      if (used <= 0) continue;

      const periodKey = String(d.periodKey || '');
      const plan: PlanType = periodKey.startsWith('free_') ? 'free' : 'pro';
      plan === 'free' ? freeUsers++ : proUsers++;

      total += used;

      const limit = PLAN_LIMITS[plan][metric] as number;
      const fraction = limit > 0 ? used / limit : 0;
      if (fraction >= 1) exhausted++;
      else if (fraction >= PRESSURE_THRESHOLD) approaching++;

      const band = BANDS.find((b) => fraction >= b.min && fraction < b.max) ?? BANDS[BANDS.length - 1];
      distribution[band.key]++;

      const userId = String(d.userId || doc.id.split('_')[0] || '');
      consumers.push({
        userId,
        email: null,
        displayName: null,
        plan,
        used,
        limit,
        percent: Math.round(fraction * 100),
        periodEnd: Number(d.periodEnd || 0),
      });
    }

    consumers.sort((a, b) => b.used - a.used);
    const top = consumers.slice(0, 25);
    await this.attachIdentities(top);

    return {
      generatedAt: now,
      metric,
      label: def.label,
      unit: def.unit,
      total,
      freeLimit: PLAN_LIMITS.free[metric] as number,
      proLimit: PLAN_LIMITS.pro[metric] as number,
      usersWithUsage: { free: freeUsers, pro: proUsers },
      exhausted,
      approaching,
      distribution: BANDS.map((b) => ({ band: b.key, count: distribution[b.key] })),
      topConsumers: top,
      scan: { documentsScanned: snap.size, truncated: snap.size === SCAN_LIMIT },
    };
  }

  /** Same shortlist-only identity fill as adminQuotas.service.ts, and for the same reason. */
  private async attachIdentities(rows: UsageTopConsumer[]): Promise<void> {
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

export const adminUsageService = new AdminUsageService();
