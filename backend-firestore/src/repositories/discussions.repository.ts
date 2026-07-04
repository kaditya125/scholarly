import { db } from '../config/firebase';
import { Discussion } from '../types';

export class DiscussionsRepository {
  private collection = db.collection('discussions');

  async findByRoom(roomId?: string, limit: number = 20): Promise<Discussion[]> {
    let query: FirebaseFirestore.Query = this.collection;

    if (roomId) {
      query = query.where('roomId', '==', roomId);
    }
    
    // Requires composite index: roomId ASC, createdAt DESC
    query = query.orderBy('createdAt', 'desc').limit(limit);
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Discussion));
  }
}
