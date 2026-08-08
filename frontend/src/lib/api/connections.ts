import { api } from './client';

/** The authenticated caller's relationship to another user (mirrors the backend). */
export type RelationshipState = 'self' | 'none' | 'connected' | 'incoming' | 'outgoing' | 'blocked';

/** A discoverable peer decorated with the caller's relationship + match context. */
export interface PeerCard {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  goal?: string;
  board?: string;
  classLevel?: string;
  stream?: string;
  subjects?: string[];
  weakAreas?: string[];
  targetYear?: string;
  preparationLevel?: string;
  updatedAt: number;
  relationship: RelationshipState;
  isFollowing: boolean;
  mutuals: number;
  matchReasons: string[];
  score?: number;
}

export interface ConnectionRequests {
  incoming: PeerCard[];
  outgoing: PeerCard[];
}

/**
 * Social-graph API. The Firebase ID token is attached automatically by the axios interceptor, so
 * every call is scoped to the current user server-side — no uid is ever sent from the client.
 */
export const connectionsApi = {
  /** Refresh the caller's directory entry from their profile (call on first visit). */
  async sync(): Promise<void> {
    await api.post('/connections/sync');
  },
  /** The caller's accepted connections. */
  async list(): Promise<PeerCard[]> {
    const { data } = await api.get('/connections');
    return data;
  },
  /** Pending requests split into incoming (received) and outgoing (sent). */
  async requests(): Promise<ConnectionRequests> {
    const { data } = await api.get('/connections/requests');
    return data;
  },
  /** Ranked study-partner suggestions from learning-profile overlap. */
  async suggestions(limit?: number): Promise<PeerCard[]> {
    const { data } = await api.get('/connections/suggestions', {
      params: limit ? { limit } : undefined,
    });
    return data;
  },
  /** Name / email search over the directory. */
  async search(q: string): Promise<PeerCard[]> {
    const { data } = await api.get('/connections/search', { params: { q } });
    return data;
  },
  async sendRequest(targetId: string): Promise<void> {
    await api.post('/connections/requests', { targetId });
  },
  async accept(otherId: string): Promise<void> {
    await api.post(`/connections/requests/${otherId}/accept`);
  },
  async decline(otherId: string): Promise<void> {
    await api.post(`/connections/requests/${otherId}/decline`);
  },
  async cancelRequest(otherId: string): Promise<void> {
    await api.delete(`/connections/requests/${otherId}`);
  },
  async remove(otherId: string): Promise<void> {
    await api.delete(`/connections/${otherId}`);
  },
  async follow(targetId: string): Promise<void> {
    await api.post('/connections/follow', { targetId });
  },
  async unfollow(otherId: string): Promise<void> {
    await api.delete(`/connections/follow/${otherId}`);
  },
  async block(targetId: string): Promise<void> {
    await api.post('/connections/block', { targetId });
  },
  async unblock(otherId: string): Promise<void> {
    await api.delete(`/connections/block/${otherId}`);
  },
};
