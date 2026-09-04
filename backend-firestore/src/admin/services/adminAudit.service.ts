import { db } from '../../config/firebase';

/**
 * Reads back what auditLog.middleware.ts writes to `admin_audit_log` — one document per
 * mutating admin request, written since the middleware was deployed. There is no
 * historical backfill: entries exist only from the moment logging started, and the page
 * says so rather than implying a longer history than the data actually holds.
 */

export interface AuditEntry {
  id: string;
  actorUid: string;
  actorEmail: string | null;
  actorRole: string | null;
  method: string;
  path: string;
  params: Record<string, string>;
  statusCode: number;
  timestamp: number;
}

export interface AuditOverview {
  entries: AuditEntry[];
  truncated: boolean;
}

const SCAN_LIMIT = 200;

export class AdminAuditService {
  async getOverview(limit: number = SCAN_LIMIT): Promise<AuditOverview> {
    const capped = Math.min(Math.max(limit, 1), SCAN_LIMIT);
    const snap = await db
      .collection('admin_audit_log')
      .orderBy('timestamp', 'desc')
      .limit(capped)
      .get();

    const entries = snap.docs.map((d) => {
      const data = d.data() as Omit<AuditEntry, 'id'>;
      return { id: d.id, ...data };
    });

    return { entries, truncated: snap.size === capped };
  }
}

export const adminAuditService = new AdminAuditService();
