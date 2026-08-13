import * as admin from 'firebase-admin';
import { db, auth } from '../config/firebase';
import { OnboardingStatus } from '../types/roles';
import {
  TeacherProfile,
  TeacherProfileInput,
  TeacherStatus,
  TeacherVerificationEvent,
  canTransition,
  isTeacherVisibility,
  normalizeTeacherStatus,
} from '../types/teacher';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * TeacherProfileService — owns `teacherProfiles/{uid}`.
 *
 * Security properties:
 *  - `uid` is always the verified token uid supplied by the controller. No call site accepts a
 *    uid from a request body, so a teacher cannot write another teacher's profile.
 *  - `teacherStatus` is SERVER-CONTROLLED. It is set once at creation and is never read from
 *    input on any path — see `sanitize()`, which builds a fresh object rather than spreading the
 *    caller's payload. Changing it is an admin operation and is deliberately not exposed here.
 *  - Identity fields (displayName/email/photoURL) come from the Firebase Auth record, never from
 *    the body, so a teacher cannot spoof their own display identity for discovery.
 *  - Upsert is idempotent: re-submitting the same step is a no-op beyond `updatedAt`.
 */

/** Append-only audit trail for every verification transition. Admin SDK only. */
const VERIFICATION_EVENTS = 'teacherVerificationEvents';

const MAX_REASON = 500;

/**
 * Status a teacher profile document holds from the moment it first exists.
 *
 * Always `'draft'`, unconditionally — including when `TEACHER_AUTO_APPROVE=true`. Creating the
 * document is not the same event as submitting it: the onboarding wizard autosaves across many
 * partial steps before a teacher ever marks it complete, so treating creation itself as a
 * submission would put a half-filled profile in a reviewer's queue (or auto-approve one that
 * says nothing about the teacher yet). See `submitForReview()` for the actual submission point.
 */
const INITIAL_TEACHER_STATUS: TeacherStatus = 'draft';

const MAX_ARRAY = 24;
const MAX_ARRAY_ITEM = 64;
const MAX_BIO = 600;
const MAX_STYLE = 64;

/** Trims, drops empties, de-duplicates, and bounds both item length and array length. */
function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = Array.from(
    new Set(
      value
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => v.slice(0, MAX_ARRAY_ITEM))
    )
  );
  return out.slice(0, MAX_ARRAY);
}

function cleanText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

export class TeacherProfileService {
  private readonly collection = 'teacherProfiles';

  private ref(uid: string) {
    return db.collection(this.collection).doc(uid);
  }

  /**
   * The caller's own profile, or null when onboarding has never been started.
   *
   * `teacherStatus` is normalised on the way out so that consumers only ever see a
   * current-model value, regardless of what an older document happens to hold.
   */
  async get(uid: string): Promise<Record<string, any> | null> {
    const snap = await this.ref(uid).get();
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, any>;
    return { ...data, teacherStatus: normalizeTeacherStatus(data.teacherStatus) };
  }

  /**
   * Builds the writable field set from caller input.
   *
   * Deliberately constructs a NEW object instead of spreading `input`: that is what makes it
   * impossible for an unexpected key (`teacherStatus`, `uid`, `role`, `productRole`) to reach
   * Firestore, no matter what the client sends.
   */
  private sanitize(input: TeacherProfileInput): Record<string, any> {
    const out: Record<string, any> = {};

    const subjects = cleanStringArray(input.subjects);
    if (subjects) out.subjects = subjects;
    const boards = cleanStringArray(input.boards);
    if (boards) out.boards = boards;
    const classesTaught = cleanStringArray(input.classesTaught);
    if (classesTaught) out.classesTaught = classesTaught;
    const exams = cleanStringArray(input.exams);
    if (exams) out.exams = exams;
    const languages = cleanStringArray(input.languages);
    if (languages) out.languages = languages;

    const style = cleanText(input.teachingStyle, MAX_STYLE);
    if (style !== undefined) out.teachingStyle = style;
    const bio = cleanText(input.bio, MAX_BIO);
    if (bio !== undefined) out.bio = bio;

    if (input.yearsExperience === null) {
      out.yearsExperience = null;
    } else if (typeof input.yearsExperience === 'number' && Number.isFinite(input.yearsExperience)) {
      out.yearsExperience = Math.max(0, Math.min(70, Math.round(input.yearsExperience)));
    }

    if (isTeacherVisibility(input.visibility)) out.visibility = input.visibility;

    return out;
  }

