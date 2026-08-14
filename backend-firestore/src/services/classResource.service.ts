import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { classRepository } from '../repositories/class.repository';
import { classResourceRepository } from '../repositories/classResource.repository';
import { notebookService } from './notebook.service';
import { NotebookSharingService } from './notebookSharing.service';
import {
  AttachResourceInput,
  ClassResourceRecord,
  MAX_RESOURCE_TITLE,
  isResourceProvenanceSource,
} from '../types/classResource';
import { logger } from '../utils/logger';

type CodedError = Error & { code: string; [k: string]: any };
const fail = (code: string, message: string, extra: Record<string, any> = {}): never => {
  throw Object.assign(new Error(message), { code, ...extra }) as CodedError;
};

/**
 * ClassResourceService — attaching notebooks to classes, and keeping notebook access in
 * lockstep with enrolment.
 *
 * See types/classResource.ts for why a resource is a notebook pointer rather than a new
 * content system, and why access is granted through the existing `viewers` array rather than a
 * parallel permission model.
 */
export class ClassResourceService {
  private sharing = new NotebookSharingService();

  /**
   * Attaches a notebook the teacher owns to a class the teacher owns, and immediately shares it
   * with every student currently ACTIVE in that class — a resource added mid-course should not
   * be invisible to students who already joined.
   *
   * Ownership of the notebook is checked STRICTLY here (`owner === teacherUid`), deliberately
   * tighter than `notebookSharing.shareWithUser`'s own check, which also accepts an editor. A
   * class resource should be the teacher's own material, not something merely shared with them —
   * sharing a shared thing would blur whose "teacher_authored" claim is even being made.
   */
  async attach(classId: string, teacherUid: string, input: AttachResourceInput): Promise<ClassResourceRecord> {
    const notebookId = typeof input.notebookId === 'string' ? input.notebookId.trim() : '';
    if (!notebookId) fail('INVALID_INPUT', 'notebookId is required.');

    // `return fail(...)` rather than a bare `fail(...)` statement below: `fail` is typed to
    // return `never`, but TypeScript only narrows a nullable LOCAL VARIABLE across subsequent
    // statements when the guard is an unconditional `return`/`throw` — a call to a separately
    // defined never-returning function doesn't reliably trigger that narrowing. `class.service.ts`
    // never hits this because it throws directly inline; this file calls a helper, so every
    // guard here uses `return` to get the same compile-time guarantee.
    const classSnap = await classRepository.getById(classId);
    if (!classSnap) return fail('NOT_FOUND', 'Class not found');
    if (classSnap.ownerUid !== teacherUid) return fail('FORBIDDEN', 'Not your class');

    let notebook;
    try {
      notebook = await notebookService.getNotebookById(notebookId, teacherUid);
    } catch {
      return fail('NOTEBOOK_NOT_FOUND', 'Notebook not found.');
    }
    if (!notebook || (notebook.owner !== teacherUid && notebook.userId !== teacherUid)) {
      return fail('NOTEBOOK_NOT_OWNED', 'You can only attach a notebook you own.');
    }

    const source = isResourceProvenanceSource(input.source) ? input.source : 'teacher_authored';
    const title = (typeof input.title === 'string' && input.title.trim()
      ? input.title.trim()
      : notebook.title
    ).slice(0, MAX_RESOURCE_TITLE);

    const now = admin.firestore.FieldValue.serverTimestamp();
    const record: ClassResourceRecord = {
      id: classResourceRepository.newId(),
      classId,
      ownerUid: teacherUid,
      notebookId,
      title,
      provenance: { source, createdBy: teacherUid },
      createdAt: now,
      updatedAt: now,
    };
    await classResourceRepository.create(record);

    // Share with everyone already in the class. Best-effort per student: one student's share
    // failing (e.g. a stale roster entry) must not stop the others from getting access, and must
    // not undo the attach that already succeeded.
    const roster = await this.activeStudentUids(classId);
    await Promise.all(
      roster.map((uid) =>
        this.sharing.shareWithUser(notebookId, teacherUid, uid, 'viewer').catch((err) =>
          logger.warn('[ClassResource] Share failed for existing member', { classId, notebookId, uid, error: err?.message }),
        ),
      ),
    );

    logger.info('[ClassResource] Attached', { classId, notebookId, teacherUid, sharedWith: roster.length });
    return record;
  }

