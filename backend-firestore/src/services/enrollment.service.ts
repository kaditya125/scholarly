import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { classResourceService } from './classResource.service';
import { ClassRecord, isDiscoverable } from '../types/class';
import {
  EnrollmentRecord,
  EnrollmentSource,
  EnrollmentState,
  InvitationRecord,
  canTransitionEnrollment,
  enrollmentId,
  generateInvitationCode,
  isInvitationUsable,
} from '../types/enrollment';
import { logger } from '../utils/logger';

/**
 * EnrollmentService — the consent gate.
 *
 * Every rule below exists because breaking it would leak a student's data or let someone into a
 * class they never agreed to (or never paid for):
 *
 *  1. An edge only reaches ACTIVE through an act by BOTH sides. A teacher invite creates
 *     INVITED and stops; only the student can move it to ACTIVE. A student request creates
 *     REQUESTED and stops; only the teacher can move it on.
 *  2. PAID classes cannot be joined here at all. Purchasing does not exist yet, so an
 *     invitation to a paid class is refused rather than honoured — otherwise the invite flow
 *     would be a free door into paid content.
 *  3. Capacity is enforced against a transactionally-maintained counter on the class, so two
 *     simultaneous accepts cannot both slip into the last seat.
 *  4. Blocking is terminal in both directions.
 *  5. A teacher cannot enrol into their own class.
 *
 * Firestore requires every read in a transaction to precede every write, so each method below
 * reads what it needs up front and then writes once.
 */

const ENROLLMENTS = 'classEnrollments';
const INVITATIONS = 'classInvitations';
const CLASSES = 'classes';

type CodedError = Error & { code: string; [k: string]: any };
const fail = (code: string, message: string, extra: Record<string, any> = {}): never => {
  throw Object.assign(new Error(message), { code, ...extra }) as CodedError;
};

export class EnrollmentService {
  private enrollmentRef(classId: string, studentUid: string) {
    return db.collection(ENROLLMENTS).doc(enrollmentId(classId, studentUid));
  }

  /* ── Invitations ─────────────────────────────────────────────────────────────────── */

