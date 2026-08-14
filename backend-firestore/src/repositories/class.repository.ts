import { db } from '../config/firebase';
import { ClassRecord } from '../types/class';

/**
 * `classes/{classId}` — data access only. Every authorization decision lives in the service;
 * this layer deliberately has no opinion about who may call it, so that ownership logic exists
 * in exactly one place rather than being half-enforced in two.
 */
export class ClassRepository {
  private collection = db.collection('classes');

  ref(classId: string) {
    return this.collection.doc(classId);
  }

  /** A fresh document id, allocated client-side by the Admin SDK (no write yet). */
  newId(): string {
    return this.collection.doc().id;
  }

  async create(record: ClassRecord): Promise<void> {
    await this.ref(record.id).set(record);
  }

  async getById(classId: string): Promise<ClassRecord | null> {
    const snap = await this.ref(classId).get();
    return snap.exists ? (snap.data() as ClassRecord) : null;
  }

  /**
   * Classes owned by one teacher, newest first.
   *
   * Ordering by `createdAt` alongside the `ownerUid` equality filter needs a composite index
   * (ownerUid ASC, createdAt DESC). If that index is absent Firestore rejects the query with a
   * console link to create it — see the deployment note in the Phase 3D report.
   */
  async listByOwner(ownerUid: string, limit = 100): Promise<ClassRecord[]> {
    const snap = await this.collection
      .where('ownerUid', '==', ownerUid)
      .orderBy('createdAt', 'desc')
      .limit(Math.min(Math.max(limit, 1), 200))
      .get();
    return snap.docs.map((d) => d.data() as ClassRecord);
  }

  async update(classId: string, patch: Record<string, any>): Promise<void> {
    await this.ref(classId).update(patch);
  }
}

export const classRepository = new ClassRepository();
