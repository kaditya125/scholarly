import { db } from '../config/firebase';
import { StudyGroup } from '../types';

export class StudyGroupRepository {
  private collection = db.collection('studyGroups');

  async createGroup(group: StudyGroup): Promise<void> {
    await this.collection.doc(group.id).set(group);
  }

  async getGroupsByUser(userId: string): Promise<StudyGroup[]> {
    const snapshot = await this.collection.where('memberIds', 'array-contains', userId).get();
    return snapshot.docs.map(doc => doc.data() as StudyGroup);
  }

  async getGroupById(groupId: string): Promise<StudyGroup | null> {
    const doc = await this.collection.doc(groupId).get();
    return doc.exists ? (doc.data() as StudyGroup) : null;
  }

  async updateGroup(groupId: string, updates: Partial<StudyGroup>): Promise<void> {
    await this.collection.doc(groupId).update(updates);
  }
}

export const studyGroupRepository = new StudyGroupRepository();