  /**
   * Mints a shareable code for a class the caller owns.
   *
   * Only a published or active class can be invited into — inviting someone to a draft would
   * expose an unfinished class, and to an archived one would be meaningless.
   */
  async createInvitation(
    classId: string,
    teacherUid: string,
    opts: { expiresAt?: string | null; maxUses?: number | null } = {},
  ): Promise<InvitationRecord> {
    const classSnap = await db.collection(CLASSES).doc(classId).get();
    if (!classSnap.exists) fail('NOT_FOUND', 'Class not found');

    const record = classSnap.data() as ClassRecord;
    if (record.ownerUid !== teacherUid) fail('FORBIDDEN', 'Not your class');
    if (!isDiscoverable(record.status)) {
      fail('CLASS_NOT_OPEN', 'Publish the class before inviting students');
    }

    const maxUses =
      typeof opts.maxUses === 'number' && Number.isFinite(opts.maxUses)
        ? Math.max(1, Math.min(10_000, Math.round(opts.maxUses)))
        : null;

    // Collision is astronomically unlikely at 31^8, but a duplicate would silently redirect
    // someone else's invitees, so we check rather than assume.
    let code = generateInvitationCode();
    for (let i = 0; i < 5; i++) {
      const existing = await db.collection(INVITATIONS).doc(code).get();
      if (!existing.exists) break;
      code = generateInvitationCode();
    }

    const invitation: InvitationRecord = {
      code,
      classId,
      createdBy: teacherUid,
      active: true,
      expiresAt: opts.expiresAt ?? null,
      maxUses,
      uses: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection(INVITATIONS).doc(code).set(invitation);
    logger.info('[Enrollment] Invitation created', { classId, teacherUid, code });
    return invitation;
  }

  /**
   * Resolves a code to a class PREVIEW.
   *
   * Returns only what someone deciding whether to join needs. Deliberately excludes the roster,
   * enrolment counts and anything about other students — a code is shareable, so anything
   * returned here should be considered public to whoever holds it.
   */
  async previewInvitation(code: string): Promise<{
    code: string;
    classId: string;
    usable: boolean;
    reason?: string;
    class: Pick<ClassRecord, 'id' | 'title' | 'description' | 'subject' | 'grade' | 'board' | 'exam' | 'language' | 'mode' | 'startDate' | 'endDate' | 'schedule' | 'pricing' | 'status'> & { syllabusCount: number };
  }> {
    const invSnap = await db.collection(INVITATIONS).doc(code).get();
    if (!invSnap.exists) fail('NOT_FOUND', 'Invitation not found');
    const inv = invSnap.data() as InvitationRecord;

    const classSnap = await db.collection(CLASSES).doc(inv.classId).get();
    if (!classSnap.exists) fail('NOT_FOUND', 'Class not found');
    const c = classSnap.data() as ClassRecord;

    const usable = isInvitationUsable(inv);

    return {
      code: inv.code,
      classId: inv.classId,
      usable: usable.ok && isDiscoverable(c.status),
      reason: !usable.ok ? usable.reason : !isDiscoverable(c.status) ? 'This class is not open to join.' : undefined,
      class: {
        id: c.id,
        title: c.title,
        description: c.description,
        subject: c.subject,
        grade: c.grade,
        board: c.board,
        exam: c.exam,
        language: c.language,
        mode: c.mode,
        startDate: c.startDate,
        endDate: c.endDate,
        schedule: c.schedule,
        pricing: c.pricing,
        status: c.status,
        syllabusCount: Array.isArray(c.syllabus) ? c.syllabus.length : 0,
      },
    };
  }

  /**
   * The student accepts an invitation — the only path from a code to ACTIVE.
   *
   * Refuses paid classes outright. When purchasing exists (3I) that branch becomes "create the
   * order, and let the verified webhook activate the edge" — never "trust the client".
   */
  async acceptInvitation(code: string, studentUid: string): Promise<EnrollmentRecord> {
    const invRef = db.collection(INVITATIONS).doc(code);

    const record = await db.runTransaction(async (tx) => {
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists) fail('NOT_FOUND', 'Invitation not found');
      const inv = invSnap.data() as InvitationRecord;

      const classRef = db.collection(CLASSES).doc(inv.classId);
      const classSnap = await tx.get(classRef);
      if (!classSnap.exists) fail('NOT_FOUND', 'Class not found');
      const c = classSnap.data() as ClassRecord;

      const edgeRef = this.enrollmentRef(inv.classId, studentUid);
      const edgeSnap = await tx.get(edgeRef);

      // ── reads done, validate ──
      const usable = isInvitationUsable(inv);
      if (!usable.ok) fail('INVITATION_UNUSABLE', usable.reason as string);
      if (!isDiscoverable(c.status)) fail('CLASS_NOT_OPEN', 'This class is not open to join.');
      if (c.ownerUid === studentUid) fail('SELF_ENROL', 'You cannot join your own class.');

      if (c.pricing.type === 'paid') {
        fail('PAYMENT_REQUIRED', 'This is a paid class. Purchasing is not available yet, so it cannot be joined.');
      }

      const existing = edgeSnap.exists ? (edgeSnap.data() as EnrollmentRecord) : null;
      if (existing) {
        if (existing.state === 'ACTIVE') return existing;
        if (!canTransitionEnrollment(existing.state, 'ACTIVE')) {
          fail('INVALID_TRANSITION', `Cannot join from ${existing.state}`, { from: existing.state, to: 'ACTIVE' });
        }
      }

      const seats = c.capacity;
      const enrolled = c.counts?.enrolled ?? 0;
      if (seats != null && enrolled >= seats) fail('CLASS_FULL', 'This class is full.');

      // ── writes ──
      const now = admin.firestore.FieldValue.serverTimestamp();
      const record = this.buildActive(inv.classId, studentUid, c.ownerUid, 'invitation', existing, now);

      tx.set(edgeRef, record, { merge: true });
      tx.update(classRef, { 'counts.enrolled': enrolled + 1, updatedAt: now });
      tx.update(invRef, { uses: inv.uses + 1 });

      logger.info('[Enrollment] Invitation accepted', { classId: inv.classId, studentUid });
      return record as EnrollmentRecord;
    });

    // Synced AFTER the edge commits, never inside the transaction — notebook writes go through
    // a different repository that doesn't accept a Firestore transaction handle, and a
    // resource-sharing hiccup must never make the enrolment itself fail or roll back.
    await classResourceService.syncAccessForEnrollment(record.classId, studentUid, true);
    return record;
  }

