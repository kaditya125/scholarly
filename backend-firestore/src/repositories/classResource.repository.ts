import { db } from '../config/firebase';
import { ClassResourceRecord } from '../types/classResource';

/** `classResources/{id}` — data access only. Ownership/authorization lives in the service. */
export class ClassResourceRepository {
  private collection = db.collection('classResources');

  ref(id: string) {
    return this.collection.doc(id);
  }

  newId(): string {
    return this.collection.doc().id;
  }

  async create(record: ClassResourceRecord): Promise<void> {
    await this.ref(record.id).set(record);
  }

  async getById(id: string): Promise<ClassResourceRecord | null> {
    const snap = await this.ref(id).get();
    return snap.exists ? (snap.data() as ClassResourceRecord) : null;
  }

  async listByClass(classId: string): Promise<ClassResourceRecord[]> {
    const snap = await this.collection.where('classId', '==', classId).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => d.data() as ClassResourceRecord);
  }

  async update(id: string, patch: Record<string, any>): Promise<void> {
    await this.ref(id).update(patch);
  }

  async delete(id: string): Promise<void> {
    await this.ref(id).delete();
  }
}

export const classResourceRepository = new ClassResourceRepository();