  /**
   * Creates or updates the caller's teacher profile.
   *
   * Autosave-friendly: partial payloads merge, so a teacher who drops out mid-wizard keeps
   * everything entered so far — mirroring how the student wizard autosaves each step.
   */
  async upsert(
    uid: string,
    input: TeacherProfileInput
  ): Promise<{ profile: Record<string, any>; created: boolean }> {
    const ref = this.ref(uid);
    const snap = await ref.get();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const userRecord = await auth.getUser(uid);
    const fields = this.sanitize(input);

    const onboardingStatus: OnboardingStatus = input.markComplete
      ? 'complete'
      : snap.exists && (snap.data() as any)?.onboardingStatus === 'complete'
        ? 'complete'
        : 'in_progress';

    // Identity always re-mirrored from Auth so a changed Google display name stays accurate.
    const identity = {
      displayName: userRecord.displayName ?? null,
      email: userRecord.email ?? null,
      photoURL: userRecord.photoURL ?? null,
    };

    if (!snap.exists) {
      const doc: Record<string, any> = {
        uid,
        ...identity,
        subjects: [],
        boards: [],
        classesTaught: [],
        exams: [],
        languages: [],
        teachingStyle: null,
        bio: null,
        yearsExperience: null,
        visibility: 'private',
        ...fields,
        onboardingStatus,
        // Set exactly once, here. Never from input, never updated on this path.
        teacherStatus: INITIAL_TEACHER_STATUS,
        createdAt: now,
        updatedAt: now,
      };

      // Profile and its opening audit entry are written together: a profile whose initial
      // status has no corresponding trail entry would be indistinguishable from one whose
      // history had been tampered with.
      const batch = db.batch();
      batch.set(ref, doc);
      batch.set(db.collection(VERIFICATION_EVENTS).doc(), {
        teacherUid: uid,
        previousState: null,
        newState: INITIAL_TEACHER_STATUS,
        actorUid: null,
        actorRole: 'system',
        reason: 'Profile created',
        createdAt: now,
      } satisfies TeacherVerificationEvent);
      await batch.commit();

      logger.info('[TeacherProfile] Created', { uid, onboardingStatus, teacherStatus: INITIAL_TEACHER_STATUS });

      // The wizard's final step can set subjects AND markComplete in the same call — a teacher
      // finishing onboarding in one sitting should not be left in 'draft' just because this
      // happened to be their first save rather than their second.
      if (input.markComplete) await this.submitForReview(uid);

      const fresh = await ref.get();
      const data = fresh.data() as Record<string, any>;
      return { profile: { ...data, teacherStatus: normalizeTeacherStatus(data.teacherStatus) }, created: true };
    }

    // teacherStatus is deliberately absent from this merge — the update path can never move a
    // teacher through the state machine, no matter what the caller sends.
    await ref.set({ ...identity, ...fields, onboardingStatus, updatedAt: now }, { merge: true });

    if (input.markComplete) await this.submitForReview(uid);

    const fresh = await ref.get();
    const data = fresh.data() as Record<string, any>;
    return { profile: { ...data, teacherStatus: normalizeTeacherStatus(data.teacherStatus) }, created: false };
  }

