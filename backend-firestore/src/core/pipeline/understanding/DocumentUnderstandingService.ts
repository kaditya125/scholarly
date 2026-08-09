/**
 * DocumentUnderstandingService
 * Phase 2D: Document Understanding Orchestrator
 *
 * Transforms extracted blocks into meaningful educational structure:
 *   ExtractedDocumentResult
 *         ↓
 *   DocumentStructureAnalyzer (offline, deterministic)
 *         ↓
 *   EducationalMetadataExtractor (Gemini AI + heuristic fallback)
 *         ↓
 *   UserMetadataOverrideGuard (user values always win)
 *         ↓
 *   DocumentUnderstandingResult (persisted to Firestore)
 *
 * Integrates with existing Firebase/Firestore infrastructure.
 * Never creates a second DB or storage client.
 */

import { DocumentStructureAnalyzer } from './DocumentStructureAnalyzer';
import { EducationalMetadataExtractor, MetadataExtractionOptions } from './EducationalMetadataExtractor';
import { UserMetadataOverrideGuard } from './UserMetadataOverrideGuard';
import { MetadataCategoryRegistry, defaultMetadataCategoryRegistry } from './MetadataCategoryRegistry';
import {
  ExtractedDocumentResult,
  DocumentUnderstandingResult,
  DocumentStructureType,
  UserMetadataOverrides,
  EducationalMetadata,
} from '../types';
import { db } from '../../../config/firebase';

export interface DocumentUnderstandingOptions extends MetadataExtractionOptions {
  userOverrides?: UserMetadataOverrides;
  previousMetadata?: EducationalMetadata;
}

export class DocumentUnderstandingService {
  private structureAnalyzer: DocumentStructureAnalyzer;
  private metadataExtractor: EducationalMetadataExtractor;
  private overrideGuard: UserMetadataOverrideGuard;
  private registry: MetadataCategoryRegistry;

  constructor(
    structureAnalyzer?: DocumentStructureAnalyzer,
    metadataExtractor?: EducationalMetadataExtractor,
    overrideGuard?: UserMetadataOverrideGuard,
    registry: MetadataCategoryRegistry = defaultMetadataCategoryRegistry
  ) {
    this.structureAnalyzer = structureAnalyzer || new DocumentStructureAnalyzer();
    this.metadataExtractor = metadataExtractor || new EducationalMetadataExtractor(undefined, registry);
    this.overrideGuard = overrideGuard || new UserMetadataOverrideGuard();
    this.registry = registry;
  }

  /**
   * Runs full document understanding on an ExtractedDocumentResult.
   */
  async understand(
    extractionResult: ExtractedDocumentResult,
    opts: DocumentUnderstandingOptions = {}
  ): Promise<DocumentUnderstandingResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // 1. Structural analysis (offline, deterministic)
    const { structuredBlocks, documentOutline } = this.structureAnalyzer.analyze(
      extractionResult.blocks
    );

    // 2. Educational metadata extraction (Gemini AI)
    let aiMetadata: EducationalMetadata = {};
    try {
      aiMetadata = await this.metadataExtractor.extract(
        extractionResult.rawText,
        extractionResult.documentId,
        {
          maxSampleChars: opts.maxSampleChars,
          traceId: opts.traceId,
        }
      );
    } catch (err: any) {
      warnings.push(`Metadata extraction failed: ${err.message}. Heuristic fallback used.`);
    }

    // 3. Protect existing user overrides if reprocessing (previousMetadata provided)
    let mergedMetadata = aiMetadata;
    let overriddenFields: string[] = [];

    if (opts.previousMetadata) {
      const protected_ = this.overrideGuard.protect(opts.previousMetadata, aiMetadata);
      mergedMetadata = protected_.resolved;
      overriddenFields = protected_.protectedFields;
    }

