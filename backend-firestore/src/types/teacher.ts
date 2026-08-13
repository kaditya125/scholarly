import { OnboardingStatus } from './roles';

/**
 * Teacher account state — orthogonal to `productRole`.
 *
 * `productRole` answers "what type of product user is this?" and is immutable once set.
 * `teacherStatus` answers "what state is this teacher account in?" and changes over time as
 * review outcomes land. They are deliberately NOT collapsed: a claim holds one value and
 * requires a token refresh to propagate, so putting a mutable review state into the claim would
 * mean every admin decision silently served a stale token until the user signed out.
 *
 * Capability is derived from BOTH (Phase 2C). `productRole === 'teacher'` alone never implies
 * access to a student.
 *
 * Per the architecture contract (TEACHER_STUDENT_FINAL_ARCHITECTURE.md §4), `pending` is
 * deliberately generous: it gates student-facing capability only. A pending teacher authors,
 * drafts, uses AI and connects to peers from day one. Verification never blocks platform access.
 */
export const TEACHER_STATUSES = [
  'draft',
  'pending',
  'under_review',
  'approved',
  'rejected',
  'suspended',
] as const;
export type TeacherStatus = (typeof TEACHER_STATUSES)[number];

export function isTeacherStatus(value: unknown): value is TeacherStatus {
  return typeof value === 'string' && (TEACHER_STATUSES as readonly string[]).includes(value);
}

/**
 * Legacy values that may still be persisted in `teacherProfiles/{uid}`.
 *
 * `'active'` was the value written by the interim auto-approval policy before this phase
 * introduced the explicit state machine. Rather than migrate production documents — which
 * would mean a write against live data to fix a naming choice — it is mapped forward on
 * READ. Every write path in this codebase emits only current-model values, so the legacy
 * value can only ever shrink in the data set, never grow.
 */
const LEGACY_TEACHER_STATUSES: Record<string, TeacherStatus> = {
  active: 'approved',
};

/**
 * Coerces whatever is stored on a profile into a valid current-model status.
 *
 * Falls back to `'draft'` for anything unrecognised (including undefined on a document
 * written before the field existed). `draft` is chosen deliberately as the fallback because
 * it is the LEAST privileged state — an unreadable status must never resolve to `approved`.
 */
export function normalizeTeacherStatus(raw: unknown): TeacherStatus {
  if (isTeacherStatus(raw)) return raw;
  if (typeof raw === 'string' && raw in LEGACY_TEACHER_STATUSES) return LEGACY_TEACHER_STATUSES[raw];
  return 'draft';
}

/**
 * The verification state machine.
 *
 * Only these transitions are permitted. Anything not listed — notably `draft → approved` —
 * is rejected server-side, so no combination of admin requests can jump a teacher straight
 * to approved without passing through review.
 *
 *     draft ──► pending ──► under_review ──► approved ──► suspended
 *                                    │                        │
 *                                    └──► rejected            └──► under_review
 *
 * `rejected` is currently TERMINAL: there is no re-application path. That is a deliberate
 * consequence of implementing exactly the transitions specified for this phase, and it is a
 * known operational gap — a wrongly rejected teacher cannot presently be recovered except by
 * a direct database edit. Adding `rejected → pending` is a product decision, not a technical
 * one, and is flagged rather than assumed.
 */
export const TEACHER_STATUS_TRANSITIONS: Record<TeacherStatus, readonly TeacherStatus[]> = {
  draft: ['pending'],
  pending: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: ['suspended'],
  rejected: [],
  suspended: ['under_review'],
};

/** Whether a transition is defined. A transition to the same state is never permitted. */
export function canTransition(from: TeacherStatus, to: TeacherStatus): boolean {
  return TEACHER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Statuses that represent a completed, positive verification outcome.
 *
 * The UI must consult this rather than testing for "not pending" — an account that was
 * auto-approved for development, or one still in review, must never be presented as verified.
 */
export function isVerifiedStatus(status: TeacherStatus): boolean {
  return status === 'approved';
}

/**
 * teacherVerificationEvents/{eventId} — the append-only audit trail.
 *
 * One document per transition, including the initial assignment at profile creation (where
 * `previousState` is null). Never updated, never deleted: an audit trail that can be rewritten
 * is not an audit trail. Writes are Admin-SDK only; the collection is closed to clients.
 */
export interface TeacherVerificationEvent {
  teacherUid: string;
  /** null when the profile is first created. */
  previousState: TeacherStatus | null;
  newState: TeacherStatus;
  /** null when the actor is the system (auto-approval, profile creation). */
  actorUid: string | null;
  /** Admin role claim of the actor, or 'system'. */
  actorRole: string;
  reason: string | null;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

/**
 * Visibility of the teacher's public profile.
 *
 * Product decision D-1 (hybrid discovery): a teacher may expose a PUBLIC SUBSET so students can
 * find them and request to join. The subset is defined by `publicTeacherProfile()` in the
 * service — never by the client, and never by spreading the whole document.
 */
export const TEACHER_VISIBILITIES = ['private', 'public'] as const;
export type TeacherVisibility = (typeof TEACHER_VISIBILITIES)[number];

export function isTeacherVisibility(value: unknown): value is TeacherVisibility {
  return typeof value === 'string' && (TEACHER_VISIBILITIES as readonly string[]).includes(value);
}

/**
 * teacherProfiles/{uid} — the canonical teacher record.
 *
 * Kept OUT of the student profile (`users/{uid}/profile/onboarding`) on purpose: "subjects" means
 * different things to the two roles ("what I study" vs "what I teach"), and merging them would
 * make every consumer disambiguate by role.
 *
 * Field discipline: only fields a shipped or specified feature consumes. Availability and
 * location are deliberately NOT collected — no feature reads them, and unused personal data is a
 * liability rather than a head start. Formal qualifications belong to verification (a later
 * phase), not to onboarding.
 */
export interface TeacherProfile {
  uid: string;

  // Mirrored from the Firebase Auth record — never accepted from a request body.
  displayName: string | null;
  email: string | null;
  photoURL: string | null;

  // What this teacher teaches. Drives the teacher AI context (Phase 2B) and discovery.
  subjects: string[];
  boards: string[];
  classesTaught: string[];
  exams: string[];
  languages: string[];
  teachingStyle: string | null;

  // Public-subset fields (D-1 hybrid discovery).
  bio: string | null;
  yearsExperience: number | null;

  visibility: TeacherVisibility;
  onboardingStatus: OnboardingStatus;

  /** SERVER-CONTROLLED. Never writable through the teacher-facing API. */
  teacherStatus: TeacherStatus;

  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

/** The shape a teacher may submit. Note the absence of uid, teacherStatus and identity fields. */
export interface TeacherProfileInput {
  subjects?: string[];
  boards?: string[];
  classesTaught?: string[];
  exams?: string[];
  languages?: string[];
  teachingStyle?: string | null;
  bio?: string | null;
  yearsExperience?: number | null;
  visibility?: TeacherVisibility;
  /** Marks onboarding complete. Does NOT touch teacherStatus. */
  markComplete?: boolean;
}
