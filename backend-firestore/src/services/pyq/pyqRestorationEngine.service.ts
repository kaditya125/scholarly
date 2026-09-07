import { CanonicalPYQQuestion, PYQRestorationState, PYQQuarantineReason } from '../../types/pyq.types';
import { logger } from '../../utils/logger';

export interface RestorationEvaluation {
  questionId: string;
  examId: string;
  year: number;
  paper?: string;
  shift?: string;
  restorationState: PYQRestorationState;
  isEligibleForActive: boolean;
  isEligibleForPinecone: boolean;
  quarantineReason?: PYQQuarantineReason;
  evidenceNotes: string[];
  recommendedAction: 'RESTORE_TO_ACTIVE' | 'KEEP_QUARANTINED';
}

export class PYQRestorationEngine {
  /**
   * Pattern detection for synthetic/constructed URLs
   */
  private readonly CONSTRUCTED_URL_PATTERNS = [
    /exams\.nta\.ac\.in\/NEET\/archive\/neet_ug_\d+_[a-z0-9]+\.pdf/i,
    /ssc\.nic\.in\/Portal\/QuestionPapers\/\d+_\d+_\d+\.pdf/i,
    /ssc\.gov\.in\/notices\/cgl_\d+_tier1_[a-z0-9_]+\.pdf/i,
    /upsc\.gov\.in\/examinations\/previous-question-papers\/\d+\/upsc_cse_\d+_[a-z0-9_]+\.pdf/i,
    /upsc\.gov\.in\/examinations\/CSP_\d+_[a-z0-9_]+\.pdf/i,
    /bpsc\.bih\.nic\.in\/Advt\/bpsc_cce_\d+_[a-z0-9_]+\.pdf/i,
    /bpsc\.bihar\.gov\.in\/archive\/bpsc_[a-z0-9_]+_final_key\.pdf/i,
    /ibps\.in\/archive\/ibps_po_\d+_[a-z0-9_]+\.pdf/i,
    /rrbcdg\.gov\.in\/archive\/rrb_ntpc_\d+_[a-z0-9_]+\.pdf/i,
  ];

  /**
   * Evaluates a single quarantined question against the strict restoration criteria.
   */
  public evaluate(q: CanonicalPYQQuestion, context?: {
    isMultiPaperReplay?: boolean;
    replayOccurrencesCount?: number;
    hasAuthenticArtifactFile?: boolean;
    artifactChecksum?: string;
  }): RestorationEvaluation {
    const evidenceNotes: string[] = [];

    // 1. Check if the question is backed by an authentic, verified local artifact file
    if (context?.hasAuthenticArtifactFile && context?.artifactChecksum) {
      evidenceNotes.push(`Verified against authentic artifact with checksum ${context.artifactChecksum.slice(0, 12)}...`);
      return {
        questionId: q.questionId,
        examId: q.examId,
        year: q.year,
        paper: q.paper,
        shift: q.shift,
        restorationState: 'VERIFIED_AUTHENTIC',
        isEligibleForActive: true,
        isEligibleForPinecone: true,
        evidenceNotes,
        recommendedAction: 'RESTORE_TO_ACTIVE',
      };
    }

    // 1b. Check for explicit Answer Conflict (Bonus/Dropped/Discrepancy)
    if (q.answerConflict && q.answerConflict.resolutionStatus === 'UNRESOLVED') {
      evidenceNotes.push(`Material answer conflict detected: ${q.answerConflict.notes || 'Discrepancy with official key'}`);
      return {
        questionId: q.questionId,
        examId: q.examId,
        year: q.year,
        paper: q.paper,
        shift: q.shift,
        restorationState: 'CONFLICTING',
        isEligibleForActive: false,
        isEligibleForPinecone: false,
        quarantineReason: 'INVALID_PROVENANCE',
        evidenceNotes,
        recommendedAction: 'KEEP_QUARANTINED',
      };
    }

    // 2. Check for Template Generated / Modulo Replay
    if (q.origin === 'template' || q.quarantineReason === 'TEMPLATE_GENERATED') {
      evidenceNotes.push('Generated from parameter/blueprint template generator.');
      if (context?.isMultiPaperReplay) {
        evidenceNotes.push(`Replayed across ${context.replayOccurrencesCount || 'multiple'} papers/shifts without distinct paper artifacts.`);
      }
      return {
        questionId: q.questionId,
        examId: q.examId,
        year: q.year,
        paper: q.paper,
        shift: q.shift,
        restorationState: 'SYNTHETIC_TEMPLATE',
        isEligibleForActive: false,
        isEligibleForPinecone: false,
        quarantineReason: 'TEMPLATE_GENERATED',
        evidenceNotes,
        recommendedAction: 'KEEP_QUARANTINED',
      };
    }

    // 3. Check for Constructed / Fabricated Official URLs
    const isConstructed = this.CONSTRUCTED_URL_PATTERNS.some((re) => re.test(q.sourceUrl || ''));
    if (isConstructed) {
      evidenceNotes.push(`Cites constructed/synthetic URL: ${q.sourceUrl}`);
      return {
        questionId: q.questionId,
        examId: q.examId,
        year: q.year,
        paper: q.paper,
        shift: q.shift,
        restorationState: 'UNVERIFIED',
        isEligibleForActive: false,
        isEligibleForPinecone: false,
        quarantineReason: 'UNVERIFIED_OFFICIAL_SOURCE',
        evidenceNotes,
        recommendedAction: 'KEEP_QUARANTINED',
      };
    }

    // 4. Check for unverified seeds (JEE Advanced, RRB NTPC, IBPS PO without local artifact)
    if (q.quarantineReason === 'UNVERIFIED_OFFICIAL_SOURCE') {
      evidenceNotes.push('Curated seed lacks verifiable cryptographic document artifact or verified answer key hash.');
      return {
        questionId: q.questionId,
        examId: q.examId,
        year: q.year,
        paper: q.paper,
        shift: q.shift,
        restorationState: 'UNVERIFIED',
        isEligibleForActive: false,
        isEligibleForPinecone: false,
        quarantineReason: 'UNVERIFIED_OFFICIAL_SOURCE',
        evidenceNotes,
        recommendedAction: 'KEEP_QUARANTINED',
      };
    }

    // 5. Unknown origin
    if (q.examId === 'UNKNOWN_EXAM' || q.quarantineReason === 'UNKNOWN_ORIGIN') {
      evidenceNotes.push('Orphaned record with unknown exam and incomplete fields.');
      return {
        questionId: q.questionId,
        examId: q.examId,
        year: q.year,
        paper: q.paper,
        shift: q.shift,
        restorationState: 'UNVERIFIED',
        isEligibleForActive: false,
        isEligibleForPinecone: false,
        quarantineReason: 'UNKNOWN_ORIGIN',
        evidenceNotes,
        recommendedAction: 'KEEP_QUARANTINED',
      };
    }

    // Default: Conservative quarantine
    evidenceNotes.push('Conservative default: Provenance not conclusively verified.');
    return {
      questionId: q.questionId,
      examId: q.examId,
      year: q.year,
      paper: q.paper,
      shift: q.shift,
      restorationState: 'UNVERIFIED',
      isEligibleForActive: false,
      isEligibleForPinecone: false,
      quarantineReason: 'UNVERIFIED_OFFICIAL_SOURCE',
      evidenceNotes,
      recommendedAction: 'KEEP_QUARANTINED',
    };
  }
}

export const pyqRestorationEngine = new PYQRestorationEngine();
