import { db } from '../../config/firebase';
import { FieldValue } from 'firebase-admin/firestore';

export class DeviceService {
  /**
   * Registers a new FCM token for a user.
   */
  async registerToken(userId: string, token: string): Promise<void> {
    const userRef = db.collection('users').doc(userId);
    await userRef.set({
      fcmTokens: FieldValue.arrayUnion(token)
    }, { merge: true });
  }

  /**
   * Removes a stale or revoked FCM token.
   */
  async unregisterToken(userId: string, token: string): Promise<void> {
    const userRef = db.collection('users').doc(userId);
    await userRef.set({
      fcmTokens: FieldValue.arrayRemove(token)
    }, { merge: true });
  }

  /**
   * Retrieves all active FCM tokens for a user.
   */
  async getTokens(userId: string): Promise<string[]> {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return [];
    return doc.data()?.fcmTokens || [];
  }
}

export const deviceService = new DeviceService();
