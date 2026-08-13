/**
 * Enrolment — the consent edge between a teacher's class and a student.
 *
 * ── THE GOVERNING RULE ────────────────────────────────────────────────────────────────
 *   Role never grants access to a person. Only an edge the other party accepted does.
 *
 * Everything in this file exists to make that structurally true rather than remembered:
 *
 *   · The edge lives at a COMPOSITE id, `{classId}_{studentUid}`, so a duplicate enrolment is
 *     impossible to create rather than merely guarded against.
 *   · ONLY `ACTIVE` grants anything. `INVITED` and `REQUESTED` are real records — they have to
 *     be, so the other party can answer them — but they convey no access whatsoever. An
 *     un-accepted invitation is inert, which is what makes inviting safe.
 *   · Terminal states are retained rather than deleted, so leaving a class is auditable and a
 *     re-invite is a new transition on the same edge rather than a fresh, historyless record.
 *
 * An invitation CODE is not an edge. Holding, opening or sharing a code grants nothing; it only
 * lets someone see a class preview and choose to act. That separation is what keeps "a teacher
 * brought their students to Scholarly" (acquisition) distinct from "this student is in my class"
 * (authorization).
 */

export const ENROLLMENT_STATES = [
  /** Teacher invited; awaiting the student. Grants nothing. */
  'INVITED',
  /** Student asked to join; awaiting the teacher. Grants nothing. */
  'REQUESTED',
  /** The only state that grants access. */
  'ACTIVE',
  /** Student turned down an invitation. */
  'DECLINED',
  /** Teacher turned down a request. */
  'REJECTED',
  /** Student left a class they had joined. */
  'LEFT',
  /** Teacher removed a student from the class. */
  'REMOVED',
  /** Either party blocked the other. Terminal and un-reinvitable. */
  'BLOCKED',
] as const;

export type EnrollmentState = (typeof ENROLLMENT_STATES)[number];

export function isEnrollmentState(value: unknown): value is EnrollmentState {
  return typeof value === 'string' && (ENROLLMENT_STATES as readonly string[]).includes(value);
}

/**
 * The single predicate every access decision must route through.
 *
 * Deliberately a function rather than a comparison sprinkled across call sites: when class
 * resources, tests and analytics arrive, each of them asks this one question, and there is
 * exactly one place to audit.
 */
export function grantsAccess(state: EnrollmentState): boolean {
  return state === 'ACTIVE';
}

/**
 * Permitted transitions.
 *
 *              ┌── student accepts ──► ACTIVE ──┬── student leaves ──► LEFT
 *   INVITED ───┤                                ├── teacher removes ─► REMOVED
 *              └── student declines ─► DECLINED └── either blocks ───► BLOCKED
 *
 *              ┌── teacher accepts ──► ACTIVE
 *   REQUESTED ─┤
 *              └── teacher rejects ──► REJECTED
 *
 * A previously declined/rejected/left/removed edge can be re-opened by a fresh invitation or
 * request — that is the `→ INVITED` / `→ REQUESTED` edges below. `BLOCKED` alone is terminal:
 * re-inviting someone who blocked you (or whom you blocked) must not be possible, or blocking
 * would be a speed bump rather than a decision.
 */
export const ENROLLMENT_TRANSITIONS: Record<EnrollmentState, readonly EnrollmentState[]> = {
  INVITED: ['ACTIVE', 'DECLINED', 'BLOCKED'],
  REQUESTED: ['ACTIVE', 'REJECTED', 'BLOCKED'],
  ACTIVE: ['LEFT', 'REMOVED', 'BLOCKED'],
  DECLINED: ['INVITED', 'REQUESTED', 'BLOCKED'],
  REJECTED: ['INVITED', 'REQUESTED', 'BLOCKED'],
  LEFT: ['INVITED', 'REQUESTED', 'BLOCKED'],
  REMOVED: ['INVITED', 'REQUESTED', 'BLOCKED'],
  BLOCKED: [],
};

export function canTransitionEnrollment(from: EnrollmentState, to: EnrollmentState): boolean {
  return ENROLLMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** How the edge came into being. Kept for audit; never used to grant anything. */
export const ENROLLMENT_SOURCES = ['invitation', 'request', 'purchase'] as const;
export type EnrollmentSource = (typeof ENROLLMENT_SOURCES)[number];

/** `classEnrollments/{classId}_{studentUid}` */
export interface EnrollmentRecord {
  id: string;
  classId: string;
  studentUid: string;
  /** Denormalised owner, so a roster query does not need to read the class for every row. */
  teacherUid: string;

  state: EnrollmentState;
  source: EnrollmentSource;

  /** Set the first time the edge reaches ACTIVE. Never cleared, so history survives a leave. */
  activatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
  /** Who blocked, when blocked. Null otherwise. */
  blockedBy: string | null;

  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

/** Deterministic edge id — makes a duplicate enrolment unrepresentable. */
export function enrollmentId(classId: string, studentUid: string): string {
  return `${classId}_${studentUid}`;
}

/* ── Invitations ───────────────────────────────────────────────────────────────────── */

/**
 * `classInvitations/{code}` — a shareable code pointing at a class.
 *
 * Grants nothing. Resolving a code returns a PREVIEW of the class and nothing about anyone
 * already enrolled. Accepting is a separate, authenticated act that creates the edge.
 *
 * `uses` is incremented transactionally on accept so `maxUses` cannot be beaten by two people
 * redeeming simultaneously.
 */
export interface InvitationRecord {
  code: string;
  classId: string;
  createdBy: string;
  active: boolean;
  /** null = no expiry. */
  expiresAt: string | null;
  /** null = unlimited. */
  maxUses: number | null;
  uses: number;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

/** Unambiguous alphabet — no O/0, I/1/l — because these get read aloud and typed by hand. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInvitationCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function isInvitationUsable(inv: InvitationRecord, now = new Date()): { ok: boolean; reason?: string } {
  if (!inv.active) return { ok: false, reason: 'This invitation has been turned off.' };
  if (inv.expiresAt && new Date(inv.expiresAt) < now) return { ok: false, reason: 'This invitation has expired.' };
  if (inv.maxUses != null && inv.uses >= inv.maxUses) {
    return { ok: false, reason: 'This invitation has reached its limit.' };
  }
  return { ok: true };
}
