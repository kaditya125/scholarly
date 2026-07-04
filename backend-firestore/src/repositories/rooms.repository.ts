import { db } from '../config/firebase';
import { Room } from '../types';

export class RoomsRepository {
  private collection = db.collection('rooms');

  async findAll(): Promise<Room[]> {
    const snapshot = await this.collection.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
  }
}
