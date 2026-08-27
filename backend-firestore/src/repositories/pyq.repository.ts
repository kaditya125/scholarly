/**
 * PYQRepository — Firestore Data Access Layer for Previous Year Questions
 * Manages source discovery registry, canonical questions, provenance, verification states, and audit trails.
 */

import { db } from '../config/firebase';
import {
  PYQSourceEntry,
  CanonicalPYQQuestion,
  PYQVerificationStatus,
  PYQRightsStatus,
  PYQIngestionState,
  PYQAvailabilityMatrixRow,
  PYQExamAnalytics,
  PYQCompletenessStatus,
} from '../types/pyq.types';

export class PYQRepository {
  private readonly sourcesCol = db.collection('pyq_source_registry');
  private readonly questionsCol = db.collection('pyq_questions');
  private readonly auditCol = db.collection('pyq_audit_logs');
  private readonly analyticsCol = db.collection('pyq_analytics');

  // ─── 1. Source Discovery Registry ──────────────────────────────────────────

  async registerSource(source: PYQSourceEntry): Promise<void> {
    await this.sourcesCol.doc(source.sourceId).set(source, { merge: true });
  }

  async getSourceById(sourceId: string): Promise<PYQSourceEntry | null> {
    const doc = await this.sourcesCol.doc(sourceId).get();
    if (!doc.exists) return null;
    return doc.data() as PYQSourceEntry;
  }

  async listSources(filter?: {
    examId?: string;
    year?: number;
    sourceTier?: string;
    retrievalStatus?: string;
    rightsStatus?: PYQRightsStatus;
  }): Promise<PYQSourceEntry[]> {
    let query: FirebaseFirestore.Query = this.sourcesCol;

    if (filter?.examId) {
      query = query.where('examId', '==', filter.examId);
    }
    if (filter?.year) {
      query = query.where('year', '==', filter.year);
    }
    if (filter?.sourceTier) {
      query = query.where('sourceTier', '==', filter.sourceTier);
    }
    if (filter?.retrievalStatus) {
      query = query.where('retrievalStatus', '==', filter.retrievalStatus);
    }
    if (filter?.rightsStatus) {
      query = query.where('rightsStatus', '==', filter.rightsStatus);
    }

    const snap = await query.get();
    return snap.docs.map((d) => d.data() as PYQSourceEntry);
  }

  async updateSourceStatus(
    sourceId: string,
    updates: Partial<PYQSourceEntry>
  ): Promise<void> {
    await this.sourcesCol.doc(sourceId).set(
      {
        ...updates,
        lastCheckedAt: Date.now(),
      },
      { merge: true }
    );
  }

  // ─── 2. Canonical Question Bank Operations ─────────────────────────────────

  async saveCanonicalQuestion(question: CanonicalPYQQuestion): Promise<void> {
    await this.questionsCol.doc(question.questionId).set(question, { merge: true });
  }

