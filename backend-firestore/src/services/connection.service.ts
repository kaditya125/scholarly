import { auth } from '../config/firebase';
import { connectionRepository, pairId } from '../repositories/connection.repository';
import {
  Block,
  Connection,
  Follow,
  PeerCard,
  RelationshipState,
  UserDirectoryEntry,
} from '../types/social.types';

/** Thrown for expected, user-facing failures; carries an HTTP status for the controller. */
export class ConnectionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

/** The caller's relationship graph, resolved once and reused to decorate cards. */
interface RelationshipSets {
  connectedIds: Set<string>;
  incomingIds: Set<string>;
  outgoingIds: Set<string>;
  blockedIds: Set<string>;
  blockedByIds: Set<string>;
  followingIds: Set<string>;
  connections: Connection[];
}

/** Case-insensitive intersection of two string lists. */
function intersect(a?: string[], b?: string[]): string[] {
  if (!a?.length || !b?.length) return [];
  const setB = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase()));
}

/**
 * Orchestrates the social graph: keeps the discovery directory in sync, ranks study-partner
 * suggestions from learning-profile overlap, and enforces the request / follow / block lifecycle.
 */
export class ConnectionService {
  private repo = connectionRepository;

  // ─── Directory sync ──────────────────────────────────────────────────────────

  /**
   * Rebuilds a user's directory entry from the auth record (trusted name/photo) and their
   * onboarding profile (matching signals), then upserts it. Returns the fresh entry.
   */
  async syncDirectory(uid: string): Promise<UserDirectoryEntry> {
    let displayName = 'Sadhya learner';
    let photoURL: string | undefined;
    let email: string | undefined;

    try {
      const record = await auth.getUser(uid);
      displayName =
        record.displayName || (record.email ? record.email.split('@')[0] : '') || displayName;
      photoURL = record.photoURL || undefined;
      email = record.email || undefined;
    } catch {
      // Auth record unavailable (deleted / unknown uid) — keep safe defaults.
    }

    const profile = await this.repo.getProfile(uid).catch(() => null);

    const entry: UserDirectoryEntry = {
      uid,
      displayName,
      photoURL,
      email,
      goal: profile?.goal || profile?.targetExam || undefined,
      board: profile?.board || undefined,
      classLevel: profile?.classLevel || undefined,
      stream: profile?.stream || undefined,
      subjects: Array.isArray(profile?.subjects) ? profile!.subjects : [],
      weakAreas: Array.isArray(profile?.weakAreas) ? profile!.weakAreas : [],
      targetYear: profile?.targetYear || undefined,
      preparationLevel: profile?.preparationLevel || undefined,
      updatedAt: Date.now(),
    };

    await this.repo.upsertDirectory(entry);
    return entry;
  }

  // ─── Relationship resolution ──────────────────────────────────────────────────

  /** Resolves every relationship touching `uid` into lookup sets (one array-contains read + blocks/follows). */
  private async getRelationshipSets(uid: string): Promise<RelationshipSets> {
    const [connections, blocked, blockedBy, following] = await Promise.all([
      this.repo.listAllForUser(uid),
      this.repo.listBlocked(uid),
      this.repo.listBlockedBy(uid),
      this.repo.listFollowing(uid),
    ]);

    const connectedIds = new Set<string>();
    const incomingIds = new Set<string>();
    const outgoingIds = new Set<string>();

    for (const c of connections) {
      const other = c.users.find((u) => u !== uid);
      if (!other) continue;
      if (c.status === 'accepted') connectedIds.add(other);
      else if (c.status === 'pending') {
        if (c.requesterId === uid) outgoingIds.add(other);
        else incomingIds.add(other);
      }
    }

    return {
      connectedIds,
      incomingIds,
      outgoingIds,
      blockedIds: new Set(blocked.map((b) => b.blockedId)),
      blockedByIds: new Set(blockedBy.map((b) => b.blockerId)),
      followingIds: new Set(following.map((f) => f.followingId)),
      connections,
    };
  }

