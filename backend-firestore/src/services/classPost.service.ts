import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { classRepository } from '../repositories/class.repository';
import { classPostRepository } from '../repositories/classPost.repository';
import { notificationService } from './notification/notification.service';
import {
  ClassPostRecord,
  CreatePostInput,
  MAX_POST_BODY,
  MAX_POST_TITLE,
  isPostKind,
} from '../types/classPost';
import { logger } from '../utils/logger';

type CodedError = Error & { code: string; [k: string]: any };
const fail = (code: string, message: string, extra: Record<string, any> = {}): never => {
  throw Object.assign(new Error(message), { code, ...extra }) as CodedError;
};

const NOTIFY_BODY_PREVIEW = 140;

/**
 * ClassPostService — the class-scoped feed behind announcements and discussion.
 *
 * See types/classPost.ts for why this is one collection covering both, and why it is a fresh
 * model rather than a reuse of the existing (unscoped) `discussions` system.
 */
export class ClassPostService {
  /**
   * Creates a post. `kind: 'announcement'` requires the caller to own the class — enforced here
   * AND, for the `createClass` capability specifically, in the controller (see
   * classPost.controller.ts for why the capability check can't live in route middleware: this
   * route also carries student-authored discussion posts, so it can't sit behind
   * `requireCapability` wholesale). `kind: 'discussion'` is open to the owner or any ACTIVE
   * member.
   *
   * `return fail(...)` throughout — see classResource.service.ts for why a bare `fail(...)`
   * statement doesn't reliably narrow a nullable local in this codebase's TS configuration.
   */
  async create(classId: string, callerUid: string, input: CreatePostInput): Promise<ClassPostRecord> {
    const kind = input.kind;
    if (!isPostKind(kind)) return fail('INVALID_INPUT', 'kind must be "announcement" or "discussion".');

    const body = typeof input.body === 'string' ? input.body.trim() : '';
    if (!body) return fail('INVALID_INPUT', 'body is required.');
    if (body.length > MAX_POST_BODY) return fail('INVALID_INPUT', `body must be ${MAX_POST_BODY} characters or fewer.`);

    const title = typeof input.title === 'string' && input.title.trim()
      ? input.title.trim().slice(0, MAX_POST_TITLE)
      : null;

    const classSnap = await classRepository.getById(classId);
    if (!classSnap) return fail('NOT_FOUND', 'Class not found');
    const isOwner = classSnap.ownerUid === callerUid;

    if (kind === 'announcement') {
      if (!isOwner) return fail('FORBIDDEN', 'Only the class teacher can post an announcement.');
    } else if (!isOwner) {
      const active = await this.isActiveMember(classId, callerUid);
      if (!active) return fail('NOT_FOUND', 'Class not found');
    }

    let parent: ClassPostRecord | null = null;
    const parentId = typeof input.parentId === 'string' && input.parentId ? input.parentId : null;
    if (parentId) {
      parent = await classPostRepository.getById(parentId);
      if (!parent || parent.classId !== classId) {
        return fail('INVALID_INPUT', 'Reply target not found in this class.');
      }
    }

    const record: ClassPostRecord = {
      id: classPostRepository.newId(),
      classId,
      ownerUid: classSnap.ownerUid,
      authorUid: callerUid,
      authorRole: isOwner ? 'teacher' : 'student',
      kind,
      title,
      body,
      parentId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await classPostRepository.create(record);

    if (kind === 'announcement') {
      await this.notifyAnnouncement(classId, callerUid, classSnap.title, record);
    } else if (parent && parent.authorUid !== callerUid) {
      await this.notifyReply(classId, classSnap.title, parent, record);
    }

    logger.info('[ClassPost] Created', { classId, postId: record.id, kind, authorRole: record.authorRole });
    return record;
  }

  /**
   * Posts for a class — owner sees them always, everyone else only while an ACTIVE enrolment
   * holds. `NOT_FOUND` rather than `FORBIDDEN` on refusal, matching class.service.ts,
   * enrollment.service.ts and classResource.service.ts: confirming a class's feed exists to
   * someone with no relationship to it is its own small leak.
   */
  async listForClass(classId: string, viewerUid: string): Promise<ClassPostRecord[]> {
    const classSnap = await classRepository.getById(classId);
    if (!classSnap) return fail('NOT_FOUND', 'Class not found');

    if (classSnap.ownerUid !== viewerUid) {
      const active = await this.isActiveMember(classId, viewerUid);
      if (!active) return fail('NOT_FOUND', 'Class not found');
    }

    return classPostRepository.listByClass(classId);
  }

  /**
   * Notifies every currently-ACTIVE member (never the poster) that a new announcement landed.
   * Best-effort per recipient — one failed notification write must not roll back the post that
   * already succeeded, matching classResource.service.ts's sync-hook posture.
   */
  private async notifyAnnouncement(classId: string, teacherUid: string, classTitle: string, post: ClassPostRecord): Promise<void> {
    const roster = await this.activeStudentUids(classId);
    const preview = post.body.length > NOTIFY_BODY_PREVIEW ? `${post.body.slice(0, NOTIFY_BODY_PREVIEW)}…` : post.body;
    await Promise.all(
      roster
        .filter((uid) => uid !== teacherUid)
        .map((uid) =>
          notificationService
            .createNotification({
              userId: uid,
              category: 'administrative',
              type: 'class_announcement',
              priority: 'medium',
              title: post.title || `New announcement in ${classTitle}`,
              body: preview,
              actionUrl: '/my-classes',
              metadata: { classId, postId: post.id },
            })
            .catch((err) => logger.warn('[ClassPost] Announcement notify failed', { classId, uid, error: err?.message })),
        ),
    );
  }

  /** Notifies the parent post's author that someone replied — never the replier themselves. */
  private async notifyReply(classId: string, classTitle: string, parent: ClassPostRecord, reply: ClassPostRecord): Promise<void> {
    const preview = reply.body.length > NOTIFY_BODY_PREVIEW ? `${reply.body.slice(0, NOTIFY_BODY_PREVIEW)}…` : reply.body;
    await notificationService
      .createNotification({
        userId: parent.authorUid,
        category: 'social',
        type: 'class_reply',
        priority: 'low',
        title: `New reply in ${classTitle}`,
        body: preview,
        actionUrl: parent.authorRole === 'teacher' ? `/teach/classes/${classId}` : '/my-classes',
        metadata: { classId, postId: reply.id, parentId: parent.id },
      })
      .catch((err) => logger.warn('[ClassPost] Reply notify failed', { classId, error: err?.message }));
  }

  /**
   * Deliberately duplicates the two-line "is this uid an ACTIVE member" check rather than
   * importing enrollmentService — see classResource.service.ts / classAssignment.service.ts for
   * why: enrollment.service.ts already calls into class* services on transition, so the reverse
   * import would be circular.
   */
  private async isActiveMember(classId: string, uid: string): Promise<boolean> {
    const snap = await db.collection('classEnrollments').doc(`${classId}_${uid}`).get();
    return snap.exists && (snap.data() as { state: string }).state === 'ACTIVE';
  }

  private async activeStudentUids(classId: string): Promise<string[]> {
    const snap = await db
      .collection('classEnrollments')
      .where('classId', '==', classId)
      .where('state', '==', 'ACTIVE')
      .get();
    return snap.docs.map((d) => (d.data() as { studentUid: string }).studentUid);
  }
}

export const classPostService = new ClassPostService();
