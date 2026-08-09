import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { NotificationPayload, NotificationAnalytics } from '../../core/notifications/NotificationEngine';
import { v4 as uuidv4 } from 'uuid';

export interface NotificationDocument extends NotificationPayload {
  id: string;
  isRead: boolean;
  isArchived: boolean;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface UserNotificationPreferences {
  [key: string]: any;
  // Category flags (flat for backward compatibility)
  learning: boolean;
  ai: boolean;
  system: boolean;
  security: boolean;
  social: boolean;
  administrative: boolean;
  subscription: boolean;
  payment: boolean;
  achievement: boolean;
  reminder: boolean;
  progress: boolean;
  recommendation: boolean;

  // New Channel settings
  channels: {
    inApp: boolean;
    push: boolean;
    email: boolean;
    whatsapp: boolean;
    sms: boolean;
  };

  // Contacts
  phoneNumber?: string;
  whatsappNumber?: string;
  preferredChannels: ('inApp' | 'push' | 'email' | 'whatsapp' | 'sms')[];
  quietHours?: { start: string; end: string }; // e.g. { start: "22:00", end: "07:00" }
  timezone: string;
  consent: {
    marketing: boolean;
    transactional: boolean;
    lastUpdated: number;
  };
}

class NotificationService {
  private getDefaults(): UserNotificationPreferences {
    return {
      learning: true,
      ai: true,
      system: true,
      security: true,
      social: true,
      administrative: true,
      subscription: true,
      payment: true,
      achievement: true,
      reminder: true,
      progress: true,
      recommendation: true,
      channels: {
        inApp: true,
        push: true,
        email: true,
        whatsapp: false, // off by default, opt-in
        sms: false // off by default, opt-in
      },
      preferredChannels: ['inApp', 'push'],
      timezone: 'Asia/Kolkata',
      consent: {
        marketing: false,
        transactional: true,
        lastUpdated: Date.now()
      }
    };
  }

  /**
   * Retrieves user's notification preferences.
   * If they don't exist, returns default open preferences.
   */
  async getPreferences(userId: string): Promise<UserNotificationPreferences> {
    const db = getFirestore();
    const doc = await db.collection('users').doc(userId).collection('notification_preferences').doc('config').get();
    
    const defaults = this.getDefaults();
    if (!doc.exists) {
      return defaults;
    }

    const data = doc.data() || {};
    return {
      ...defaults,
      ...data,
      channels: {
        ...defaults.channels,
        ...(data.channels || {})
      },
      consent: {
        ...defaults.consent,
        ...(data.consent || {})
      }
    } as UserNotificationPreferences;
  }

  /**
   * Updates user's notification preferences.
   */
  async updatePreferences(userId: string, updates: Partial<UserNotificationPreferences>): Promise<void> {
    const db = getFirestore();
    await db
      .collection('users')
      .doc(userId)
      .collection('notification_preferences')
      .doc('config')
      .set(updates, { merge: true });
  }


  /**
   * Stores a newly generated notification into Firestore.
   */
  async createNotification(payload: NotificationPayload): Promise<void> {
    const db = getFirestore();
    const notificationId = uuidv4();
    
    const doc: NotificationDocument = {
      ...payload,
      id: notificationId,
      isRead: false,
      isArchived: false,
      createdAt: FieldValue.serverTimestamp() as FirebaseFirestore.Timestamp,
    };

    await db
      .collection('users')
      .doc(payload.userId)
      .collection('notifications')
      .doc(notificationId)
      .set(doc);
  }

  /**
   * Marks a notification as read and tracks CTR if clicked.
   */
  async markRead(userId: string, notificationId: string, clickedActionUrl?: string): Promise<void> {
    const db = getFirestore();
    const docRef = db.collection('users').doc(userId).collection('notifications').doc(notificationId);
    
    await docRef.update({
      isRead: true,
      readAt: FieldValue.serverTimestamp()
    });

    if (clickedActionUrl) {
      await NotificationAnalytics.trackClicked(notificationId, clickedActionUrl);
    }
  }
}

export const notificationService = new NotificationService();
