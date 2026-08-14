import { db } from '../config/firebase';
import { ClassPostRecord } from '../types/classPost';

/** `classPosts/{id}` — data access only. Ownership/authorization lives in the service. */
export class ClassPostRepository {
  private collection = db.collection('classPosts');

  ref(id: string) {
    return this.collection.doc(id);
  }

  newId(): string {
    return this.collection.doc().id;
  }

  async create(record: ClassPostRecord): Promise<void> {
    await this.ref(record.id).set(record);
  }

  async getById(id: string): Promise<ClassPostRecord | null> {
    const snap = await this.ref(id).get();
    return snap.exists ? (snap.data() as ClassPostRecord) : null;
  }

  /** Oldest first — a feed reads top-to-bottom like a chat thread, replies following what they reply to. */
  async listByClass(classId: string): Promise<ClassPostRecord[]> {
    const snap = await this.collection.where('classId', '==', classId).orderBy('createdAt', 'asc').get();
    return snap.docs.map((d) => d.data() as ClassPostRecord);
  }
}

export const classPostRepository = new ClassPostRepository();