  async saveCanonicalQuestionsBatch(questions: CanonicalPYQQuestion[]): Promise<void> {
    const BATCH_SIZE = 450;
    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = questions.slice(i, i + BATCH_SIZE);
      for (const q of chunk) {
        const ref = this.questionsCol.doc(q.questionId);
        batch.set(ref, q, { merge: true });
      }
      await batch.commit();
    }
  }

  async getQuestionById(questionId: string): Promise<CanonicalPYQQuestion | null> {
    const doc = await this.questionsCol.doc(questionId).get();
    if (!doc.exists) return null;
    return doc.data() as CanonicalPYQQuestion;
  }

  async findQuestionByHash(contentHash: string): Promise<CanonicalPYQQuestion | null> {
    const snap = await this.questionsCol.where('contentHash', '==', contentHash).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as CanonicalPYQQuestion;
  }

  async listQuestions(filter: {
    examId?: string;
    year?: number;
    session?: string;
    shift?: string;
    subject?: string;
    topic?: string;
    verificationStatus?: PYQVerificationStatus;
    rightsStatus?: PYQRightsStatus;
    ingestionState?: PYQIngestionState;
    vectorIndexed?: boolean;
    limit?: number;
  }): Promise<CanonicalPYQQuestion[]> {
    let query: FirebaseFirestore.Query = this.questionsCol;

    if (filter.examId) {
      query = query.where('examId', '==', filter.examId);
    }
    if (filter.year) {
      query = query.where('year', '==', filter.year);
    }
    if (filter.session) {
      query = query.where('session', '==', filter.session);
    }
    if (filter.shift) {
      query = query.where('shift', '==', filter.shift);
    }
    if (filter.subject) {
      query = query.where('subject', '==', filter.subject);
    }
    if (filter.topic) {
      query = query.where('topic', '==', filter.topic);
    }
    if (filter.verificationStatus) {
      query = query.where('verificationStatus', '==', filter.verificationStatus);
    }
    if (filter.rightsStatus) {
      query = query.where('rightsStatus', '==', filter.rightsStatus);
    }
    if (filter.ingestionState) {
      query = query.where('ingestionState', '==', filter.ingestionState);
    }
    if (filter.vectorIndexed !== undefined) {
      query = query.where('vectorIndexed', '==', filter.vectorIndexed);
    }

    const limit = filter.limit || 100;
    const snap = await query.limit(limit).get();
    return snap.docs.map((d) => d.data() as CanonicalPYQQuestion);
  }

  async countQuestions(filter: {
    examId?: string;
    year?: number;
    verificationStatus?: PYQVerificationStatus;
    rightsStatus?: PYQRightsStatus;
    vectorIndexed?: boolean;
  }): Promise<number> {
    let query: FirebaseFirestore.Query = this.questionsCol;
    if (filter.examId) query = query.where('examId', '==', filter.examId);
    if (filter.year) query = query.where('year', '==', filter.year);
    if (filter.verificationStatus) query = query.where('verificationStatus', '==', filter.verificationStatus);
    if (filter.rightsStatus) query = query.where('rightsStatus', '==', filter.rightsStatus);
    if (filter.vectorIndexed !== undefined) query = query.where('vectorIndexed', '==', filter.vectorIndexed);

    const aggregateSnap = await query.count().get();
    return aggregateSnap.data().count;
  }

  // ─── 3. Availability Matrix Aggregation ────────────────────────────────────

  async generateAvailabilityMatrix(examId?: string): Promise<PYQAvailabilityMatrixRow[]> {
    const sources = await this.listSources(examId ? { examId } : undefined);
    const questions = await this.listQuestions(examId ? { examId, limit: 5000 } : { limit: 10000 });

    // Helper function to match question to source entry
    const doesQuestionMatchSource = (q: CanonicalPYQQuestion, src: PYQSourceEntry): boolean => {
      if (q.examId !== src.examId) return false;
      if (q.year !== src.year) return false;
      if (q.sourceId && q.sourceId === src.sourceId) return true;

      // Paper match
      if (src.paper) {
        const srcP = src.paper.toLowerCase();
        const qP = (q.paper || '').toLowerCase();
        if (srcP.includes('paper 1') && !qP.includes('paper 1') && !qP.includes('gs')) return false;
        if (srcP.includes('paper 2') && !qP.includes('paper 2') && !qP.includes('csat')) return false;
        if (srcP.includes('csat') && !qP.includes('csat') && !qP.includes('paper 2')) return false;
      }

      // Session match
      if (src.session) {
        const srcS = src.session.toLowerCase();
        const qS = (q.session || '').toLowerCase();
        if (srcS.includes('session 1') && !qS.includes('session 1') && !qS.includes('jan')) return false;
        if (srcS.includes('session 2') && !qS.includes('session 2') && !qS.includes('apr')) return false;
        if (srcS.includes('mains') && !qS.includes('mains')) return false;
        if (srcS.includes('prelims') && !qS.includes('prelims')) return false;
      }

      // Shift match
      if (src.shift && q.shift) {
        if (src.shift !== q.shift) return false;
      }

      return true;
    };

    const rows: PYQAvailabilityMatrixRow[] = [];

    for (const src of sources) {
      const matchedQuestions = questions.filter((q) => doesQuestionMatchSource(q, src));
      const extractedCount = matchedQuestions.length;
      const verifiedCount = matchedQuestions.filter(
        (q) => q.verificationStatus === 'OFFICIAL_CONFIRMED' || q.verificationStatus === 'MULTI_SOURCE_CONFIRMED'
      ).length;
      const rightsApprovedCount = matchedQuestions.filter(
        (q) => q.ingestionState === 'RIGHTS_APPROVED' || q.ingestionState === 'INDEXED' || q.rightsStatus === 'OFFICIAL_SOURCE_REVIEWED' || q.rightsStatus === 'PUBLIC_DOMAIN_OR_CLEAR'
      ).length;
      const readyForIndexCount = matchedQuestions.filter(
        (q) => (q.ingestionState === 'RIGHTS_APPROVED' || q.ingestionState === 'READY_FOR_INDEX') && !q.vectorIndexed
      ).length;
      const indexedCount = matchedQuestions.filter((q) => q.vectorIndexed || q.ingestionState === 'INDEXED').length;
      let expectedCount = src.questionCountDiscovered || 0;
      let expectedCountSource = src.sourceName;
      let expectedCountConfidence: 'OFFICIAL_NOTIFICATION' | 'OFFICIAL_PAPER' | 'REPUTABLE_SECONDARY' | 'ESTIMATED' | 'UNKNOWN' = 'OFFICIAL_PAPER';

      if (!expectedCount) {
        if (src.examId === 'JEE_ADVANCED') {
          expectedCount = 54;
          expectedCountSource = 'IIT JAB Official Exam Structure (18 Phy + 18 Chem + 18 Math)';
          expectedCountConfidence = 'OFFICIAL_NOTIFICATION';
        } else if (src.examId === 'JEE_MAIN') {
          expectedCount = 75;
          expectedCountSource = 'NTA Official Exam Scheme (25 Phy + 25 Chem + 25 Math per shift)';
          expectedCountConfidence = 'OFFICIAL_NOTIFICATION';
        } else if (src.examId === 'NEET_UG') {
          expectedCount = 200;
          expectedCountSource = 'NTA NEET UG Official Pattern (50 Phy + 50 Chem + 100 Bio)';
          expectedCountConfidence = 'OFFICIAL_NOTIFICATION';
        } else if (src.examId === 'SSC_CGL') {
          expectedCount = 100;
          expectedCountSource = 'SSC Official Notice Scheme of Examination (25 Quant + 25 Reas + 25 Eng + 25 GA)';
          expectedCountConfidence = 'OFFICIAL_NOTIFICATION';
        } else if (src.examId === 'UPSC_CSE') {
          const isCsat = src.paper?.includes('CSAT') || src.paper?.includes('Paper 2');
          expectedCount = isCsat ? 80 : 100;
          expectedCountSource = isCsat ? 'UPSC Civil Services Examination Rules (CSAT Paper 2: 80 Qs)' : 'UPSC Civil Services Examination Rules (GS Paper 1: 100 Qs)';
          expectedCountConfidence = 'OFFICIAL_NOTIFICATION';
        } else if (src.examId === 'RRB_NTPC') {
          expectedCount = 100;
          expectedCountSource = 'Railway Recruitment Boards CEN 01/2019 CBT 1 Pattern (30 Math + 30 Reas + 40 GA)';
          expectedCountConfidence = 'OFFICIAL_NOTIFICATION';
        } else if (src.examId === 'IBPS_PO') {
          const isMains = src.session?.toLowerCase().includes('mains') || src.paper?.toLowerCase().includes('mains');
          expectedCount = isMains ? 155 : 100;
          expectedCountSource = isMains ? 'IBPS PO Official Notification (Mains: 155 Qs)' : 'IBPS PO Official Notification (Prelims: 100 Qs)';
          expectedCountConfidence = 'OFFICIAL_NOTIFICATION';
        } else {
          expectedCount = 100;
          expectedCountSource = 'Standard Exam Pattern';
          expectedCountConfidence = 'ESTIMATED';
        }
      }

      const missingCount = Math.max(0, expectedCount - extractedCount);
      const coveragePercentage = expectedCount > 0 ? Math.round((extractedCount / expectedCount) * 1000) / 10 : null;

      const retrievalTestedCount = matchedQuestions.filter((q) => q.retrievalTested).length;
      const retrievalVerifiedCount = matchedQuestions.filter((q) => q.retrievalTested).length;

      let status: PYQCompletenessStatus = 'DISCOVERED_ONLY';
      if (src.rightsStatus === 'DO_NOT_REDISTRIBUTE' || src.rightsStatus === 'PERMISSION_REQUIRED') {
        status = 'RIGHTS_RESTRICTED';
      } else if (extractedCount === 0) {
        status = 'DISCOVERED_ONLY';
      } else if (verifiedCount < extractedCount) {
        status = 'VERIFICATION_PENDING';
      } else if (indexedCount < verifiedCount) {
        status = 'INDEXING_PENDING';
      } else if (retrievalVerifiedCount < indexedCount) {
        status = 'RETRIEVAL_PENDING';
      } else if (extractedCount >= expectedCount) {
        status = 'COMPLETE';
      } else {
        status = 'PARTIAL';
      }

      rows.push({
        examId: src.examId,
        examName: src.examName,
        year: src.year,
        session: src.session,
        paper: src.paper,
        shift: src.shift,
        subject: src.subject,
        officialAvailable: src.sourceTier === 'TIER_A_OFFICIAL',
        officialSource: src.sourceTier === 'TIER_A_OFFICIAL' ? src.sourceName : undefined,
        secondaryFallback: src.sourceTier !== 'TIER_A_OFFICIAL' ? src.sourceName : undefined,
        expectedCount,
        expectedCountSource,
        expectedCountConfidence,
        discoveredCount: src.questionCountDiscovered || matchedQuestions.length || 0,
        extractedCount,
        verifiedCount,
        rightsApprovedCount,
        readyForIndexCount,
        indexedCount,
        retrievalTestedCount,
        retrievalVerifiedCount,
        missingCount,
        coveragePercentage,
        totalQuestions: matchedQuestions.length || src.questionCountDiscovered || 0,
        verifiedQuestions: verifiedCount,
        pendingVerification: extractedCount - verifiedCount,
        hasAnswerKey: src.hasAnswerKey,
        hasSolutions: src.hasSolutions,
        rightsStatus: src.rightsStatus,
        status,
      });
    }

    return rows.sort((a, b) => (a.examId !== b.examId ? a.examId.localeCompare(b.examId) : b.year - a.year));
  }

  // ─── 4. Analytics ──────────────────────────────────────────────────────────

  async saveExamAnalytics(analytics: PYQExamAnalytics): Promise<void> {
    await this.analyticsCol.doc(analytics.examId).set(analytics, { merge: true });
  }

  async getExamAnalytics(examId: string): Promise<PYQExamAnalytics | null> {
    const doc = await this.analyticsCol.doc(examId).get();
    if (!doc.exists) return null;
    return doc.data() as PYQExamAnalytics;
  }

  // ─── 5. Audit Logging ──────────────────────────────────────────────────────

  async logAudit(event: {
    eventType: string;
    examId: string;
    entityId: string;
    performedBy: string;
    details: Record<string, any>;
  }): Promise<void> {
    const id = `audit_pyq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.auditCol.doc(id).set({
      id,
      ...event,
      timestamp: Date.now(),
    });
  }
}

export const pyqRepository = new PYQRepository();
