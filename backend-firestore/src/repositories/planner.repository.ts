import { db } from '../config/firebase';
import { PlannerTask } from '../types';

export class PlannerRepository {
  private collection = db.collection('planner_tasks');

  async findAllByUser(userId: string): Promise<PlannerTask[]> {
    // In a real app with multi-tenant, we would filter by userId. 
    // Assuming for now the planner applies to the global platform or has a userId field.
    // For this prototype schema, we just fetch all or filter if needed.
    const snapshot = await this.collection.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlannerTask));
  }
}
