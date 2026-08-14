import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { classRepository } from '../repositories/class.repository';
import { classSessionRepository } from '../repositories/classSession.repository';
import { getVideoProvider } from './video';
import {
  ClassSessionRecord,
  MAX_SESSION_TITLE,
  SessionJoinInfo,
} from '../types/classSession';
import { logger } from '../utils/logger';

type CodedError = Error & { code: string; [k: string]: any };
const fail = (code: string, message: string, extra: Record<string, any> = {}): never => {
  throw Object.assign(new Error(message), { code, ...extra }) as CodedError;
};

/**
 * ClassSessionService — a live video call attached to a class (Phase 3M).
 *
 * See types/classSession.ts for the access model (owner or ACTIVE member — the same posture as
 * every other class-scoped collection) and services/video/VideoProvider.ts for why nothing here
 * imports a vendor SDK directly.
 */
export class ClassSessionService {
  /**
   * Starts a live session: creates the provider room and one join code per role, in one act —
   * there is no separate "scheduled" state in this phase (see types/classSession.ts). Refuses a
   * second concurrent session on the same class, matching how a real classroom only has one
   * live call at a time.
   */
  async goLive(classId: string, teacherUid: string, title?: string): Promise<ClassSessionRecord> {
    const classSnap = await classRepository.getById(classId);
    if (!classSnap) return fail('NOT_FOUND', 'Class not found');
    if (classSnap.ownerUid !== teacherUid) return fail('FORBIDDEN', 'Not your class');

    const existing = await classSessionRepository.findLiveByClass(classId);
    if (existing) return fail('ALREADY_LIVE', 'This class already has a live session.', { sessionId: existing.id });

    const provider = getVideoProvider();
    if (!provider.isConfigured()) return fail('VIDEO_NOT_CONFIGURED', 'Live classes are not set up yet.');

    const id = classSessionRepository.newId();
    const sessionTitle = (title?.trim() || classSnap.title).slice(0, MAX_SESSION_TITLE);

    const room = await provider.createRoom({ classId, sessionId: id, title: sessionTitle });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const record: ClassSessionRecord = {
      id, classId, ownerUid: teacherUid,
      title: sessionTitle,
      status: 'live',
      providerRoomId: room.providerRoomId,
      roomCodes: room.roomCodes,
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await classSessionRepository.create(record);

    logger.info('[ClassSession] Went live', { classId, sessionId: id, teacherUid });
    return record;
  }

  /**
   * Ends a live session. Best-effort against the provider — a room that fails to disable on
   * 100ms's side still gets marked `ended` here, since a stuck provider call must never block a
   * teacher from ending class from the app's point of view.
   */
  async endSession(classId: string, sessionId: string, teacherUid: string): Promise<ClassSessionRecord> {
    const session = await classSessionRepository.getById(sessionId);
    if (!session || session.classId !== classId) return fail('NOT_FOUND', 'Session not found');
    if (session.ownerUid !== teacherUid) return fail('FORBIDDEN', 'Not your class');
    if (session.status === 'ended') return session;

    const provider = getVideoProvider();
    await provider.endRoom(session.providerRoomId).catch((err) => {
      logger.warn('[ClassSession] endRoom failed on provider; marking ended anyway', { sessionId, error: err?.message });
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    await classSessionRepository.update(sessionId, { status: 'ended', endedAt: now, updatedAt: now });

    logger.info('[ClassSession] Ended', { classId, sessionId, teacherUid });
    return { ...session, status: 'ended', endedAt: now, updatedAt: now };
  }

  /**
   * What a specific caller needs to join — never the other role's code. The owner always joins
   * as `teacher`; anyone else needs a CURRENTLY-ACTIVE enrolment edge, checked fresh on every
   * call (not cached from when the session started), matching classAssignment.service.ts's
   * `startAttempt` posture. `NOT_FOUND` rather than `FORBIDDEN` for a non-member, same reasoning
   * as everywhere else in this codebase — confirming a session exists to a stranger is its own leak.
   */
  async getJoinInfo(classId: string, sessionId: string, viewerUid: string): Promise<SessionJoinInfo> {
    const session = await classSessionRepository.getById(sessionId);
    if (!session || session.classId !== classId) return fail('NOT_FOUND', 'Session not found');
    if (session.status !== 'live') return fail('SESSION_ENDED', 'This session has ended.');

    const isOwner = session.ownerUid === viewerUid;
    if (!isOwner) {
      const active = await this.isActiveMember(classId, viewerUid);
      if (!active) return fail('NOT_FOUND', 'Session not found');
    }

    const role = isOwner ? 'teacher' : 'student';
    const roomCode = session.roomCodes[role];
    const joinUrl = getVideoProvider().buildJoinUrl(roomCode);
    return { sessionId: session.id, title: session.title, role, roomCode, joinUrl };
  }

  /**
   * A class's session history — owner sees all, an ACTIVE member sees all too (there's nothing
   * sensitive in a past session's existence/title, unlike an assignment's answer key). Room
   * codes are ALWAYS stripped here — only getJoinInfo ever hands one out, and only the caller's
   * own role's code.
   */
  async listForClass(classId: string, viewerUid: string): Promise<Omit<ClassSessionRecord, 'roomCodes'>[]> {
    const classSnap = await classRepository.getById(classId);
    if (!classSnap) return fail('NOT_FOUND', 'Class not found');

    if (classSnap.ownerUid !== viewerUid) {
      const active = await this.isActiveMember(classId, viewerUid);
      if (!active) return fail('NOT_FOUND', 'Class not found');
    }

    const sessions = await classSessionRepository.listByClass(classId);
    return sessions.map(({ roomCodes, ...rest }) => rest);
  }

  /**
   * Deliberately duplicates the "is this uid an ACTIVE member" check rather than importing
   * enrollmentService — same reasoning as classResource/classAssignment/classPost services:
   * enrollment.service.ts already imports classResourceService, so the reverse import would be
   * circular.
   */
  private async isActiveMember(classId: string, uid: string): Promise<boolean> {
    const snap = await db.collection('classEnrollments').doc(`${classId}_${uid}`).get();
    return snap.exists && (snap.data() as { state: string }).state === 'ACTIVE';
  }
}

export const classSessionService = new ClassSessionService();
