import { ProductRole } from './roles';
import { TeacherStatus } from './teacher';

/**
 * Capabilities — what a given account may actually DO, right now.
 *
 * ── Why this exists as a derived function ─────────────────────────────────────────────
 * Authorization here is a function of three things that live in three different places:
 * `productRole` (a custom claim on the token), `teacherStatus` (a field in Firestore, mutable
 * by admins at any moment), and eventually relationship edges (enrolment). Storing the answer
 * would mean a teacher suspended thirty seconds ago still holds a document saying they may
 * create classes, and a claim-based answer would serve stale permissions until the user signed
 * out. So the answer is computed per request and never persisted.
 *
 * ── The rules below are NORMATIVE ─────────────────────────────────────────────────────
 * They implement the capability table in TEACHER_STUDENT_FINAL_ARCHITECTURE.md §4, mapped onto
 * the six-state verification model introduced in Phase 3A. Two distinct shapes of rule:
 *
 *   RESTRICTION-gated — allowed by default, withdrawn on suspension.
 *     A suspended teacher keeps AI access but loses write access; §4 describes this as
 *     "read-only". Suspension is a pause, not an eviction.
 *
 *   APPROVAL-gated — denied until `teacherStatus === 'approved'`.
 *     Everything that touches another person or money. `draft`, `pending` and `under_review`
 *     are all equally unapproved: only a completed review opens these.
 *
 * ── What this is NOT ─────────────────────────────────────────────────────────────────
 * It is not a UI concern. The client may read the derived set to decide what to render, but
 * every protected route re-derives it server-side. A capability object arriving from a browser
 * is never consulted.
 */

export const CAPABILITIES = [
  /** Use the AI tutor and all student-grade features. Never withdrawn while the account lives. */
  'useAI',
  /** Create/modify own private content: notebooks, drafts, uploads. */
  'createPrivateContent',
  /** Send and accept peer connection requests. */
  'connectPeers',
  /** Create or edit the teacher profile. */
  'editTeacherProfile',
  /** Publish content publicly on the platform. */
  'publishPublicly',
  /** Create a class/batch. */
  'createClass',
  /** Invite students into an owned class. */
  'inviteStudents',
  /** Accept or reject student enrolment requests. */
  'acceptEnrollments',
  /** Accrue earnings from paid classes. */
  'earn',
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type CapabilitySet = Record<Capability, boolean>;

/** Capabilities that require a completed verification review. */
export const APPROVAL_GATED: readonly Capability[] = [
  'publishPublicly',
  'createClass',
  'inviteStudents',
  'acceptEnrollments',
  'earn',
];

export interface CapabilityInput {
  /** From the verified `productRole` claim. null for an account that never chose one. */
  productRole: ProductRole | null;
  /**
   * From `teacherProfiles/{uid}`, already normalised. null when the caller is not a teacher or
   * has no profile document yet.
   */
  teacherStatus: TeacherStatus | null;
}

/**
 * Derives the full capability set. Pure — no I/O, no clock, no globals.
 *
 * Deliberately returns every key rather than only the true ones, so a consumer that asks for a
 * capability this function does not yet know about fails to compile instead of silently reading
 * `undefined` and treating it as false.
 */
export function deriveCapabilities({ productRole, teacherStatus }: CapabilityInput): CapabilitySet {
  const isTeacher = productRole === 'teacher';
  const suspended = isTeacher && teacherStatus === 'suspended';
  const approved = isTeacher && teacherStatus === 'approved';

  return {
    // Suspension pauses a teacher's ability to act, never their ability to learn.
    useAI: true,

    // Restriction-gated.
    createPrivateContent: !suspended,
    connectPeers: !suspended,
    editTeacherProfile: isTeacher && !suspended,

    // Approval-gated. A student is never granted these regardless of anything else.
    publishPublicly: approved,
    createClass: approved,
    inviteStudents: approved,
    acceptEnrollments: approved,
    earn: approved,
  };
}

/** Convenience for the common single-capability question. */
export function hasCapability(input: CapabilityInput, capability: Capability): boolean {
  return deriveCapabilities(input)[capability];
}
