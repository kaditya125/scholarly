/**
 * ExamRepository — Firestore Data Access Layer for Exam Intelligence
 * Manages exams, cycles, verified official sources, versioned syllabi, and audit logs.
 */

import { db } from '../config/firebase';
import {
  ExamMaster,
  ExamCategory,
  ExamStatus,
  ExamCycle,
  ExamOfficialSource,
  ExamSyllabus,
  ExamAuditRecord,
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

  async createSyllabus(syllabus: ExamSyllabus): Promise<void> {
    await this.syllabiCol.doc(syllabus.syllabusId).set(syllabus);
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

      // 2. Fetch all existing current syllabi for this exam + cycle
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

      // 4. Set target syllabus to CURRENT
      transaction.update(targetDocRef, {
        status: 'CURRENT',
        verifiedAt: now,
        updatedAt: now,
      });

      // 5. Update cycle active pointer
      const cycleDocRef = this.examsCol.doc(examId).collection('cycles').doc(cycleId);
      transaction.set(cycleDocRef, { activeSyllabusVersionId: syllabusId, updatedAt: now }, { merge: true });

      // 6. Update master exam active pointer if this is the current cycle
      const examDocRef = this.examsCol.doc(examId);
      const examSnap = await transaction.get(examDocRef);
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

  async logAudit(audit: ExamAuditRecord): Promise<void> {
    await this.auditCol.doc(audit.id).set(audit);
  }
}

export const examRepository = new ExamRepository();
