import { api } from './client';
export interface NotificationPayload {
  id: string;
  userId: string;
  category: string;
  type: string;
  title: string;
  body: string;
  priority?: 'critical' | 'high' | 'medium' | 'low' | 'silent';
  avatar?: string;
  targetBadge?: string;
  quote?: string;
  actionUrl?: string;
  actions?: string[];
  actionState?: 'accepted' | 'declined' | 'joined' | 'ignored' | null;
  metadata?: Record<string, any>;
  isRead: boolean;
  isArchived: boolean;
  createdAt: string;
}

export const notificationsApi = {
  /**
   * Fetches paginated notifications via REST API.
   * Note: In practice, we use Firestore onSnapshot for real-time sync, 
   * but this is useful for initial hydration or fallback.
   */
  getNotifications: async (limit: number = 20, cursor?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.append('cursor', cursor);
    const { data } = await api.get<{ notifications: NotificationPayload[] }>(`/notifications?${params}`);
    return data;
  },

  markAsRead: async (id: string) => {
    const { data } = await api.post(`/notifications/${id}/read`);
    return data;
  },

  markAllAsRead: async () => {
    const { data } = await api.post<{ success: boolean; count: number }>('/notifications/mark-all-read');
    return data;
  },

  archive: async (id: string) => {
    const { data } = await api.post(`/notifications/${id}/archive`);
    return data;
  },

  updatePreferences: async (preferences: Record<string, boolean>) => {
    const { data } = await api.put('/notifications/preferences', preferences);
    return data;
  }
};