  private relationshipFor(uid: string, otherUid: string, sets: RelationshipSets): RelationshipState {
    if (otherUid === uid) return 'self';
    if (sets.blockedIds.has(otherUid) || sets.blockedByIds.has(otherUid)) return 'blocked';
    if (sets.connectedIds.has(otherUid)) return 'connected';
    if (sets.incomingIds.has(otherUid)) return 'incoming';
    if (sets.outgoingIds.has(otherUid)) return 'outgoing';
    return 'none';
  }

  /** Counts connections shared between the caller and another user. */
  private async mutualsFor(myConnected: Set<string>, otherUid: string): Promise<number> {
    if (myConnected.size === 0) return 0;
    const theirs = await this.repo.listConnections(otherUid);
    let count = 0;
    for (const c of theirs) {
      const other = c.users.find((u) => u !== otherUid);
      if (other && myConnected.has(other)) count++;
    }
    return count;
  }

  /** Batch-loads directory entries, self-healing (re-syncing) any that are missing. */
  private async hydrate(ids: string[]): Promise<Map<string, UserDirectoryEntry>> {
    const unique = [...new Set(ids)].filter(Boolean);
    const found = await this.repo.getDirectoryMany(unique);
    const map = new Map(found.map((e) => [e.uid, e]));
    const missing = unique.filter((id) => !map.has(id));
    if (missing.length) {
      const synced = await Promise.all(missing.map((id) => this.syncDirectory(id).catch(() => null)));
      synced.forEach((e) => {
        if (e) map.set(e.uid, e);
      });
    }
    return map;
  }

  private entryOrFallback(id: string, map: Map<string, UserDirectoryEntry>): UserDirectoryEntry {
    return (
      map.get(id) ?? {
        uid: id,
        displayName: 'Sadhya learner',
        subjects: [],
        weakAreas: [],
        updatedAt: 0,
      }
    );
  }

  private buildCard(
    entry: UserDirectoryEntry,
    relationship: RelationshipState,
    isFollowing: boolean,
    mutuals: number,
    matchReasons: string[] = [],
    score?: number
  ): PeerCard {
    return { ...entry, relationship, isFollowing, mutuals, matchReasons, score };
  }

  // ─── Reads ────────────────────────────────────────────────────────────────────

  /** The caller's accepted connections, decorated with mutuals + follow state. */
  async getConnections(uid: string): Promise<PeerCard[]> {
    const sets = await this.getRelationshipSets(uid);
    const ids = [...sets.connectedIds];
    const map = await this.hydrate(ids);
    return Promise.all(
      ids.map(async (id) =>
        this.buildCard(
          this.entryOrFallback(id, map),
          'connected',
          sets.followingIds.has(id),
          await this.mutualsFor(sets.connectedIds, id)
        )
      )
    );
  }

  /** Pending requests split into those received (incoming) and sent (outgoing). */
  async getRequests(uid: string): Promise<{ incoming: PeerCard[]; outgoing: PeerCard[] }> {
    const sets = await this.getRelationshipSets(uid);
    const incomingIds = [...sets.incomingIds];
    const outgoingIds = [...sets.outgoingIds];
    const map = await this.hydrate([...incomingIds, ...outgoingIds]);

    const incoming = await Promise.all(
      incomingIds.map(async (id) =>
        this.buildCard(
          this.entryOrFallback(id, map),
          'incoming',
          sets.followingIds.has(id),
          await this.mutualsFor(sets.connectedIds, id)
        )
      )
    );
    const outgoing = await Promise.all(
      outgoingIds.map(async (id) =>
        this.buildCard(
          this.entryOrFallback(id, map),
          'outgoing',
          sets.followingIds.has(id),
          await this.mutualsFor(sets.connectedIds, id)
        )
      )
    );
    return { incoming, outgoing };
  }

