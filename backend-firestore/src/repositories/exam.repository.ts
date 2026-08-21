/**
 * ExamRepository — Firestore Data Access Layer for Exam Intelligence
 * Manages exams, cycles, verified official sources, versioned syllabi, and audit logs.
 */

import { db } from '../config/firebase';
import { canTransition, assertPublishable } from '../services/exam/syllabusLifecycle';
import {
  ExamMaster,
  ExamCategory,
  ExamStatus,
  ExamCycle,
  ExamOfficialSource,
  ExamSyllabus,
  ExamAuditRecord,
  SyllabusStatus,
  SyllabusInvalidationReason,
} from '../types/exam.types';

export class ExamRepository {
  private readonly examsCol = db.collection('exams');
  private readonly sourcesCol = db.collection('exam_official_sources');
  private readonly syllabiCol = db.collection('exam_syllabi');
  private readonly auditCol = db.collection('exam_audit_logs');

  // ─── 1. Exam Master Operations ─────────────────────────────────────────────

  async createExam(exam: ExamMaster): Promise<void> {
    await this.examsCol.doc(exam.examId).set(exam);
  }

  async getExamById(examId: string): Promise<ExamMaster | null> {
    const doc = await this.examsCol.doc(examId).get();
    if (!doc.exists) return null;
    return doc.data() as ExamMaster;
  }

  async listExams(filter?: { category?: ExamCategory; status?: ExamStatus }): Promise<ExamMaster[]> {
    let query: FirebaseFirestore.Query = this.examsCol;

    if (filter?.category) {
      query = query.where('category', '==', filter.category);
    }
    if (filter?.status) {
      query = query.where('status', '==', filter.status);
    }

    const snap = await query.get();
    return snap.docs.map((d) => d.data() as ExamMaster);
  }

