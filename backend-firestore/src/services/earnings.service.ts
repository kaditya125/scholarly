import * as admin from 'firebase-admin';
import { earningsRepository } from '../repositories/earnings.repository';
import { payoutRepository } from '../repositories/payout.repository';
import { teacherProfileService } from './teacherProfile.service';
import { splitClassSale } from '../config/monetization';
import {
  PayoutQueueRow,
  RecordPayoutInput,
  TeacherEarningEntry,
  TeacherEarningsSummary,
  TeacherPayoutRecord,
} from '../types/earnings';

type CodedError = Error & { code: string };
const fail = (code: string, message: string): never => {
  throw Object.assign(new Error(message), { code }) as CodedError;
};

/**
 * EarningsService — the ledger side of a class sale.
 *
 * See types/earnings.ts for why this is append-only. `accrueForClassSale` is the one place
 * entries are ever created, and it's called exactly once per successfully-applied order — see
 * the idempotency check inside it, and its caller, `paymentsService.markClassOrderPaid`.
 */
export class EarningsService {
  /**
   * Writes the sale/commission/tax entries for one class purchase. Idempotent per `orderId`: if
   * any entry already exists for this order, does nothing and returns them unchanged rather than
   * double-accruing on a retried webhook.
   */
  async accrueForClassSale(params: { teacherUid: string; classId: string; orderId: string; grossPaise: number }): Promise<TeacherEarningEntry[]> {
    const existing = await earningsRepository.listForOrder(params.orderId);
    if (existing.length > 0) return existing;

    const { grossPaise, commissionPaise, taxPaise } = splitClassSale(params.grossPaise);
    const now = admin.firestore.FieldValue.serverTimestamp();

    const rows: Omit<TeacherEarningEntry, 'id'>[] = [
      { teacherUid: params.teacherUid, classId: params.classId, orderId: params.orderId, type: 'sale', amountPaise: grossPaise, state: 'pending', createdAt: now },
    ];
    if (commissionPaise > 0) {
      rows.push({ teacherUid: params.teacherUid, classId: params.classId, orderId: params.orderId, type: 'commission', amountPaise: -commissionPaise, state: 'pending', createdAt: now });
    }
    if (taxPaise > 0) {
      rows.push({ teacherUid: params.teacherUid, classId: params.classId, orderId: params.orderId, type: 'tax', amountPaise: -taxPaise, state: 'pending', createdAt: now });
    }

    const entries: TeacherEarningEntry[] = rows.map((r) => ({ ...r, id: earningsRepository.newId() }));
    await Promise.all(entries.map((e) => earningsRepository.create(e)));
    return entries;
  }

  /** The teacher's own ledger — self only, enforced by the caller passing its own uid. */
  async getSummary(teacherUid: string): Promise<TeacherEarningsSummary> {
    const entries = await earningsRepository.listForTeacher(teacherUid);
    const balancePaise = entries.filter((e) => e.state !== 'paid').reduce((sum, e) => sum + e.amountPaise, 0);
    const paidPaise = entries.filter((e) => e.state === 'paid').reduce((sum, e) => sum + e.amountPaise, 0);
    return { balancePaise, paidPaise, entries };
  }

  /** A teacher's own payout history — self only, same posture as getSummary. */
  async listPayouts(teacherUid: string): Promise<TeacherPayoutRecord[]> {
    return payoutRepository.listForTeacher(teacherUid);
  }

  /**
   * Records a MANUAL payout — see types/earnings.ts for why this exists instead of real payout
   * execution. Pays out the teacher's ENTIRE current balance in one action (not a partial
   * amount): this is a small-scale, human-judgment tool, not a batching system, and partial
   * payouts would need a selection UI this phase deliberately doesn't build.
   *
   * Admin-only — enforced by the caller (the route sits behind `requireAdmin`), not re-checked
   * here, matching teacherProfileService.transitionStatus's own posture.
   */
  async recordPayout(teacherUid: string, adminUid: string, input: RecordPayoutInput): Promise<TeacherPayoutRecord> {
    if (!input.method) return fail('INVALID_INPUT', 'A payout method is required.');

    const entries = await earningsRepository.listForTeacher(teacherUid);
    const owed = entries.filter((e) => e.state !== 'paid');
    const netPaise = owed.reduce((sum, e) => sum + e.amountPaise, 0);
    if (netPaise <= 0) return fail('NOTHING_OWED', 'This teacher has no outstanding balance to pay out.');

    const record: TeacherPayoutRecord = {
      id: payoutRepository.newId(),
      teacherUid,
      entryIds: owed.map((e) => e.id),
      netPaise,
      method: input.method,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      paidBy: adminUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await payoutRepository.create(record);
    await earningsRepository.markPaid(owed.map((e) => e.id));
    return record;
  }

  /**
   * Every teacher currently owed something, highest balance first. Aggregated in memory from the
   * full ledger (see earningsRepository.listAll for why) — fine at this phase's scale; this is
   * an admin tool exercised by a human, not a hot path.
   */
  async getPayoutQueue(): Promise<PayoutQueueRow[]> {
    const all = await earningsRepository.listAll();
    const byTeacher = new Map<string, number>();
    for (const e of all) {
      if (e.state === 'paid') continue;
      byTeacher.set(e.teacherUid, (byTeacher.get(e.teacherUid) ?? 0) + e.amountPaise);
    }

    const rows = await Promise.all(
      Array.from(byTeacher.entries())
        .filter(([, balancePaise]) => balancePaise > 0)
        .map(async ([teacherUid, balancePaise]) => {
          const profile = await teacherProfileService.get(teacherUid);
          return { teacherUid, balancePaise, displayName: profile?.displayName ?? null, email: profile?.email ?? null };
        }),
    );
    return rows.sort((a, b) => b.balancePaise - a.balancePaise);
  }
}

export const earningsService = new EarningsService();
