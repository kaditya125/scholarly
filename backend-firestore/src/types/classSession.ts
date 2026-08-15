/**
 * Class sessions — a live video call attached to a class (Phase 3M).
 *
 * ── Scope of this pass ──────────────────────────────────────────────────────────────────
 * No advance scheduling: a teacher clicks "Go live" and a room is created and started in one
 * act. `TEACHER_ECOSYSTEM_PLAN.md`'s data model sketches a `scheduledAt` field for a future
 * calendar-style flow — deliberately not built here, so there's no half-wired scheduling UI
 * that looks like a feature and isn't.
 *
 * ── Provider-neutral by construction ─────────────────────────────────────────────────────
 * `providerRoomId` and `roomCodes` are opaque strings from whichever VideoProvider created the
 * room (100ms today). Nothing outside services/video/ interprets their shape — swapping the
 * provider later never touches this type.
 *
 * ── Access model ──────────────────────────────────────────────────────────────────────────
 * Same posture as every other class-scoped collection this codebase has: the owning teacher, or
 * a student with a currently-ACTIVE enrolment edge. See classSession.service.ts.
 */

export const SESSION_STATUSES = ['live', 'ended'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export type VideoRole = 'teacher' | 'student';

/** `classSessions/{id}` */
export interface ClassSessionRecord {
  id: string;
  classId: string;
  /** Denormalised from the class, so rules never need a second lookup. */
  ownerUid: string;
  title: string;
  status: SessionStatus;
  /** Set once the provider room is created — always, since creation and start happen together. */
  providerRoomId: string;
  /** One join code per role, minted once at room creation. Never sent to the wrong role. */
  roomCodes: Record<VideoRole, string>;
  startedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  endedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
  /** Optional reference to the session recording URL, populated by webhooks once processing is complete. */
  recordingRef?: string;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export const MAX_SESSION_TITLE = 160;

/** What the client actually needs to join — never the whole record (the other role's code included). */
export interface SessionJoinInfo {
  sessionId: string;
  title: string;
  role: VideoRole;
  roomCode: string;
  /** Ready to open directly (iframe or new tab) — see VideoProvider#buildJoinUrl. */
  joinUrl: string;
}
