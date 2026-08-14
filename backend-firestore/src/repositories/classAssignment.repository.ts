import { db } from '../config/firebase';
import { AssignmentAttemptPointer, ClassAssignmentRecord } from '../types/classAssignment';

/** `classAssignments/{id}` and `classAssignmentAttempts/{id}` — data access only. */
export class ClassAssignmentRepository {
  private assignments = db.collection('classAssignments');
  private pointers = db.collection('classAssignmentAttempts');

  ref(id: string) {
    return this.assignments.doc(id);
  }

  newId(): string {
    return this.assignments.doc().id;
  }

  async create(record: ClassAssignmentRecord): Promise<void> {
    await this.ref(record.id).set(record);
  }

  async getById(id: string): Promise<ClassAssignmentRecord | null> {
    const snap = await this.ref(id).get();
    return snap.exists ? (snap.data() as ClassAssignmentRecord) : null;
  }

  async listByClass(classId: string): Promise<ClassAssignmentRecord[]> {
    const snap = await this.assignments.where('classId', '==', classId).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => d.data() as ClassAssignmentRecord);
  }

  async update(id: string, patch: Record<string, any>): Promise<void> {
    await this.ref(id).update(patch);
  }

  /* ── Attempt pointers ──────────────────────────────────────────────────────────────── */

  pointerRef(id: string) {
    return this.pointers.doc(id);
  }

  async getPointer(id: string): Promise<AssignmentAttemptPointer | null> {
    const snap = await this.pointerRef(id).get();
    return snap.exists ? (snap.data() as AssignmentAttemptPointer) : null;
  }

  async createPointer(pointer: AssignmentAttemptPointer): Promise<void> {
    await this.pointerRef(pointer.id).set(pointer);
  }

  async listPointersByAssignment(assignmentId: string): Promise<AssignmentAttemptPointer[]> {
    const snap = await this.pointers.where('assignmentId', '==', assignmentId).get();
    return snap.docs.map((d) => d.data() as AssignmentAttemptPointer);
  }
}

export const classAssignmentRepository = new ClassAssignmentRepository();