  /**
   * Moves a profile from `draft` into the review pipeline. Called from `upsert()` whenever the
   * caller sets `markComplete`, for both the create-and-finish-in-one-call case and the more
   * common finish-after-earlier-autosaves case.
   *
   * `TEACHER_AUTO_APPROVE=true` sends it straight to `'approved'` instead of `'pending'` — the
   * documented testing shortcut for environments with no reviewer. Everywhere else, including
   * this file's own admin-facing `transitionStatus()`, `draft → approved` is not a legal
   * transition (`TEACHER_STATUS_TRANSITIONS.draft` contains only `'pending'`), so an admin can
   * never skip review by calling the API. This method is the one deliberate exception, gated
   * behind a flag that defaults to off, and it still writes a normal audit event — the trail
   * always shows whether an approval came from a person or from this flag.
   *
   * A no-op if the profile is not currently `draft`: re-saving an already-submitted profile
   * (including one that came back `rejected`) must not silently re-open or reset its review
   * state. Re-submission after rejection is a real product gap — `rejected` has no outgoing
   * transition anywhere in this system yet — but it is a policy decision, not something to
   * invent here.
   *
   * Transactional so two rapid saves (autosave firing near the "finish" click) cannot both
   * observe `draft` and double-submit.
   */
  private async submitForReview(uid: string): Promise<void> {
    const ref = this.ref(uid);
    const autoApprove = env.TEACHER_AUTO_APPROVE === 'true';
    const next: TeacherStatus = autoApprove ? 'approved' : 'pending';

    const submitted = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      if (normalizeTeacherStatus((snap.data() as any)?.teacherStatus) !== 'draft') return false;

      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.update(ref, { teacherStatus: next, updatedAt: now });
      tx.set(db.collection(VERIFICATION_EVENTS).doc(), {
        teacherUid: uid,
        previousState: 'draft',
        newState: next,
        actorUid: null,
        actorRole: 'system',
        reason: autoApprove
          ? 'Auto-approved on submission (TEACHER_AUTO_APPROVE=true)'
          : 'Submitted for review',
        createdAt: now,
      } satisfies TeacherVerificationEvent);
      return true;
    });

    if (submitted) logger.info('[TeacherVerification] Submitted', { uid, teacherStatus: next, autoApprove });
  }

  /**
   * Profiles currently awaiting a decision — `pending` and `under_review` — oldest submission
   * first, so a reviewer works the queue in the order teachers actually applied.
   *
   * This is the missing half of Phase 3A: the state machine and the transition endpoint have
   * existed since then, but nothing could put a teacher IN the queue this reads, and nothing
   * could list it for a human. Returns full profile fields (a reviewer needs them to decide) but
   * not verification history — that stays behind the per-teacher endpoint so listing the queue
   * doesn't fan out into one extra read per row.
   *
   * ⚠ Needs a composite index on (teacherStatus, updatedAt) — Firestore's error on first run
   * includes a direct console link to create it if it is missing.
   */
  async getReviewQueue(limit = 100): Promise<Record<string, any>[]> {
    const snap = await db
      .collection(this.collection)
      .where('teacherStatus', 'in', ['pending', 'under_review'])
      .orderBy('updatedAt', 'asc')
      .limit(Math.min(Math.max(limit, 1), 500))
      .get();
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, any>;
      return { ...data, teacherStatus: normalizeTeacherStatus(data.teacherStatus) };
    });
  }

  /**
   * Moves a teacher through the verification state machine. **Administrative operation.**
   *
   * Not reachable from the teacher-facing API surface: nothing in `/api/teacher/*` calls this,
   * and the only route that does sits behind the existing admin RBAC guard. The service does
   * not re-check authorization — that is the route's job — but it does enforce every rule that
   * must hold regardless of who the caller is:
   *
   *   · the target profile must exist;
   *   · the transition must be defined in TEACHER_STATUS_TRANSITIONS (so `draft → approved`
   *     fails even for a super_admin);
   *   · the read and the write happen in one transaction, so two admins acting simultaneously
   *     cannot both validate against the same stale status and produce a double transition.
   *
   * Every call that changes state writes exactly one audit event. A rejected transition
   * writes nothing and throws.
   */
  async transitionStatus(params: {
    teacherUid: string;
    to: TeacherStatus;
    actorUid: string;
    actorRole: string;
    reason?: string | null;
  }): Promise<{ previousState: TeacherStatus; newState: TeacherStatus }> {
    const { teacherUid, to, actorUid, actorRole } = params;
    const reason = cleanText(params.reason, MAX_REASON) ?? null;
    const ref = this.ref(teacherUid);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw Object.assign(new Error('Teacher profile not found'), { code: 'NOT_FOUND' });
      }

      const from = normalizeTeacherStatus((snap.data() as any)?.teacherStatus);
      if (!canTransition(from, to)) {
        throw Object.assign(
          new Error(`Transition ${from} → ${to} is not permitted`),
          { code: 'INVALID_TRANSITION', from, to },
        );
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.update(ref, { teacherStatus: to, updatedAt: now });
      tx.set(db.collection(VERIFICATION_EVENTS).doc(), {
        teacherUid,
        previousState: from,
        newState: to,
        actorUid,
        actorRole,
        reason,
        createdAt: now,
      } satisfies TeacherVerificationEvent);

      logger.info('[TeacherVerification] Transition', { teacherUid, from, to, actorUid, actorRole });
      return { previousState: from, newState: to };
    });
  }

  /**
   * The audit trail for one teacher, newest first. **Administrative read.**
   *
   * Exposed only through the admin surface. Review reasons can contain internal notes, so this
   * is deliberately not reachable from the teacher-facing profile endpoint.
   */
  async getVerificationHistory(teacherUid: string, limit = 50): Promise<Record<string, any>[]> {
    const snap = await db
      .collection(VERIFICATION_EVENTS)
      .where('teacherUid', '==', teacherUid)
      .orderBy('createdAt', 'desc')
      .limit(Math.min(Math.max(limit, 1), 200))
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

export const teacherProfileService = new TeacherProfileService();