  /**
   * Resources for a class — owner sees them always, everyone else only while an ACTIVE
   * enrolment holds. A curious visitor must not see a class's resource list just because the
   * class itself is publicly discoverable; discoverability answers "should I join", not "am I
   * in". `NOT_FOUND` rather than `FORBIDDEN` on refusal, for the same reason it's used
   * throughout `class.service.ts` and `enrollment.service.ts`: confirming a class or its
   * resources exist to someone with no relationship to it is its own small leak.
   *
   * Deliberately duplicates the two-line "is this uid an ACTIVE member" check that
   * `enrollmentService.isActiveMember` already performs, rather than importing it — see
   * `activeStudentUids` below for why that import would be circular.
   */
  async listForClass(classId: string, viewerUid: string): Promise<ClassResourceRecord[]> {
    const classSnap = await classRepository.getById(classId);
    if (!classSnap) return fail('NOT_FOUND', 'Class not found');

    if (classSnap.ownerUid !== viewerUid) {
      const edgeSnap = await db.collection('classEnrollments').doc(`${classId}_${viewerUid}`).get();
      const active = edgeSnap.exists && (edgeSnap.data() as { state: string }).state === 'ACTIVE';
      if (!active) return fail('NOT_FOUND', 'Class not found');
    }

    return classResourceRepository.listByClass(classId);
  }

  /**
   * Detaches a resource: revokes the notebook share from every currently ACTIVE student, then
   * deletes the wrapper record. The underlying notebook is untouched — it remains the teacher's
   * own asset outside the class context, exactly as it was before attaching.
   */
  async detach(classId: string, resourceId: string, teacherUid: string): Promise<void> {
    const resource = await classResourceRepository.getById(resourceId);
    if (!resource || resource.classId !== classId) return fail('NOT_FOUND', 'Resource not found');
    if (resource.ownerUid !== teacherUid) return fail('FORBIDDEN', 'Not your class');

    const roster = await this.activeStudentUids(classId);
    await Promise.all(
      roster.map((uid) =>
        this.sharing.revokeAccess(resource.notebookId, teacherUid, uid).catch((err) =>
          logger.warn('[ClassResource] Revoke failed on detach', { classId, resourceId, uid, error: err?.message }),
        ),
      ),
    );

    await classResourceRepository.delete(resourceId);
    logger.info('[ClassResource] Detached', { classId, resourceId, teacherUid });
  }

  /**
   * The enrolment sync hook — called from `enrollment.service.ts` after an edge transitions
   * into or out of ACTIVE. `granted: true` shares every one of the class's current resources
   * with the student; `false` revokes all of them.
   *
   * Deliberately swallows its own errors rather than letting the caller decide: this function
   * exists specifically so an enrolment change can never be rolled back by a notebook-sharing
   * failure. The enrolment edge is the source of truth; resource access is a best-effort
   * projection of it, not the other way around.
   */
  async syncAccessForEnrollment(classId: string, studentUid: string, granted: boolean): Promise<void> {
    try {
      const classSnap = await classRepository.getById(classId);
      if (!classSnap) return; // class gone; nothing to sync
      const resources = await classResourceRepository.listByClass(classId);
      if (resources.length === 0) return;

      const op = granted
        ? (nbId: string) => this.sharing.shareWithUser(nbId, classSnap.ownerUid, studentUid, 'viewer')
        : (nbId: string) => this.sharing.revokeAccess(nbId, classSnap.ownerUid, studentUid);

      await Promise.all(
        resources.map((r) =>
          op(r.notebookId).catch((err) =>
            logger.warn('[ClassResource] Enrolment sync failed for one resource', {
              classId, studentUid, granted, notebookId: r.notebookId, error: err?.message,
            }),
          ),
        ),
      );
    } catch (err: any) {
      logger.warn('[ClassResource] Enrolment sync failed', { classId, studentUid, granted, error: err?.message });
    }
  }

  /**
   * Every ACTIVE student uid for a class. Used to fan out share/revoke operations.
   *
   * Queries `classEnrollments` directly by collection name rather than through
   * `enrollment.service.ts`, which would create a service→service→service cycle
   * (enrollment.service calls classResourceService.syncAccessForEnrollment, so the reverse
   * import would be circular). Reading the collection name here is the same trade the original
   * repositories make throughout this codebase — the collection name is the contract.
   */
  private async activeStudentUids(classId: string): Promise<string[]> {
    const snap = await db
      .collection('classEnrollments')
      .where('classId', '==', classId)
      .where('state', '==', 'ACTIVE')
      .get();
    return snap.docs.map((d) => (d.data() as { studentUid: string }).studentUid);
  }
}

// Matches the rest of this codebase's convention for services that touch multiple collections:
// a singleton, unlike notebookSharing.service.ts (whose own callers instantiate it directly).
export const classResourceService = new ClassResourceService();
