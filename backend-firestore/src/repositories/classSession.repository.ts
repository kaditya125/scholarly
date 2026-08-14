import { db } from '../config/firebase';
import { ClassSessionRecord } from '../types/classSession';

/** `classSessions/{id}` — data access only. Ownership/authorization lives in the service. */
export class ClassSessionRepository {
  private collection = db.collection('classSessions');

  ref(id: string) {
    return this.collection.doc(id);
  }

  newId(): string {
    return this.collection.doc().id;
  }

  async create(record: ClassSessionRecord): Promise<void> {
    await this.ref(record.id).set(record);
  }

  async getById(id: string): Promise<ClassSessionRecord | null> {
    const snap = await this.ref(id).get();
    return snap.exists ? (snap.data() as ClassSessionRecord) : null;
  }

  async update(id: string, patch: Record<string, any>): Promise<void> {
    await this.ref(id).update(patch);
  }

  async listByClass(classId: string): Promise<ClassSessionRecord[]> {
    const snap = await this.collection.where('classId', '==', classId).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => d.data() as ClassSessionRecord);
  }

  /** The class's current live session, if any — at most one at a time (enforced in the service). */
  async findLiveByClass(classId: string): Promise<ClassSessionRecord | null> {
    const snap = await this.collection.where('classId', '==', classId).where('status', '==', 'live').limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() as ClassSessionRecord);
  }
}

export const classSessionRepository = new ClassSessionRepository();