  /**
   * Ranks study-partner suggestions from learning-profile overlap. Candidates come from peers with
   * the same goal plus recently-active learners; anyone already related to the caller is excluded.
   */
  async getSuggestions(uid: string, limit = 12): Promise<PeerCard[]> {
    const me = await this.syncDirectory(uid);
    const sets = await this.getRelationshipSets(uid);

    const exclude = new Set<string>([
      uid,
      ...sets.connectedIds,
      ...sets.incomingIds,
      ...sets.outgoingIds,
      ...sets.blockedIds,
      ...sets.blockedByIds,
    ]);

    const candidates = new Map<string, UserDirectoryEntry>();
    if (me.goal) {
      (await this.repo.queryDirectoryByGoal(me.goal, 60)).forEach((e) => candidates.set(e.uid, e));
    }
    (await this.repo.recentDirectory(60)).forEach((e) => {
      if (!candidates.has(e.uid)) candidates.set(e.uid, e);
    });

    const scored = [...candidates.values()]
      .filter((e) => !exclude.has(e.uid))
      .map((entry) => {
        const { score, reasons } = this.scorePeer(me, entry);
        return { entry, score, reasons };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || (b.entry.updatedAt || 0) - (a.entry.updatedAt || 0))
      .slice(0, limit);

    return Promise.all(
      scored.map(async (s) =>
        this.buildCard(
          s.entry,
          'none',
          sets.followingIds.has(s.entry.uid),
          await this.mutualsFor(sets.connectedIds, s.entry.uid),
          s.reasons,
          s.score
        )
      )
    );
  }

  private scorePeer(me: UserDirectoryEntry, other: UserDirectoryEntry): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    if (me.goal && other.goal && me.goal === other.goal) {
      score += 3;
      reasons.push(`Same goal: ${other.goal}`);
    }

    const sharedSubjects = intersect(me.subjects, other.subjects);
    if (sharedSubjects.length) {
      score += Math.min(sharedSubjects.length, 3);
      reasons.push(
        sharedSubjects.length === 1
          ? `Studies ${sharedSubjects[0]}`
          : `${sharedSubjects.length} shared subjects`
      );
    }

    const sharedWeak = intersect(me.weakAreas, other.weakAreas);
    if (sharedWeak.length) {
      score += Math.min(sharedWeak.length, 3);
      reasons.push(
        sharedWeak.length === 1
          ? `Both focusing on ${sharedWeak[0]}`
          : `${sharedWeak.length} shared focus areas`
      );
    }

    if (me.board && other.board && me.board === other.board) {
      score += 1;
      reasons.push(`Same board: ${other.board}`);
    }
    if (me.targetYear && other.targetYear && me.targetYear === other.targetYear) {
      score += 1;
      reasons.push(`Target ${other.targetYear}`);
    }
    if (me.classLevel && other.classLevel && me.classLevel === other.classLevel) {
      score += 1;
      reasons.push('Same class level');
    }

    return { score, reasons };
  }

  /** Name / email substring search over the directory, decorated with the caller's relationship. */
  async search(uid: string, query: string, limit = 20): Promise<PeerCard[]> {
    const term = query.trim().toLowerCase();
    if (!term) return [];

    const sets = await this.getRelationshipSets(uid);
    const pool = new Map<string, UserDirectoryEntry>();
    (await this.repo.recentDirectory(200)).forEach((e) => pool.set(e.uid, e));

    const matches = [...pool.values()]
      .filter((e) => e.uid !== uid && !sets.blockedByIds.has(e.uid))
      .filter(
        (e) =>
          (e.displayName || '').toLowerCase().includes(term) ||
          (e.email || '').toLowerCase().includes(term)
      )
      .slice(0, limit);

    return matches.map((e) =>
      this.buildCard(e, this.relationshipFor(uid, e.uid, sets), sets.followingIds.has(e.uid), 0)
    );
  }

  // ─── Request lifecycle ─────────────────────────────────────────────────────────

