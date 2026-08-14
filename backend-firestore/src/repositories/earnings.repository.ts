import { db } from '../config/firebase';
import { TeacherEarningEntry } from '../types/earnings';

/** `teacherEarnings/{id}` — data access only. Append-only: no update or delete method exists. */
export class EarningsRepository {
  private collection = db.collection('teacherEarnings');

  newId(): string {
    return this.collection.doc().id;
  }

  async create(entry: TeacherEarningEntry): Promise<void> {
    await this.collection.doc(entry.id).set(entry);
  }

  async listForTeacher(teacherUid: string): Promise<TeacherEarningEntry[]> {
    const snap = await this.collection.where('teacherUid', '==', teacherUid).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => d.data() as TeacherEarningEntry);
  }

  /** Every entry already written for a given order — used to make accrual idempotent. */
  async listForOrder(orderId: string): Promise<TeacherEarningEntry[]> {
    const snap = await this.collection.where('orderId', '==', orderId).get();
    return snap.docs.map((d) => d.data() as TeacherEarningEntry);
  }

  /**
   * Every entry across every teacher — used only by the admin payout queue to aggregate who is
   * owed what. No `where`/`orderBy` (avoids a composite-index requirement and Firestore's `!=`
   * quirks around missing fields); filtering by state happens in the service, in memory, matching
   * `payments.service.ts#getHistory`'s established pattern for admin-scale aggregation.
   */
  async listAll(): Promise<TeacherEarningEntry[]> {
    const snap = await this.collection.get();
    return snap.docs.map((d) => d.data() as TeacherEarningEntry);
  }

  /** Flips a batch of entries to `paid` — the one place `state` is ever updated after creation. */
  async markPaid(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.collection.doc(id).update({ state: 'paid' })));
  }
}

export const earningsRepository = new EarningsRepository();