  private buildActive(
    classId: string,
    studentUid: string,
    teacherUid: string,
    source: EnrollmentSource,
    existing: EnrollmentRecord | null,
    now: FirebaseFirestore.FieldValue,
    orderId: string | null = null,
  ): Record<string, any> {
    return {
      id: enrollmentId(classId, studentUid),
      classId,
      studentUid,
      teacherUid,
      state: 'ACTIVE' as EnrollmentState,
      source,
      orderId,
      // Stamped once — surviving a later leave keeps the history honest.
      activatedAt: existing?.activatedAt ?? now,
      blockedBy: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  /**
   * Activates an edge from a verified payment — the branch `acceptInvitation`'s own comment
   * predicted: "create the order, and let the verified webhook activate the edge". Called ONLY
   * from `paymentsService.markClassOrderPaid`, itself reachable only from a signature-verified
   * Razorpay callback or webhook — never from a live request, so there is no `actorUid` to check
   * permission for. The payment having cleared IS the authorization.
   *
   * Deliberately does not enforce capacity the way `acceptInvitation`/`transition` do: by the
   * time this runs, Razorpay has already captured the student's money. Refusing the seat here
   * would mean holding payment for nothing — the worse outcome. `createClassOrder` checks
   * capacity before checkout opens; this only logs if the class filled up in the interim.
   */
  async activateFromPurchase(classId: string, studentUid: string, orderId: string): Promise<EnrollmentRecord> {
    const classRef = db.collection(CLASSES).doc(classId);
    const edgeRef = this.enrollmentRef(classId, studentUid);

    const record = await db.runTransaction(async (tx) => {
      const classSnap = await tx.get(classRef);
      if (!classSnap.exists) fail('NOT_FOUND', 'Class not found');
      const c = classSnap.data() as ClassRecord;

      const edgeSnap = await tx.get(edgeRef);
      const existing = edgeSnap.exists ? (edgeSnap.data() as EnrollmentRecord) : null;

      // Idempotent: the webhook and the client-side verify callback can both race to apply the
      // same order. If this exact purchase already activated the edge, return it unchanged.
      if (existing?.state === 'ACTIVE' && existing.orderId === orderId) return existing;

      const now = admin.firestore.FieldValue.serverTimestamp();
      const record = this.buildActive(classId, studentUid, c.ownerUid, 'purchase', existing, now, orderId);

      const enrolled = c.counts?.enrolled ?? 0;
      const wasActive = existing?.state === 'ACTIVE';
      tx.set(edgeRef, record, { merge: true });
      if (!wasActive) tx.update(classRef, { 'counts.enrolled': enrolled + 1, updatedAt: now });

      const seats = c.capacity;
      if (seats != null && enrolled >= seats && !wasActive) {
        logger.warn('[Enrollment] Purchase activated over capacity', { classId, studentUid, orderId, capacity: seats, enrolled });
      }

      logger.info('[Enrollment] Activated from purchase', { classId, studentUid, orderId });
      return record as EnrollmentRecord;
    });

    await classResourceService.syncAccessForEnrollment(classId, studentUid, true);
    return record;
  }

  /* ── Requests (student-initiated) ────────────────────────────────────────────────── */

  /** A student asks to join a discoverable class. Grants nothing until the teacher accepts. */
  async requestToJoin(classId: string, studentUid: string): Promise<EnrollmentRecord> {
    const classRef = db.collection(CLASSES).doc(classId);
    const edgeRef = this.enrollmentRef(classId, studentUid);

    return db.runTransaction(async (tx) => {
      const classSnap = await tx.get(classRef);
      if (!classSnap.exists) fail('NOT_FOUND', 'Class not found');
      const c = classSnap.data() as ClassRecord;
      const edgeSnap = await tx.get(edgeRef);

      if (!isDiscoverable(c.status)) fail('CLASS_NOT_OPEN', 'This class is not open to join.');
      if (c.ownerUid === studentUid) fail('SELF_ENROL', 'You cannot join your own class.');

      const existing = edgeSnap.exists ? (edgeSnap.data() as EnrollmentRecord) : null;
      if (existing?.state === 'REQUESTED') return existing;
      if (existing?.state === 'ACTIVE') fail('ALREADY_ENROLLED', 'You are already in this class.');
      if (existing && !canTransitionEnrollment(existing.state, 'REQUESTED')) {
        fail('INVALID_TRANSITION', `Cannot request from ${existing.state}`, { from: existing.state, to: 'REQUESTED' });
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const record = {
        id: enrollmentId(classId, studentUid),
        classId,
        studentUid,
        teacherUid: c.ownerUid,
        state: 'REQUESTED' as EnrollmentState,
        source: 'request' as EnrollmentSource,
        activatedAt: existing?.activatedAt ?? null,
        blockedBy: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      tx.set(edgeRef, record, { merge: true });
      return record as EnrollmentRecord;
    });
  }

  /* ── Generic transition, used by every teacher/student action ───────────────────── */

  /**
   * Moves an existing edge, enforcing who is allowed to make that particular move.
   *
   * `actorRole` is derived by the caller from ownership, never from a request body. The
   * permission table below is the whole point of this method: a student cannot accept their own
   * request, and a teacher cannot accept their own invitation on the student's behalf.
   */
  async transition(params: {
    classId: string;
    studentUid: string;
    actorUid: string;
    to: EnrollmentState;
  }): Promise<EnrollmentRecord> {
    const { classId, studentUid, actorUid, to } = params;
    const classRef = db.collection(CLASSES).doc(classId);
    const edgeRef = this.enrollmentRef(classId, studentUid);

    // Set inside the transaction closure below once the from/to states are known. A closure may
    // run more than once under contention, but by the time `runTransaction` resolves it has run
    // to completion exactly once, so the last assignment is always the one that actually committed.
    let syncGrant: boolean | null = null;

    const result = await db.runTransaction(async (tx) => {
      const edgeSnap = await tx.get(edgeRef);
      if (!edgeSnap.exists) fail('NOT_FOUND', 'No enrolment found');
      const edge = edgeSnap.data() as EnrollmentRecord;

      const classSnap = await tx.get(classRef);
      if (!classSnap.exists) fail('NOT_FOUND', 'Class not found');
      const c = classSnap.data() as ClassRecord;

      const isTeacher = c.ownerUid === actorUid;
      const isStudent = edge.studentUid === actorUid;
      if (!isTeacher && !isStudent) fail('FORBIDDEN', 'You are not part of this enrolment');

      // Who may perform which move.
      const allowed: Record<EnrollmentState, 'teacher' | 'student' | 'either'> = {
        ACTIVE: edge.state === 'REQUESTED' ? 'teacher' : 'student', // accept request / accept invite
        DECLINED: 'student',
        REJECTED: 'teacher',
        LEFT: 'student',
        REMOVED: 'teacher',
        BLOCKED: 'either',
        INVITED: 'teacher',
        REQUESTED: 'student',
      };
      const who = allowed[to];
      if (who === 'teacher' && !isTeacher) fail('FORBIDDEN', 'Only the teacher can do that');
      if (who === 'student' && !isStudent) fail('FORBIDDEN', 'Only the student can do that');

      if (!canTransitionEnrollment(edge.state, to)) {
        fail('INVALID_TRANSITION', `Cannot move from ${edge.state} to ${to}`, { from: edge.state, to });
      }

      if (to === 'ACTIVE') {
        if (c.pricing.type === 'paid') {
          fail('PAYMENT_REQUIRED', 'This is a paid class. Purchasing is not available yet.');
        }
        const seats = c.capacity;
        const enrolled = c.counts?.enrolled ?? 0;
        if (seats != null && enrolled >= seats) fail('CLASS_FULL', 'This class is full.');
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const patch: Record<string, any> = { state: to, updatedAt: now };
      if (to === 'ACTIVE' && !edge.activatedAt) patch.activatedAt = now;
      if (to === 'BLOCKED') patch.blockedBy = actorUid;

      tx.update(edgeRef, patch);

      // Keep the denormalised seat count honest in the same transaction that changes the edge.
      const wasActive = edge.state === 'ACTIVE';
      const nowActive = to === 'ACTIVE';
      syncGrant = !wasActive && nowActive ? true : wasActive && !nowActive ? false : null;

      const enrolled = c.counts?.enrolled ?? 0;
      if (!wasActive && nowActive) tx.update(classRef, { 'counts.enrolled': enrolled + 1, updatedAt: now });
      if (wasActive && !nowActive) tx.update(classRef, { 'counts.enrolled': Math.max(0, enrolled - 1), updatedAt: now });

      logger.info('[Enrollment] Transition', { classId, studentUid, from: edge.state, to, actorUid });
      return { ...edge, ...patch, state: to } as EnrollmentRecord;
    });

    // Resource access is a projection of the edge, synced only when ACTIVE was actually gained
    // or lost — a request→request or invited→declined move touches no notebook access at all.
    if (syncGrant !== null) {
      await classResourceService.syncAccessForEnrollment(classId, studentUid, syncGrant);
    }

    return result;
  }

  /* ── Reads ───────────────────────────────────────────────────────────────────────── */

  /**
   * The roster for a class the caller owns.
   *
   * Returns the EDGES only — uid and state. It deliberately does not join to student profiles:
   * deciding what a teacher may see about an enrolled student is its own decision, and doing it
   * implicitly inside a list endpoint is how over-exposure happens.
   */
  async listRoster(classId: string, teacherUid: string, state?: EnrollmentState): Promise<EnrollmentRecord[]> {
    const classSnap = await db.collection(CLASSES).doc(classId).get();
    if (!classSnap.exists) fail('NOT_FOUND', 'Class not found');
    if ((classSnap.data() as ClassRecord).ownerUid !== teacherUid) fail('FORBIDDEN', 'Not your class');

    let q = db.collection(ENROLLMENTS).where('classId', '==', classId);
    if (state) q = q.where('state', '==', state);
    const snap = await q.limit(500).get();
    return snap.docs.map((d) => d.data() as EnrollmentRecord);
  }

  /**
   * The caller's own enrolments, in any state, each with a small class summary attached.
   *
   * The summary is joined HERE rather than left to the client, which would otherwise have to
   * fire one request per enrolment to render a list of class names. The fields included are the
   * same ones an invitation preview exposes — title, subject, status, pricing — and nothing
   * about the teacher beyond their uid or about anyone else enrolled.
   *
   * `class` is null when the class has been deleted out from under the edge; the row still
   * renders rather than the whole list failing.
   */
  async listMine(studentUid: string): Promise<(EnrollmentRecord & { class: Record<string, any> | null })[]> {
    const snap = await db
      .collection(ENROLLMENTS)
      .where('studentUid', '==', studentUid)
      .limit(500)
      .get();

    const edges = snap.docs.map((d) => d.data() as EnrollmentRecord);
    if (edges.length === 0) return [];

    const uniqueIds = Array.from(new Set(edges.map((e) => e.classId)));
    const docs = await Promise.all(uniqueIds.map((id) => db.collection(CLASSES).doc(id).get()));

    const byId = new Map<string, Record<string, any>>();
    docs.forEach((d, i) => {
      if (!d.exists) return;
      const c = d.data() as ClassRecord;
      byId.set(uniqueIds[i], {
        id: c.id,
        title: c.title,
        subject: c.subject,
        grade: c.grade,
        board: c.board,
        mode: c.mode,
        startDate: c.startDate,
        endDate: c.endDate,
        status: c.status,
        pricing: c.pricing,
      });
    });

    return edges.map((e) => ({ ...e, class: byId.get(e.classId) ?? null }));
  }

  /**
   * The single question every future class-scoped feature must ask before showing a student's
   * data to a teacher, or class content to a student.
   */
  async isActiveMember(classId: string, studentUid: string): Promise<boolean> {
    const snap = await this.enrollmentRef(classId, studentUid).get();
    return snap.exists && (snap.data() as EnrollmentRecord).state === 'ACTIVE';
  }
}

export const enrollmentService = new EnrollmentService();
