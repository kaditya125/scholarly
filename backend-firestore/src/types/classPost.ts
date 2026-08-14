/**
 * Class posts — announcements and discussion, in one flat, class-scoped feed.
 *
 * ── Why one collection for both ─────────────────────────────────────────────────────────
 * An announcement and a discussion reply are the same shape (author, body, timestamp) with two
 * differences: who may create one, and whether it targets a parent. Splitting them into separate
 * collections would duplicate the read-visibility rule (owner or ACTIVE member) for no benefit,
 * and would make "a student replying to a teacher's announcement" — the actual point of having
 * both in one phase — awkward to express. `kind` carries the one real distinction; `parentId`
 * lets any post, announcement or discussion, be replied to.
 *
 * ── Why NOT the existing `discussions` collection ───────────────────────────────────────
 * `discussions.service.ts` is a `roomId`-scoped forum with simulated AI moderation and, more to
 * the point, a `GET /discussions?roomId=` with no membership check at all — any authenticated
 * account can read any room's threads by passing its id. Reusing it for classes would import
 * that gap directly into student data, in exact violation of "only an edge the other party
 * accepted grants access." This is a fresh, properly-scoped model instead of a fix-in-place,
 * because the two have no other consumers to keep behaviour-compatible with.
 *
 * ── Write model ──────────────────────────────────────────────────────────────────────────
 * `kind: 'announcement'` — owner (the class's teacher) only. `kind: 'discussion'` — owner OR any
 * ACTIVE member. Both checks live in classPost.service.ts; Firestore rules close writes entirely,
 * as with every other class collection.
 */

export const POST_KINDS = ['announcement', 'discussion'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export function isPostKind(value: unknown): value is PostKind {
  return typeof value === 'string' && (POST_KINDS as readonly string[]).includes(value);
}

export const MAX_POST_TITLE = 160;
export const MAX_POST_BODY = 4000;

/** `classPosts/{id}` */
export interface ClassPostRecord {
  id: string;
  classId: string;
  /** Denormalised from the class — the TEACHER's uid, not this post's author. For rules/queries. */
  ownerUid: string;
  authorUid: string;
  /** Denormalised at write time so a reader never needs a second lookup to know who's who. */
  authorRole: 'teacher' | 'student';
  kind: PostKind;
  /** Announcements may carry a title; discussion posts and replies generally won't. */
  title: string | null;
  body: string;
  /** Set when this post replies to another post in the same class; null for a top-level post. */
  parentId: string | null;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface CreatePostInput {
  kind?: PostKind;
  title?: string;
  body?: string;
  parentId?: string | null;
}
