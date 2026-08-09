import { db } from '../config/firebase';
import {
  Connection,
  ConnectionStatus,
  Follow,
  Block,
  UserDirectoryEntry,
} from '../types/social.types';

/** Canonical id for a relationship between two users — order-independent. */
export const pairId = (a: string, b: string): string => [a, b].sort().join('__');

/**
 * Firestore access for the social graph. Kept index-light on purpose: list queries use a single
 * equality / array-contains predicate and filter the (small) result set by status in memory, so no
 * composite indexes are required to ship. Discovery reads a denormalized `userDirectory` collection
 * because the learning profile lives in a per-user subcollection that is not queryable across users.
 */
export class ConnectionRepository {
  private directory = db.collection('userDirectory');
  private connections = db.collection('connections');
  private follows = db.collection('follows');
  private blocks = db.collection('blocks');

  // ─── Directory ──────────────────────────────────────────────────────────────

  async upsertDirectory(entry: UserDirectoryEntry): Promise<void> {
    await this.directory.doc(entry.uid).set(entry, { merge: true });
  }

  async getDirectory(uid: string): Promise<UserDirectoryEntry | null> {
    const doc = await this.directory.doc(uid).get();
    return doc.exists ? (doc.data() as UserDirectoryEntry) : null;
  }

  /** Batched `in` lookup (Firestore caps `in` at 10 values per query). */
  async getDirectoryMany(uids: string[]): Promise<UserDirectoryEntry[]> {
    const unique = [...new Set(uids)].filter(Boolean);
    const out: UserDirectoryEntry[] = [];
    for (let i = 0; i < unique.length; i += 10) {
      const chunk = unique.slice(i, i + 10);
      if (chunk.length === 0) continue;
      const snap = await this.directory.where('uid', 'in', chunk).get();
      snap.docs.forEach((d) => out.push(d.data() as UserDirectoryEntry));
    }
    return out;
  }

  async queryDirectoryByGoal(goal: string, limit = 60): Promise<UserDirectoryEntry[]> {
    const snap = await this.directory.where('goal', '==', goal).limit(limit).get();
    return snap.docs.map((d) => d.data() as UserDirectoryEntry);
  }

  async recentDirectory(limit = 60): Promise<UserDirectoryEntry[]> {
    const snap = await this.directory.orderBy('updatedAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => d.data() as UserDirectoryEntry);
  }

  /** Reads the student's onboarding profile (source of the directory's matching signals). */
  async getProfile(uid: string): Promise<Record<string, any> | null> {
    const doc = await db.collection('users').doc(uid).collection('profile').doc('onboarding').get();
    return doc.exists ? (doc.data() as Record<string, any>) : null;
  }

  // ─── Connections ─────────────────────────────────────────────────────────────

  async getConnection(a: string, b: string): Promise<Connection | null> {
    const doc = await this.connections.doc(pairId(a, b)).get();
    return doc.exists ? (doc.data() as Connection) : null;
  }

  async setConnection(connection: Connection): Promise<void> {
    await this.connections.doc(connection.id).set(connection);
  }

  async updateConnection(id: string, patch: Partial<Connection>): Promise<void> {
    await this.connections.doc(id).update(patch);
  }

  async deleteConnection(id: string): Promise<void> {
    await this.connections.doc(id).delete();
  }

  /** Accepted connections for a user (status filtered in memory to avoid a composite index). */
  async listConnections(uid: string): Promise<Connection[]> {
    const snap = await this.connections.where('users', 'array-contains', uid).get();
    return snap.docs
      .map((d) => d.data() as Connection)
      .filter((c) => c.status === 'accepted');
  }

  /** Pending requests received by `uid`. */
  async listIncoming(uid: string): Promise<Connection[]> {
    const snap = await this.connections.where('recipientId', '==', uid).get();
    return snap.docs
      .map((d) => d.data() as Connection)
      .filter((c) => c.status === 'pending');
  }

  /** Pending requests sent by `uid`. */
  async listOutgoing(uid: string): Promise<Connection[]> {
    const snap = await this.connections.where('requesterId', '==', uid).get();
    return snap.docs
      .map((d) => d.data() as Connection)
      .filter((c) => c.status === 'pending');
  }

  /** All relationships (any status) touching `uid` — used to build exclusion sets for suggestions. */
  async listAllForUser(uid: string): Promise<Connection[]> {
    const snap = await this.connections.where('users', 'array-contains', uid).get();
    return snap.docs.map((d) => d.data() as Connection);
  }

  async countConnections(uid: string): Promise<number> {
    return (await this.listConnections(uid)).length;
  }

  // ─── Follows ───────────────────────────────────────────────────────────────

  async follow(follow: Follow): Promise<void> {
    await this.follows.doc(follow.id).set(follow);
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    await this.follows.doc(`${followerId}__${followingId}`).delete();
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const doc = await this.follows.doc(`${followerId}__${followingId}`).get();
    return doc.exists;
  }

  async listFollowing(uid: string): Promise<Follow[]> {
    const snap = await this.follows.where('followerId', '==', uid).get();
    return snap.docs.map((d) => d.data() as Follow);
  }

  async listFollowers(uid: string): Promise<Follow[]> {
    const snap = await this.follows.where('followingId', '==', uid).get();
    return snap.docs.map((d) => d.data() as Follow);
  }

  // ─── Blocks ────────────────────────────────────────────────────────────────

  async block(block: Block): Promise<void> {
    await this.blocks.doc(block.id).set(block);
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.blocks.doc(`${blockerId}__${blockedId}`).delete();
  }

  /** Users that `uid` has blocked. */
  async listBlocked(uid: string): Promise<Block[]> {
    const snap = await this.blocks.where('blockerId', '==', uid).get();
    return snap.docs.map((d) => d.data() as Block);
  }

  /** Users that have blocked `uid`. */
  async listBlockedBy(uid: string): Promise<Block[]> {
    const snap = await this.blocks.where('blockedId', '==', uid).get();
    return snap.docs.map((d) => d.data() as Block);
  }

  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const [ab, ba] = await Promise.all([
      this.blocks.doc(`${a}__${b}`).get(),
      this.blocks.doc(`${b}__${a}`).get(),
    ]);
    return ab.exists || ba.exists;
  }
}

export const connectionRepository = new ConnectionRepository();
