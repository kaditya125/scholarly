import { db } from '../config/firebase';
import { TeacherPayoutRecord } from '../types/earnings';

/** `teacherPayouts/{id}` — data access only. Append-only: no update or delete method exists. */
export class PayoutRepository {
  private collection = db.collection('teacherPayouts');

  newId(): string {
    return this.collection.doc().id;
  }

  async create(record: TeacherPayoutRecord): Promise<void> {
    await this.collection.doc(record.id).set(record);
  }

  async listForTeacher(teacherUid: string): Promise<TeacherPayoutRecord[]> {
    const snap = await this.collection.where('teacherUid', '==', teacherUid).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => d.data() as TeacherPayoutRecord);
  }
}

export const payoutRepository = new PayoutRepository();
