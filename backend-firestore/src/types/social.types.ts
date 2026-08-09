/**
 * Social graph types for the Collaboration platform (Phase 1 — connection system).
 *
 * Collections:
 *   - userDirectory/{uid}                 queryable directory entry (name/photo + matching signals)
 *   - connections/{a__b}                  friend relationship, id = the two uids sorted + joined by "__"
 *   - follows/{follower__following}       one-directional follow
 *   - blocks/{blocker__blocked}           one-directional block
 */

export type ConnectionStatus = 'pending' | 'accepted' | 'declined';

/** A friend relationship between two users (canonical, one doc per pair). */
export interface Connection {
  id: string;               // `${a}__${b}` where [a,b] are the two uids sorted
  users: string[];          // sorted [uidA, uidB] — enables array-contains membership queries
  requesterId: string;      // who sent the request
  recipientId: string;      // who received it
  status: ConnectionStatus;
  createdAt: number;
  updatedAt: number;
  respondedAt?: number;
}

/** A one-directional follow (followerId follows followingId). */
export interface Follow {
  id: string;               // `${followerId}__${followingId}`
  followerId: string;
  followingId: string;
  createdAt: number;
}

/** A one-directional block (blockerId blocked blockedId). */
export interface Block {
  id: string;               // `${blockerId}__${blockedId}`
  blockerId: string;
  blockedId: string;
  createdAt: number;
}

/** Denormalized, queryable directory entry — the source of truth for peer discovery. */
export interface UserDirectoryEntry {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  // Learning-profile signals used for peer matching (mirrored from users/{uid}/profile/onboarding).
  goal?: string;
  board?: string;
  classLevel?: string;
  stream?: string;
  subjects?: string[];
  weakAreas?: string[];
  targetYear?: string;
  preparationLevel?: string;
  updatedAt: number;
}

/** The authenticated caller's relationship to another user. */
export type RelationshipState = 'self' | 'none' | 'connected' | 'incoming' | 'outgoing' | 'blocked';

/** A directory entry decorated with the caller's relationship + match context (for UI cards). */
export interface PeerCard extends UserDirectoryEntry {
  relationship: RelationshipState;
  isFollowing: boolean;
  mutuals: number;
  matchReasons: string[];
  score?: number;
}
