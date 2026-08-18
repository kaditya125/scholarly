import { useEffect } from 'react';
import { collection, query, onSnapshot, limit, doc, setDoc, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { useNotificationStore } from '../store/useNotificationStore';
import { NotificationPayload } from '../api/notifications';

const DEFAULT_NOTIFICATIONS = [
  {
    title: 'John Sharma sent you a friend request',
    body: 'Accept to start learning together, compare progress, and share study notes.',
    category: 'social',
    type: 'friend_request',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    actions: ['Accept', 'Decline'],
    priority: 'high',
    isRead: false,
    isArchived: false,
    hoursAgo: 1
  },
  {
    title: 'Claire Ross mentioned you in a comment',
    body: 'Hey @Aditya! Check out the updated formula sheet for Thermodynamics.',
    category: 'social',
    type: 'mention',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    targetBadge: 'Class 10 Physics',
    quote: 'This looks great @Aditya. Just change the primary color to blue and move forward with unit 4.',
    actionUrl: '/chat',
    priority: 'medium',
    isRead: false,
    isArchived: false,
    hoursAgo: 2
  },
  {
    title: 'Michael Scott invited you to join a study group',
    body: 'Join JEE Rankers 2026 to collaborate on daily mock tests and flashcards.',
    category: 'social',
    type: 'study_group_invitation',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    targetBadge: 'JEE Rankers 2026',
    actions: ['Join', 'Later'],
    priority: 'medium',
    isRead: false,
    isArchived: false,
    hoursAgo: 4
  },
  {
    title: 'Take AI Baseline Assessment',
    body: 'Discover your current academic level and unlock your Student Digital Twin roadmap.',
    category: 'ai',
    type: 'assessment',
    targetBadge: 'Digital Twin v1',
    actionUrl: '/baseline-assessment',
    actions: ['Start Assessment'],
    priority: 'high',
    isRead: false,
    isArchived: false,
    hoursAgo: 6
  },
  {
    title: 'AI Tutor solved your doubt',
    body: 'Step-by-step solution for Newton\'s 3rd Law numerical is ready for review.',
    category: 'ai',
    type: 'ai_message',
    actionUrl: '/chat',
    priority: 'medium',
    isRead: true,
    isArchived: false,
    hoursAgo: 24
  },
  {
    title: 'Weekly Progress Report Available',
    body: 'You improved by 12% this week! Badge unlocked: Consistent Learner 🎉',
    category: 'achievement',
    type: 'achievement',
    targetBadge: 'Consistent Learner',
    actionUrl: '/report',
    priority: 'medium',
    isRead: true,
    isArchived: false,
    hoursAgo: 30
  },
  {
    title: 'Welcome to Sadhya!',
    body: 'Your account has been successfully created. Explore AI tutoring, notebooks, and adaptive learning.',
    category: 'system',
    type: 'welcome',
    actionUrl: '/dashboard',
    priority: 'high',
    isRead: true,
    isArchived: false,
    hoursAgo: 48
  }
];

let isSeeding = false;

async function seedDefaultNotifications(userId: string) {
  if (isSeeding) return;
  isSeeding = true;
  try {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const snapshot = await getDocs(notificationsRef);
    if (!snapshot.empty) {
      isSeeding = false;
      return;
    }

    const now = new Date();
    for (let i = 0; i < DEFAULT_NOTIFICATIONS.length; i++) {
      const item = DEFAULT_NOTIFICATIONS[i];
      const docRef = doc(notificationsRef);
      const timeOffset = new Date(now.getTime() - (item.hoursAgo || (i + 1)) * 3600 * 1000).toISOString();
      await setDoc(docRef, {
        id: docRef.id,
        userId,
        ...item,
        createdAt: timeOffset,
        updatedAt: timeOffset
      });
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
      // Expected when client lacks direct collection write permissions (handled server-side)
    } else {
      console.warn('Notice: Default notification seeding skipped:', err?.message || err);
    }
  } finally {
    isSeeding = false;
  }
}

export function useNotificationsSync() {
  const setNotifications = useNotificationStore(state => state.setNotifications);
  const setPreferences = useNotificationStore(state => state.setPreferences);
  const setHasMore = useNotificationStore(state => state.setHasMore);
  const limitCount = useNotificationStore(state => state.limit);

  useEffect(() => {
    let unsubscribeNotifications: (() => void) | null = null;
    let unsubscribePrefs: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeNotifications) unsubscribeNotifications();
      if (unsubscribePrefs) unsubscribePrefs();

      if (!user) {
        setNotifications([]);
        return;
      }

      // Check and seed default notifications if empty
      seedDefaultNotifications(user.uid);

      // Listen to Notifications
      const notificationsRef = collection(db, 'users', user.uid, 'notifications');
      const q = query(notificationsRef, limit(limitCount));

      unsubscribeNotifications = onSnapshot(q, (snapshot) => {
        if (snapshot.empty && !isSeeding) {
          seedDefaultNotifications(user.uid);
          return;
        }

        const notifications: NotificationPayload[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          notifications.push({
            id: docSnap.id,
            userId: user.uid,
            category: data.category || 'system',
            type: data.type || 'system',
            title: data.title || '',
            body: data.body || data.message || '',
            priority: data.priority || 'medium',
            avatar: data.avatar || undefined,
            targetBadge: data.targetBadge || undefined,
            quote: data.quote || undefined,
            actionUrl: data.actionUrl || '',
            actions: data.actions || [],
            actionState: data.actionState || null,
            isRead: Boolean(data.isRead || data.read),
            isArchived: Boolean(data.isArchived || data.archived),
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
          });
        });

        // Client-side sort by createdAt descending
        notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setNotifications(notifications);
        setHasMore(notifications.length === limitCount);
      }, (err) => {
        console.warn('Firestore notifications snapshot error, falling back:', err);
      });

      // Listen to Preferences
      const prefsRef = doc(db, 'users', user.uid, 'notification_preferences', 'config');
      unsubscribePrefs = onSnapshot(prefsRef, (docSnap) => {
        if (docSnap.exists()) {
          setPreferences(docSnap.data() as Record<string, boolean>);
        }
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeNotifications) unsubscribeNotifications();
      if (unsubscribePrefs) unsubscribePrefs();
    };
  }, [limitCount, setNotifications, setPreferences, setHasMore]);
}