    // 4. Apply new user overrides (if provided in this run)
    if (opts.userOverrides && Object.keys(opts.userOverrides).length > 0) {
      const { resolved, overriddenFields: newOverrides } = this.overrideGuard.merge(
        mergedMetadata,
        opts.userOverrides
      );
      mergedMetadata = resolved;
      overriddenFields = [...new Set([...overriddenFields, ...newOverrides])];
    }

    // 5. Compute summary statistics
    const typeDistribution = this.computeTypeDistribution(structuredBlocks.map(b => b.structureType));
    const metadataValues = Object.values(aiMetadata);
    const averageMetadataConfidence =
      metadataValues.length > 0
        ? Number((metadataValues.reduce((sum, v) => sum + v.confidence, 0) / metadataValues.length).toFixed(2))
        : 0;

    const result: DocumentUnderstandingResult = {
      documentId: extractionResult.documentId,
      documentVersionId: extractionResult.documentVersionId,
      structuredBlocks,
      documentOutline,
      educationalMetadata: aiMetadata,
      resolvedMetadata: mergedMetadata,
      stats: {
        totalStructuredBlocks: structuredBlocks.length,
        structureTypeDistribution: typeDistribution,
        metadataFieldsExtracted: Object.keys(aiMetadata).length,
        averageMetadataConfidence,
        userOverriddenFields: overriddenFields,
      },
      durationMs: Date.now() - startTime,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    return result;
  }

  /**
   * Runs understanding and persists result to Firestore.
   */
  async processAndPersist(
    userId: string,
    collectionId: string,
    sourceId: string,
    extractionResult: ExtractedDocumentResult,
    opts: DocumentUnderstandingOptions = {}
  ): Promise<DocumentUnderstandingResult> {
    // Load existing user overrides from Firestore if not provided
    if (!opts.userOverrides && !opts.previousMetadata) {
      const understandingRef = db
        .collection('notebooks')
        .doc(collectionId)
        .collection('sources')
        .doc(sourceId)
        .collection('understanding')
        .doc('latest');

      const existing = await understandingRef.get();
      if (existing.exists) {
        const existingData = existing.data()!;
        opts.previousMetadata = existingData.resolvedMetadata || {};
      }
    }

    const result = await this.understand(extractionResult, opts);

    // Persist to Firestore
    const understandingRef = db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(sourceId)
      .collection('understanding')
      .doc('latest');

    await understandingRef.set({
      ...result,
      understoodAt: new Date().toISOString(),
    });

    // Update source-level metadata for quick access
    const sourceRef = db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(sourceId);

    await sourceRef.update({
      educationalMetadata: result.resolvedMetadata,
      documentTitle: result.documentOutline.title,
      currentStage: 'METADATA',
      updatedAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Applies a user override to an already-understood document and re-persists.
   * Never touches AI metadata for non-overridden fields.
   */
  async applyUserOverride(
    collectionId: string,
    sourceId: string,
    userOverrides: UserMetadataOverrides
  ): Promise<void> {
    const understandingRef = db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(sourceId)
      .collection('understanding')
      .doc('latest');

    const existing = await understandingRef.get();
    if (!existing.exists) return;

    const existingData = existing.data()!;
    const currentResolved: EducationalMetadata = existingData.resolvedMetadata || {};

    const { resolved, overriddenFields } = this.overrideGuard.merge(currentResolved, userOverrides);

    await understandingRef.update({
      resolvedMetadata: resolved,
      'stats.userOverriddenFields': [
        ...(existingData.stats?.userOverriddenFields || []),
        ...overriddenFields,
      ].filter((v, i, a) => a.indexOf(v) === i),
      updatedAt: new Date().toISOString(),
    });
  }

  private computeTypeDistribution(
    types: DocumentStructureType[]
  ): Record<DocumentStructureType, number> {
    const dist: Partial<Record<DocumentStructureType, number>> = {};
    for (const t of types) {
      dist[t] = (dist[t] || 0) + 1;
    }
    return dist as Record<DocumentStructureType, number>;
  }
}
