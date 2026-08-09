import { Request, Response } from 'express';
import { notificationService } from '../services/notification/notification.service';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_NOTIFICATIONS = [
  {
    title: 'Welcome to Scholarly',
    body: 'Your account has been created successfully. Welcome to your AI-powered learning journey!',
    category: 'system',
    type: 'success',
    priority: 'high',
    actionUrl: '/dashboard',
    isRead: false,
    isArchived: false,
  },
  {
    title: 'Complete Your Profile',
    body: 'Finish your profile to unlock AI personalization and tailored study roadmaps.',
    category: 'learning',
    type: 'info',
    priority: 'medium',
    actionUrl: '/onboarding',
    isRead: false,
    isArchived: false,
  },
  {
    title: 'AI Baseline Assessment',
    body: 'Take the assessment to discover your academic level and build your Student Digital Twin.',
    category: 'ai',
    type: 'assessment',
    priority: 'high',
    actionUrl: '/baseline-assessment',
    isRead: false,
    isArchived: false,
  },
  {
    title: 'Create Your First Notebook',
    body: 'Upload a PDF or add notes to build your first interactive study workspace.',
    category: 'learning',
    type: 'education',
    priority: 'medium',
    actionUrl: '/notebooks',
    isRead: false,
    isArchived: false,
  },
  {
    title: 'Chat with AI Tutor',
    body: 'Ask any question and receive step-by-step explanations from your AI assistant.',
    category: 'ai',
    type: 'assistant',
    priority: 'medium',
    actionUrl: '/chat',
    isRead: false,
    isArchived: false,
  }
];

export class NotificationsController {
  
  /**
   * Retrieves paginated notifications for the user. Auto-seeds defaults if empty.
   */
  async getNotifications(req: Request, res: Response) {
    try {
      const userId = (req as any).user.uid;
      const { limit = 20, cursor } = req.query;

      const userNotificationsRef = getFirestore()
        .collection('users')
        .doc(userId)
        .collection('notifications');

      let snapshot = await userNotificationsRef
        .orderBy('createdAt', 'desc')
        .limit(Number(limit))
        .get();

      if (snapshot.empty && !cursor) {
        // Seed default onboarding notifications
        const batch = getFirestore().batch();
        const now = new Date();
        DEFAULT_NOTIFICATIONS.forEach((item, index) => {
          const docRef = userNotificationsRef.doc();
          const timeOffset = new Date(now.getTime() - (DEFAULT_NOTIFICATIONS.length - 1 - index) * 60000).toISOString();
          batch.set(docRef, {
            id: docRef.id,
            userId,
            ...item,
            createdAt: timeOffset,
            updatedAt: timeOffset
          });
        });
        await batch.commit();

        snapshot = await userNotificationsRef
          .orderBy('createdAt', 'desc')
          .limit(Number(limit))
          .get();
      }

      const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      res.status(200).json({ notifications });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Marks a single notification as read.
   */
  async markAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).user.uid;
      const { id } = req.params;

      await getFirestore()
        .collection('users')
        .doc(userId)
        .collection('notifications')
        .doc(id)
        .update({ isRead: true });

      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Marks all notifications as read.
   */
  async markAllAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).user.uid;
      const batch = getFirestore().batch();
      
      const unreadSnap = await getFirestore()
        .collection('users')
        .doc(userId)
        .collection('notifications')
        .where('isRead', '==', false)
        .get();

      unreadSnap.docs.forEach(doc => {
        batch.update(doc.ref, { isRead: true });
      });

      await batch.commit();

      res.status(200).json({ success: true, count: unreadSnap.size });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Archives a single notification.
   */
  async archive(req: Request, res: Response) {
    try {
      const userId = (req as any).user.uid;
      const { id } = req.params;

      await getFirestore()
        .collection('users')
        .doc(userId)
        .collection('notifications')
        .doc(id)
        .update({ isArchived: true });

      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Updates notification preferences.
   */
  async updatePreferences(req: Request, res: Response) {
    try {
      const userId = (req as any).user.uid;
      const preferences = req.body;

      await getFirestore()
        .collection('users')
        .doc(userId)
        .collection('notification_preferences')
        .doc('config')
        .set(preferences, { merge: true });

      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
