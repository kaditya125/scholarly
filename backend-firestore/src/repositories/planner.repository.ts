import { db } from '../config/firebase';
import { StudyGoal, Timetable, DailyTask } from '../types';

export class PlannerRepository {
  private goalsCollection = db.collection('study_goals');
  private timetablesCollection = db.collection('timetables');

  async createGoal(goal: Omit<StudyGoal, 'id'>): Promise<StudyGoal> {
    const docRef = this.goalsCollection.doc();
    const newGoal = { id: docRef.id, ...goal };
    await docRef.set(newGoal);
    return newGoal;
  }

  async getGoalByUserId(userId: string): Promise<StudyGoal | null> {
    const snapshot = await this.goalsCollection.where('userId', '==', userId).limit(1).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as StudyGoal;
  }

  async upsertTimetable(userId: string, timetable: Omit<Timetable, 'id'>): Promise<Timetable> {
    const docRef = this.timetablesCollection.doc(userId); // 1:1 mapping for simplicity
    const newTimetable = { id: userId, ...timetable };
    await docRef.set(newTimetable, { merge: true });
    return newTimetable;
  }

  async getTimetableByUserId(userId: string): Promise<Timetable | null> {
    const doc = await this.timetablesCollection.doc(userId).get();
    if (!doc.exists) return null;
    return doc.data() as Timetable;
  }
}
