"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerRepository = void 0;
const firebase_1 = require("../config/firebase");
class PlannerRepository {
    collection = firebase_1.db.collection('planner_tasks');
    async findAllByUser(userId) {
        // In a real app with multi-tenant, we would filter by userId. 
        // Assuming for now the planner applies to the global platform or has a userId field.
        // For this prototype schema, we just fetch all or filter if needed.
        const snapshot = await this.collection.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
}
exports.PlannerRepository = PlannerRepository;
