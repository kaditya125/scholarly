/**
 * PYQCorpusIngestionService — End-to-End Production PYQ Ingestion Orchestrator
 *
 * Coordinates:
 * 1. Multi-tier source discovery
 * 2. High-precision extraction with LaTeX normalization
 * 3. Taxonomy normalization and syllabus graph linking
 * 4. Cross-source answer reconciliation
 * 5. Deduplication and provenance aggregation
 * 6. Rights & licensing review gate
 * 7. Safe, resumable vector indexing respecting _embedding-guard
 * 8. Real-time availability matrix and analytics updates
 */

import { pyqRepository } from '../../repositories/pyq.repository';
import { pyqSourceDiscoveryService } from './pyqSourceDiscovery.service';
import { pyqExtractorService } from './pyqExtractor.service';
import { pyqTaxonomyNormalizer } from './pyqTaxonomyNormalizer.service';
import { pyqVerificationEngine } from './pyqVerificationEngine.service';
import { pyqDeduplicationEngine } from './pyqDeduplicationEngine.service';
import { pyqRightsGovernanceService } from './pyqRightsGovernance.service';
import { pyqVectorIngestionService } from './pyqVectorIngestion.service';
import { pyqAnalyticsService } from './pyqAnalytics.service';
import { CanonicalPYQQuestion } from '../../types/pyq.types';
import { readLock } from '../../../scripts/phase4a/_embedding-guard';
import { logger } from '../../utils/logger';

export interface BatchIngestionResult {
  examId: string;
  yearsCovered: number[];
  sourcesDiscovered: number;
  extractedCount: number;
  deduplicatedCount: number;
  verifiedCount: number;
  rightsApprovedCount: number;
  indexedCount: number;
  skippedIndexDueToLock: boolean;
  quarantinedCount: number;
  conflictsDetected: number;
  durationMs: number;
  provenanceBreakdown: {
    officialTierA: number;
    secondaryTierB: number;
    tertiaryTierC: number;
  };
}

export class PYQCorpusIngestionService {
  /**
   * Ingests a complete paper/set of questions for an exam batch.
   */
  async ingestExamCorpus(
    examId: string,
    questionsToIngest: CanonicalPYQQuestion[],
    options: {
      forceVectorIndex?: boolean;
      pacingMs?: number;
    } = {}
  ): Promise<BatchIngestionResult> {
    const startTime = Date.now();
    logger.info(`[PYQCorpusIngestion] Starting ingestion for ${examId} with ${questionsToIngest.length} questions`);

    // 1. Source Discovery check
    const discovery = await pyqSourceDiscoveryService.discoverExamPYQSources(examId);

    // 2. Taxonomy Normalization & Syllabus linking
    await pyqTaxonomyNormalizer.normalizeQuestionsBatch(questionsToIngest);

    // 3. Answer Verification
    let conflictsDetected = 0;
    for (const q of questionsToIngest) {
      const ver = pyqVerificationEngine.verifyQuestion(q);
      if (ver.hasConflict) conflictsDetected++;
    }

    // 4. Deduplication & Provenance Merging
    const deduped = pyqDeduplicationEngine.deduplicateQuestions(questionsToIngest);

    // 5. Rights Review Gate
    const rightsResult = pyqRightsGovernanceService.applyRightsApproval(deduped, 'production_ingestion_engine');

    // 6. Persist to Firestore DAL
    await pyqRepository.saveCanonicalQuestionsBatch(rightsResult.processedQuestions);

    // Provenance breakdown
    let officialTierA = 0;
    let secondaryTierB = 0;
    let tertiaryTierC = 0;

    for (const q of rightsResult.processedQuestions) {
      for (const prov of q.provenanceRecords) {
        if (prov.sourceTier === 'TIER_A_OFFICIAL') officialTierA++;
        else if (prov.sourceTier === 'TIER_B_REPUTABLE_PLATFORM') secondaryTierB++;
        else tertiaryTierC++;
      }
    }

    // 7. Vector Indexing with Embedding Guard Protection
    const lock = readLock();
    let indexedCount = 0;
    let skippedIndexDueToLock = false;

    if (lock && !options.forceVectorIndex) {
      logger.warn(
        `[PYQCorpusIngestion] Active background indexer running (PID: ${lock.pid}, "${lock.label}"). Deferring vector embeddings to avoid 429 quota conflict. Questions marked as RIGHTS_APPROVED in Firestore.`
      );
      skippedIndexDueToLock = true;
    } else {
      try {
        const indexRes = await pyqVectorIngestionService.indexQuestions(rightsResult.processedQuestions, {
          bypassIndexerLock: options.forceVectorIndex,
          pacingMs: options.pacingMs ?? 4000,
        });
        indexedCount = indexRes.indexedCount;
      } catch (err: any) {
        logger.error(`[PYQCorpusIngestion] Vector indexing deferred/failed: ${err?.message}`);
        skippedIndexDueToLock = true;
      }
    }

    // 8. Refresh Analytics
    await pyqAnalyticsService.computeExamAnalytics(examId);

    const yearsCovered = Array.from(new Set(questionsToIngest.map((q) => q.year))).sort((a, b) => a - b);
    const durationMs = Date.now() - startTime;

    // Audit Log
    await pyqRepository.logAudit({
      eventType: 'PYQ_CORPUS_INGESTED',
      examId,
      entityId: examId,
      performedBy: 'pyq_corpus_ingestion_service',
      details: {
        yearsCovered,
        totalQuestions: rightsResult.processedQuestions.length,
        verified: rightsResult.approvedCount,
        quarantined: rightsResult.quarantinedCount,
        indexed: indexedCount,
        skippedIndexDueToLock,
        durationMs,
      },
    });

    return {
      examId,
      yearsCovered,
      sourcesDiscovered: discovery.discoveredSources.length,
      extractedCount: questionsToIngest.length,
      deduplicatedCount: deduped.length,
      verifiedCount: rightsResult.processedQuestions.filter((q) => q.verificationStatus !== 'UNVERIFIED').length,
      rightsApprovedCount: rightsResult.approvedCount,
      indexedCount,
      skippedIndexDueToLock,
      quarantinedCount: rightsResult.quarantinedCount,
      conflictsDetected,
      durationMs,
      provenanceBreakdown: {
        officialTierA,
        secondaryTierB,
        tertiaryTierC,
      },
    };
  }
}

export const pyqCorpusIngestionService = new PYQCorpusIngestionService();