  async updateExam(examId: string, updates: Partial<ExamMaster>): Promise<void> {
    await this.examsCol.doc(examId).set(
      {
        ...updates,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  }

  /**
   * Finds an exam matching a name, shortName, or alias (case-insensitive in memory or array-contains).
   */
  async findExamByAlias(aliasQuery: string): Promise<ExamMaster | null> {
    const normalized = aliasQuery.trim().toLowerCase();
    if (!normalized) return null;

    // 1. Direct ID lookup
    const directSlug = normalized.toUpperCase().replace(/[\s-]+/g, '_');
    const directDoc = await this.getExamById(directSlug);
    if (directDoc) return directDoc;

    // 2. Scan all active exams (pilot and full registry sets are bounded < 500 records)
    const all = await this.listExams({ status: 'ACTIVE' });
    const match = all.find((exam) => {
      if (exam.examId.toLowerCase() === normalized) return true;
      if (exam.shortName.toLowerCase() === normalized) return true;
      if (exam.name.toLowerCase() === normalized) return true;
      if (exam.aliases && exam.aliases.some((a) => a.toLowerCase() === normalized)) return true;
      return false;
    });

    return match || null;
  }

  // ─── 2. Exam Cycle Operations ──────────────────────────────────────────────

  async createCycle(cycle: ExamCycle): Promise<void> {
    await this.examsCol.doc(cycle.examId).collection('cycles').doc(cycle.cycleId).set(cycle);
  }

  async getCycle(examId: string, cycleId: string): Promise<ExamCycle | null> {
    const doc = await this.examsCol.doc(examId).collection('cycles').doc(cycleId).get();
    if (!doc.exists) return null;
    return doc.data() as ExamCycle;
  }

  async listCycles(examId: string): Promise<ExamCycle[]> {
    const snap = await this.examsCol.doc(examId).collection('cycles').orderBy('year', 'desc').get();
    return snap.docs.map((d) => d.data() as ExamCycle);
  }

  async updateCycle(examId: string, cycleId: string, updates: Partial<ExamCycle>): Promise<void> {
    await this.examsCol
      .doc(examId)
      .collection('cycles')
      .doc(cycleId)
      .set(
        {
          ...updates,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
  }

  // ─── 3. Official Source Operations ─────────────────────────────────────────

  async createOfficialSource(source: ExamOfficialSource): Promise<void> {
    await this.sourcesCol.doc(source.sourceId).set(source);
  }

  async getOfficialSource(sourceId: string): Promise<ExamOfficialSource | null> {
    const doc = await this.sourcesCol.doc(sourceId).get();
    if (!doc.exists) return null;
    return doc.data() as ExamOfficialSource;
  }

  async listOfficialSources(
    examId: string,
    filter?: { activeOnly?: boolean; verifiedOnly?: boolean }
  ): Promise<ExamOfficialSource[]> {
    let query: FirebaseFirestore.Query = this.sourcesCol.where('examId', '==', examId);

    if (filter?.activeOnly) {
      query = query.where('active', '==', true);
    }
    if (filter?.verifiedOnly) {
      query = query.where('verified', '==', true);
    }

    const snap = await query.get();
    return snap.docs.map((d) => d.data() as ExamOfficialSource);
  }

  async updateOfficialSource(sourceId: string, updates: Partial<ExamOfficialSource>): Promise<void> {
    await this.sourcesCol.doc(sourceId).set(
      {
        ...updates,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  }

  // ─── 4. Versioned Syllabus Operations ──────────────────────────────────────

  /**
   * Writes a NEW syllabus version. Refuses to touch one that already exists.
   *
   * This was `.set()`, which overwrites unconditionally, and that made every syllabus version
   * silently replaceable by anything holding the same id. The concrete danger found in the J.7.0
   * audit: a seed path called this with a fabricated record whose status was CURRENT, so one call
   * would have replaced production's quarantined `syl_ssc_cgl_2026_v1` — INVALID,
   * LEGACY_SEED_UNVERIFIED, with its invalidation history intact — with a CURRENT record hashing
   * the empty string. The J.3 quarantine would have vanished with no error and no audit entry.
   *
   * `.create()` rejects with ALREADY_EXISTS instead, which turns all four of these into loud
   * failures rather than silent data loss:
   *   · an INVALID record being overwritten by a seed or a retry
   *   · a CURRENT record being replaced by an unverified object
   *   · a SUPERSEDED record — permanent history that evidence still points at — being rewritten
   *   · a version id being reused for different content, breaking identity immutability
   *
   * Every legitimate caller already checks `getSyllabusById` first and returns ALREADY_EXISTS, so
   * reaching this error means a caller intended to overwrite. Status changes have their own paths:
   * `updateSyllabusStatus` (lifecycle-validated, cannot reach CURRENT) and `publishSyllabusVersion`
   * (provenance + graph gated). Creation deliberately confers no status of its own.
   */
  async createSyllabus(syllabus: ExamSyllabus): Promise<void> {
    try {
      await this.syllabiCol.doc(syllabus.syllabusId).create(syllabus);
    } catch (err: any) {
      if (err?.code === 6 || /ALREADY_EXISTS/i.test(err?.message ?? '')) {
        throw new Error(
          `[Syllabus] refusing to overwrite existing version '${syllabus.syllabusId}'. ` +
          `A syllabus version is immutable once created; publish or transition it instead.`,
        );
      }
      throw err;
    }
  }

  async getSyllabusById(syllabusId: string): Promise<ExamSyllabus | null> {
    const doc = await this.syllabiCol.doc(syllabusId).get();
    if (!doc.exists) return null;
    return doc.data() as ExamSyllabus;
  }

  async getCurrentSyllabus(examId: string, cycleId: string): Promise<ExamSyllabus | null> {
    const snap = await this.syllabiCol
      .where('examId', '==', examId)
      .where('cycleId', '==', cycleId)
      .where('status', '==', 'CURRENT')
      .limit(1)
      .get();

    if (snap.empty) return null;
    return snap.docs[0].data() as ExamSyllabus;
  }

  async listSyllabi(examId: string, cycleId?: string): Promise<ExamSyllabus[]> {
    let query: FirebaseFirestore.Query = this.syllabiCol.where('examId', '==', examId);
    if (cycleId) {
      query = query.where('cycleId', '==', cycleId);
    }
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as ExamSyllabus);
  }

  /**
   * Transactionally publishes a syllabus version as CURRENT and supersedes previous versions
   * for that exact exam + cycle pair.
   */
  async publishSyllabusVersion(
    examId: string,
    cycleId: string,
    syllabusId: string,
    performedBy: string
  ): Promise<void> {
    const now = Date.now();

    await db.runTransaction(async (transaction) => {
      // 1. Fetch target syllabus
      const targetDocRef = this.syllabiCol.doc(syllabusId);
      const targetSnap = await transaction.get(targetDocRef);
      if (!targetSnap.exists) {
        throw new Error(`Syllabus '${syllabusId}' not found`);
      }

      const targetData = targetSnap.data() as ExamSyllabus;
      if (targetData.examId !== examId || targetData.cycleId !== cycleId) {
        throw new Error(`Syllabus '${syllabusId}' does not match exam ${examId} and cycle ${cycleId}`);
      }

      /*
       * PUBLICATION GATE.
       *
       * This transaction previously moved ANY record to CURRENT — no check on its existing status,
       * its provenance, or whether a canonical graph had ever been built. That is how production
       * came to hold a CURRENT syllabus whose sourceDocumentHash was the SHA-256 of the empty
       * string: the record simply existed, and publishing asserted it was authoritative.
       *
       * Reachability is checked first so an illegal jump (DRAFT straight to CURRENT) is reported as
       * exactly that, rather than as a pile of downstream provenance complaints.
       *
       * `graphValidated` is taken from the version's graph manifest, which syllabusGraphService
       * writes only after structural validation passes. Reading that verdict rather than
       * recomputing it keeps one definition of "this graph is valid"; an absent manifest means no
       * graph was ever published for this version, which is itself disqualifying.
       */
      const transition = canTransition(targetData.status, 'CURRENT');
      if (!transition.allowed) {
        throw new Error(
          `[Syllabus] cannot publish '${syllabusId}': ${transition.reason}. ` +
          `A version must reach VERIFIED before it can become CURRENT.`,
        );
      }

      const manifestSnap = await transaction.get(
        db.collection('exam_syllabi_graphs').doc(examId).collection('versions').doc(syllabusId),
      );
      const manifest = manifestSnap.exists ? (manifestSnap.data() as any) : null;

      const check = assertPublishable(targetData, {
        graphValidated: !!manifest?.validated,
        nodeCount: manifest?.nodeCount ?? 0,
      });
      if (!check.publishable) {
        const summary = check.errors.map((e) => `${e.field}:${e.code}`).join(', ');
        throw new Error(
          `[Syllabus] refusing to publish '${syllabusId}' — ${check.errors.length} precondition(s) ` +
          `not met: ${summary}`,
        );
      }

      // 2. Fetch all existing current syllabi for this exam + cycle
      /*
       * ALL READS MUST PRECEDE ALL WRITES.
       *
       * The master-exam pointer was previously read at step 6, AFTER the writes below, which
       * Firestore rejects outright — so this transaction could never commit against a real
       * backend. It went unnoticed because the only tests covering publication mock the repository
       * entirely, and production's syllabus was written straight to CURRENT by the seed path
       * (createSyllabus), never through here. Found by the J.2 persisted verification.
       */
      const examDocRef = this.examsCol.doc(examId);
      const examSnap = await transaction.get(examDocRef);

      const existingCurrentSnap = await transaction.get(
        this.syllabiCol
          .where('examId', '==', examId)
          .where('cycleId', '==', cycleId)
          .where('status', '==', 'CURRENT')
      );

      // 3. Mark old CURRENT versions as SUPERSEDED
      for (const doc of existingCurrentSnap.docs) {
        if (doc.id !== syllabusId) {
          transaction.update(doc.ref, {
            status: 'SUPERSEDED',
            updatedAt: now,
          });
        }
      }

      // 4. Set target syllabus to CURRENT.
      //
      // `verifiedAt` is NOT stamped here. It records when structural validation passed, which
      // happened earlier; overwriting it at publish time was what made "verified" and "published"
      // indistinguishable, so a record could look verified purely because someone published it.
      transaction.update(targetDocRef, {
        status: 'CURRENT',
        publishedAt: now,
        updatedAt: now,
      });

      // 5. Update cycle active pointer
      const cycleDocRef = this.examsCol.doc(examId).collection('cycles').doc(cycleId);
      transaction.set(cycleDocRef, { activeSyllabusVersionId: syllabusId, updatedAt: now }, { merge: true });

      // 6. Update master exam active pointer if this is the current cycle.
      // (examSnap was read above, with the other reads — see the ordering note.)
      if (examSnap.exists) {
        const examData = examSnap.data() as ExamMaster;
        if (!examData.currentCycle || examData.currentCycle === cycleId) {
          transaction.update(examDocRef, {
            activeSyllabusVersionId: syllabusId,
            currentCycle: cycleId,
            updatedAt: now,
          });
        }
      }
    });

    // 7. Audit log
    await this.logAudit({
      id: `audit_${Date.now()}_${syllabusId}`,
      eventType: 'SYLLABUS_PUBLISHED',
      examId,
      cycleId,
      entityId: syllabusId,
      performedBy,
      details: { publishedSyllabusId: syllabusId },
      timestamp: now,
    });
  }

  // ─── 5. Audit Logging ──────────────────────────────────────────────────────

  /**
   * Moves a syllabus version to a new lifecycle status.
   *
   * The transition is validated INSIDE the read-modify-write transaction against the status
   * actually on disk, not against whatever the caller last read. Checking it in the caller would
   * leave a window in which two concurrent operations both believe they are moving from VERIFIED,
   * and one of them would be wrong.
   *
   * Deliberately cannot reach CURRENT: publication has its own gate (provenance, extraction and a
   * validated graph manifest), and allowing a plain status write to bypass it would reopen exactly
   * the hole that let an unverified syllabus become authoritative.
   */
  async updateSyllabusStatus(
    syllabusId: string,
    next: Exclude<SyllabusStatus, 'CURRENT'>,
    extra: Partial<ExamSyllabus> = {},
  ): Promise<{ previousStatus: SyllabusStatus }> {
    return db.runTransaction(async (transaction) => {
      const ref = this.syllabiCol.doc(syllabusId);
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error(`Syllabus '${syllabusId}' not found`);
      const data = snap.data() as ExamSyllabus;

      const t = canTransition(data.status, next);
      if (!t.allowed) {
        throw new Error(`[Syllabus] cannot move '${syllabusId}' to ${next}: ${t.reason}`);
      }

      transaction.update(ref, { ...extra, status: next, updatedAt: Date.now() });
      return { previousStatus: data.status };
    });
  }

  /**
   * Withdraws a syllabus version from authoritative use.
   *
   * Deliberately NOT a delete and NOT an edit of provenance. The record, its hash, its URL and its
   * extracted structure all stay exactly as they were — invalidating is a statement about whether
   * we may RELY on a version, not a licence to rewrite its history. Anything that referenced it
   * keeps resolving to the same document, now visibly marked untrustworthy.
   *
   * `clearActivePointers` exists because leaving a cycle's or exam's activeSyllabusVersionId aimed
   * at an INVALID record is worse than either state alone: getCurrentSyllabus would return nothing
   * while the AI context block still announced "Active Canonical Syllabus Version: <id>" —
   * advertising as authoritative a version the system has just declared it cannot trust. The
   * caller must decide explicitly rather than inherit a default.
   */
  async invalidateSyllabus(params: {
    syllabusId: string;
    reason: SyllabusInvalidationReason;
    detail?: string;
    performedBy: string;
    clearActivePointers: boolean;
  }): Promise<{ previousStatus: SyllabusStatus; pointersCleared: string[] }> {
    const { syllabusId, reason, detail, performedBy, clearActivePointers } = params;
    const now = Date.now();

    const result = await db.runTransaction(async (transaction) => {
      const ref = this.syllabiCol.doc(syllabusId);
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error(`Syllabus '${syllabusId}' not found`);
      const data = snap.data() as ExamSyllabus;

      const transition = canTransition(data.status, 'INVALID');
      if (!transition.allowed) {
        throw new Error(`[Syllabus] cannot invalidate '${syllabusId}': ${transition.reason}`);
      }

      // Reads before writes, as Firestore requires.
      const cycleRef = this.examsCol.doc(data.examId).collection('cycles').doc(data.cycleId);
      const examRef = this.examsCol.doc(data.examId);
      const [cycleSnap, examSnap] = clearActivePointers
        ? await Promise.all([transaction.get(cycleRef), transaction.get(examRef)])
        : [null, null];

      transaction.update(ref, {
        status: 'INVALID',
        invalidatedAt: now,
        invalidationReason: reason,
        ...(detail ? { invalidationDetail: detail } : {}),
        updatedAt: now,
      });

      const pointersCleared: string[] = [];
      if (clearActivePointers) {
        if (cycleSnap?.exists && (cycleSnap.data() as any)?.activeSyllabusVersionId === syllabusId) {
          transaction.update(cycleRef, { activeSyllabusVersionId: null, updatedAt: now });
          pointersCleared.push(`cycles/${data.cycleId}`);
        }
        if (examSnap?.exists && (examSnap.data() as any)?.activeSyllabusVersionId === syllabusId) {
          transaction.update(examRef, { activeSyllabusVersionId: null, updatedAt: now });
          pointersCleared.push(`exams/${data.examId}`);
        }
      }

      return { previousStatus: data.status, pointersCleared, examId: data.examId, cycleId: data.cycleId };
    });

    await this.logAudit({
      id: `audit_${now}_invalidate_${syllabusId}`,
      eventType: 'SYLLABUS_INVALIDATED',
      examId: result.examId,
      cycleId: result.cycleId,
      entityId: syllabusId,
      performedBy,
      details: {
        reason, detail: detail ?? null,
        previousStatus: result.previousStatus,
        pointersCleared: result.pointersCleared,
      },
      timestamp: now,
    });

    return { previousStatus: result.previousStatus, pointersCleared: result.pointersCleared };
  }

  async logAudit(audit: ExamAuditRecord): Promise<void> {
    await this.auditCol.doc(audit.id).set(audit);
  }
}

export const examRepository = new ExamRepository();
