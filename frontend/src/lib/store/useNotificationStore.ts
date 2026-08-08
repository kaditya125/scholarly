import create from 'zustand';
import { doc, updateDoc, writeBatch, collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { NotificationPayload, notificationsApi } from '../api/notifications';

interface NotificationState {
  notifications: NotificationPayload[];
  unreadCount: number;
  isSyncing: boolean;
  preferences: Record<string, boolean>;
  limit: number;
  hasMore: boolean;
  
  // Actions
  setNotifications: (notifications: NotificationPayload[]) => void;
  addNotification: (notification: NotificationPayload) => void;
  updateNotification: (id: string, updates: Partial<NotificationPayload>) => void;
  removeNotification: (id: string) => void;
  
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  archive: (id: string) => Promise<void>;
  handleAction: (id: string, actionState: 'accepted' | 'declined' | 'joined' | 'ignored') => Promise<void>;
  
  setPreferences: (prefs: Record<string, boolean>) => void;
  updatePreferences: (prefs: Record<string, boolean>) => Promise<void>;
  
  setHasMore: (hasMore: boolean) => void;
  loadMore: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isSyncing: false,
  preferences: {},
  limit: 20,
  hasMore: true,

  setNotifications: (notifications) => {
    const unreadCount = notifications.filter(n => !n.isRead && !n.isArchived).length;
    set({ notifications, unreadCount });
  },

  addNotification: (notification) => {
    set((state) => {
      // Prevent duplicates
      if (state.notifications.some(n => n.id === notification.id)) return state;
      
      const newNotifications = [notification, ...state.notifications];
      const unreadCount = newNotifications.filter(n => !n.isRead && !n.isArchived).length;
      return { notifications: newNotifications, unreadCount };
    });
  },

  updateNotification: (id, updates) => {
    set((state) => {
      const newNotifications = state.notifications.map(n => 
        n.id === id ? { ...n, ...updates } : n
      );
      const unreadCount = newNotifications.filter(n => !n.isRead && !n.isArchived).length;
      return { notifications: newNotifications, unreadCount };
    });
  },

  removeNotification: (id) => {
    set((state) => {
      const newNotifications = state.notifications.filter(n => n.id !== id);
      const unreadCount = newNotifications.filter(n => !n.isRead && !n.isArchived).length;
      return { notifications: newNotifications, unreadCount };
    });
  },

  markAsRead: async (id) => {
    // Optimistic update
    get().updateNotification(id, { isRead: true });
    try {
      const user = auth.currentUser;
      if (user) {
        const ref = doc(db, 'users', user.uid, 'notifications', id);
        await updateDoc(ref, { isRead: true, read: true });
      }
      await notificationsApi.markAsRead(id).catch(() => {});
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  },

  markAllAsRead: async () => {
    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, isRead: true })),
      unreadCount: 0
    }));

    try {
      const user = auth.currentUser;
      if (user) {
        const notificationsRef = collection(db, 'users', user.uid, 'notifications');
        const snap = await getDocs(notificationsRef);
        const batch = writeBatch(db);
        snap.docs.forEach(docSnap => {
          batch.update(docSnap.ref, { isRead: true, read: true });
        });
        await batch.commit();
      }
      await notificationsApi.markAllAsRead().catch(() => {});
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  },

  archive: async (id) => {
    get().updateNotification(id, { isArchived: true });
    try {
      const user = auth.currentUser;
      if (user) {
        const ref = doc(db, 'users', user.uid, 'notifications', id);
        await updateDoc(ref, { isArchived: true, archived: true });
      }
      await notificationsApi.archive(id).catch(() => {});
    } catch (error) {
      console.error('Failed to archive notification:', error);
    }
  },

  handleAction: async (id, actionState) => {
    get().updateNotification(id, { actionState, isRead: true });
    try {
      const user = auth.currentUser;
      if (user) {
        const ref = doc(db, 'users', user.uid, 'notifications', id);
        await updateDoc(ref, { actionState, isRead: true, read: true });
      }
    } catch (error) {
      console.error('Failed to handle notification action:', error);
    }
  },

  setPreferences: (prefs) => set({ preferences: prefs }),
  
  updatePreferences: async (prefs) => {
    // Optimistic
    const prev = get().preferences;
    set({ preferences: { ...prev, ...prefs } });
    try {
      await notificationsApi.updatePreferences(prefs);
    } catch (error) {
      console.error('Failed to update preferences:', error);
      set({ preferences: prev });
    }
  },
  
  setHasMore: (hasMore) => set({ hasMore }),
  
  loadMore: () => set((state) => ({ limit: state.limit + 20 }))
}));
