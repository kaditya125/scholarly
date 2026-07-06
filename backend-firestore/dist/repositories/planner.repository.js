"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerRepository = void 0;
const firebase_1 = require("../config/firebase");
class PlannerRepository {
    goalsCollection = firebase_1.db.collection('study_goals');
    timetablesCollection = firebase_1.db.collection('timetables');
    async createGoal(goal) {
        const docRef = this.goalsCollection.doc();
        const newGoal = { id: docRef.id, ...goal };
        await docRef.set(newGoal);
        return newGoal;
    }
    async getGoalByUserId(userId) {
        const snapshot = await this.goalsCollection.where('userId', '==', userId).limit(1).get();
        if (snapshot.empty)
            return null;
        return snapshot.docs[0].data();
    }
    async upsertTimetable(userId, timetable) {
        const docRef = this.timetablesCollection.doc(userId); // 1:1 mapping for simplicity
        const newTimetable = { id: userId, ...timetable };
        await docRef.set(newTimetable, { merge: true });
        return newTimetable;
    }
    async getTimetableByUserId(userId) {
        const doc = await this.timetablesCollection.doc(userId).get();
        if (!doc.exists)
            return null;
        return doc.data();
    }
}
exports.PlannerRepository = PlannerRepository;
