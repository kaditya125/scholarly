import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, onSnapshot, limit, doc } from 'firebase/firestore';
import { auth } from '../firebase';
import { db } from '../firestore';
import { useNotificationStore } from '../store/useNotificationStore';
import { NotificationPayload } from '../api/notifications';
import { purgeMockNotifications } from '../api/realtimeNotifications';

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

      // Purge any legacy mock notifications (John Sharma, Michael Scott, Claire Ross)
      purgeMockNotifications(user.uid);

      // Listen to Real Live Notifications
      const notificationsRef = collection(db, 'users', user.uid, 'notifications');
      const q = query(notificationsRef, limit(limitCount));

      unsubscribeNotifications = onSnapshot(q, (snapshot) => {
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
        console.warn('Firestore notifications snapshot listener:', err);
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