  /**
   * Sends a connection request. Auto-accepts when the target already has a pending request out to
   * the caller, and re-opens a previously declined relationship.
   */
  async sendRequest(uid: string, targetId: string): Promise<Connection> {
    if (!targetId) throw new ConnectionError(400, 'A target user is required');
    if (uid === targetId) throw new ConnectionError(400, 'You cannot connect with yourself');
    if (await this.repo.isBlockedEitherWay(uid, targetId)) {
      throw new ConnectionError(403, 'This connection is unavailable');
    }

    const now = Date.now();
    const existing = await this.repo.getConnection(uid, targetId);

    if (existing) {
      if (existing.status === 'accepted') return existing;
      if (existing.status === 'pending') {
        if (existing.requesterId === uid) return existing; // already sent
        // Reverse pending request exists → accept it.
        const accepted: Connection = { ...existing, status: 'accepted', respondedAt: now, updatedAt: now };
        await this.repo.updateConnection(existing.id, {
          status: 'accepted',
          respondedAt: now,
          updatedAt: now,
        });
        return accepted;
      }
      // Previously declined → re-open as a fresh pending request from the caller.
      const reopened: Connection = {
        id: existing.id,
        users: [uid, targetId].sort(),
        requesterId: uid,
        recipientId: targetId,
        status: 'pending',
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      await this.repo.setConnection(reopened);
      return reopened;
    }

    const connection: Connection = {
      id: pairId(uid, targetId),
      users: [uid, targetId].sort(),
      requesterId: uid,
      recipientId: targetId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.setConnection(connection);
    return connection;
  }

  /** Accepts or declines a pending request. Only the recipient may respond. */
  async respond(uid: string, otherId: string, accept: boolean): Promise<Connection> {
    const conn = await this.repo.getConnection(uid, otherId);
    if (!conn || conn.status !== 'pending') throw new ConnectionError(404, 'No pending request found');
    if (conn.recipientId !== uid) throw new ConnectionError(403, 'You cannot respond to this request');

    const now = Date.now();
    const status = accept ? 'accepted' : 'declined';
    await this.repo.updateConnection(conn.id, { status, respondedAt: now, updatedAt: now });
    return { ...conn, status, respondedAt: now, updatedAt: now };
  }

  /** Cancels a pending outgoing request. Only the requester may cancel. */
  async cancelRequest(uid: string, otherId: string): Promise<void> {
    const conn = await this.repo.getConnection(uid, otherId);
    if (!conn || conn.status !== 'pending') throw new ConnectionError(404, 'No pending request found');
    if (conn.requesterId !== uid) throw new ConnectionError(403, 'You cannot cancel this request');
    await this.repo.deleteConnection(conn.id);
  }

  /** Removes an existing connection (either party may remove). Idempotent. */
  async removeConnection(uid: string, otherId: string): Promise<void> {
    const conn = await this.repo.getConnection(uid, otherId);
    if (!conn) return;
    if (!conn.users.includes(uid)) throw new ConnectionError(403, 'You are not part of this connection');
    await this.repo.deleteConnection(conn.id);
  }

  // ─── Follow ─────────────────────────────────────────────────────────────────

  async follow(uid: string, targetId: string): Promise<void> {
    if (!targetId) throw new ConnectionError(400, 'A target user is required');
    if (uid === targetId) throw new ConnectionError(400, 'You cannot follow yourself');
    if (await this.repo.isBlockedEitherWay(uid, targetId)) {
      throw new ConnectionError(403, 'This action is unavailable');
    }
    const follow: Follow = {
      id: `${uid}__${targetId}`,
      followerId: uid,
      followingId: targetId,
      createdAt: Date.now(),
    };
    await this.repo.follow(follow);
  }

  async unfollow(uid: string, targetId: string): Promise<void> {
    await this.repo.unfollow(uid, targetId);
  }

  // ─── Block ──────────────────────────────────────────────────────────────────

  /** Blocks a user and tears down any existing connection + follows in both directions. */
  async block(uid: string, targetId: string): Promise<void> {
    if (!targetId) throw new ConnectionError(400, 'A target user is required');
    if (uid === targetId) throw new ConnectionError(400, 'You cannot block yourself');

    const block: Block = {
      id: `${uid}__${targetId}`,
      blockerId: uid,
      blockedId: targetId,
      createdAt: Date.now(),
    };
    await this.repo.block(block);

    const conn = await this.repo.getConnection(uid, targetId);
    await Promise.all([
      conn ? this.repo.deleteConnection(conn.id) : Promise.resolve(),
      this.repo.unfollow(uid, targetId),
      this.repo.unfollow(targetId, uid),
    ]);
  }

  async unblock(uid: string, targetId: string): Promise<void> {
    await this.repo.unblock(uid, targetId);
  }
}

export const connectionService = new ConnectionService();
