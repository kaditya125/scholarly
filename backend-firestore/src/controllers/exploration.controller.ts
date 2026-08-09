/**
 * ExplorationController
 * Phase 7: Content Exploration Controller
 *
 * Exposes endpoints for hybrid search, document AST structure, chunk inspection,
 * Knowledge Graph visualization, and deterministic 4-stage source lineage navigation.
 */

import { Request, Response } from 'express';
import { contentExplorationService } from '../core/pipeline/exploration/ContentExplorationService';
import { ContentQualityValidationService } from '../core/pipeline/validation/ContentQualityValidationService';
import { contentLineageService } from '../core/pipeline/lineage/ContentLineageService';

export class ExplorationController {
  /**
   * Search across collections or within a specific collection.
   * Supports semantic, keyword, and hybrid search modes with metadata filters.
   * POST /api/v1/notebooks/:id/exploration/search OR POST /api/v1/exploration/search
   */
  search = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid || (req as any).user?.id || 'anonymous';
      const collectionId = req.params.id || req.body.collectionId;
      const { query, filter = {}, options = {} } = req.body;

      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'Search query string is required' });
      }

      if (collectionId && collectionId !== 'ALL') {
        filter.collectionId = collectionId;
      }

      const results = await contentExplorationService.search(userId, query, filter, options);
      return res.status(200).json({
        query,
        count: results.length,
        results,
      });
    } catch (err: any) {
      const status = err.message?.includes('denied') || err.message?.includes('Authentication') ? 403 : 500;
      return res.status(status).json({ error: err.message || 'Search failed' });
    }
  };

  /**
   * Get all semantic chunks for a document.
   * GET /api/v1/notebooks/:id/sources/:sourceId/chunks
   */
  getDocumentChunks = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid || (req as any).user?.id || 'anonymous';
      const { id: collectionId, sourceId } = req.params;

      const chunks = await contentExplorationService.getDocumentChunks(userId, collectionId, sourceId);
      return res.status(200).json({
        documentId: sourceId,
        collectionId,
        count: chunks.length,
        chunks,
      });
    } catch (err: any) {
      const status = err.message?.includes('denied') || err.message?.includes('Authentication') ? 403 : 500;
      return res.status(status).json({ error: err.message || 'Failed to fetch document chunks' });
    }
  };

  /**
   * Get hierarchical AST outline structure tree for a document.
   * GET /api/v1/notebooks/:id/sources/:sourceId/structure
   */
  getDocumentStructure = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid || (req as any).user?.id || 'anonymous';
      const { id: collectionId, sourceId } = req.params;

      const structure = await contentExplorationService.getDocumentStructure(userId, collectionId, sourceId);
      return res.status(200).json({
        documentId: sourceId,
        collectionId,
        structure,
      });
    } catch (err: any) {
      const status = err.message?.includes('denied') || err.message?.includes('Authentication') ? 403 : 500;
      return res.status(status).json({ error: err.message || 'Failed to fetch document structure' });
    }
  };

  /**
   * Get document-scoped Knowledge Graph concepts and relationships.
   * GET /api/v1/notebooks/:id/sources/:sourceId/graph
   */
  getDocumentGraph = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid || (req as any).user?.id || 'anonymous';
      const { id: collectionId, sourceId } = req.params;

      const graph = await contentExplorationService.getDocumentGraph(userId, collectionId, sourceId);
      return res.status(200).json({
        documentId: sourceId,
        collectionId,
        nodes: graph.nodes,
        edges: graph.edges,
        nodesCount: graph.nodes.length,
        edgesCount: graph.edges.length,
      });
    } catch (err: any) {
      const status = err.message?.includes('denied') || err.message?.includes('Authentication') ? 403 : 500;
      return res.status(status).json({ error: err.message || 'Failed to fetch document graph' });
    }
  };

  /**
   * Get full 4-level deterministic lineage for a chunk:
   * Search Result -> Chunk -> Page -> Document
   * GET /api/v1/notebooks/:id/sources/:sourceId/lineage/:chunkId
   */
  getDocumentLineage = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid || (req as any).user?.id || 'anonymous';
      const { id: collectionId, sourceId, chunkId } = req.params;

      const lineage = await contentExplorationService.getDocumentLineage(userId, collectionId, sourceId, chunkId);
      return res.status(200).json(lineage);
    } catch (err: any) {
      const status = err.message?.includes('denied') || err.message?.includes('Authentication') ? 403 : 500;
      return res.status(status).json({ error: err.message || 'Failed to resolve lineage' });
    }
  };

  /**
   * Get immutable document version history.
   * GET /api/v1/notebooks/:id/sources/:sourceId/versions
   */
  getDocumentVersions = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid || (req as any).user?.id || 'anonymous';
      const { id: collectionId, sourceId } = req.params;

      const versions = await contentExplorationService.getDocumentVersions(userId, collectionId, sourceId);
      return res.status(200).json({
        documentId: sourceId,
        collectionId,
        versions,
      });
    } catch (err: any) {
      const status = err.message?.includes('denied') || err.message?.includes('Authentication') ? 403 : 500;
      return res.status(status).json({ error: err.message || 'Failed to fetch document versions' });
    }
  };

  /**
   * Diff two document versions.
   * POST /api/v1/notebooks/:id/sources/:sourceId/versions/diff
   */
  diffDocumentVersions = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid || (req as any).user?.id || 'anonymous';
      const { id: collectionId, sourceId } = req.params;
      const { baseVersionId, targetVersionId } = req.body;

      if (!baseVersionId || !targetVersionId) {
        return res.status(400).json({ error: 'baseVersionId and targetVersionId are required' });
      }

      const diff = await contentExplorationService.diffDocumentVersions(
        userId,
        collectionId,
        sourceId,
        baseVersionId,
        targetVersionId
      );
      return res.status(200).json(diff);
    } catch (err: any) {
      const status = err.message?.includes('denied') || err.message?.includes('Authentication') ? 403 : 500;
      return res.status(status).json({ error: err.message || 'Failed to diff document versions' });
    }
  };

  /**
   * Trace the complete downstream provenance graph for a document and its versions.
   * GET /api/v1/notebooks/:id/sources/:sourceId/lineage-graph
   */
  getDocumentLineageGraph = async (req: Request, res: Response) => {
    try {
      const { id: collectionId, sourceId } = req.params;
      const versionId = req.query.versionId as string | undefined;

      const graph = await contentLineageService.traceDocumentLineageGraph(
        collectionId,
        sourceId,
        versionId
      );
      return res.status(200).json(graph);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to trace lineage graph' });
    }
  };

  /**
   * Resolve 4-level lineage for a downstream artifact (Magic Chat, Podcast, Quiz, etc.).
   * POST /api/v1/notebooks/:id/lineage/resolve
   */
  resolveArtifactLineage = async (req: Request, res: Response) => {
    try {
      const {
        artifactId,
        artifactType,
        title,
        description,
        consumerContext,
        collectionId,
        documentId,
        documentVersionId,
        citedChunkIds,
      } = req.body;

      if (!artifactId || !artifactType || !collectionId || !documentId || !citedChunkIds) {
        return res.status(400).json({
          error: 'artifactId, artifactType, collectionId, documentId, and citedChunkIds are required',
        });
      }

      const record = await contentLineageService.resolveArtifactLineage({
        artifactId,
        artifactType,
        title,
        description,
        consumerContext,
        collectionId,
        documentId,
        documentVersionId,
        citedChunkIds,
      });

      return res.status(200).json(record);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to resolve artifact lineage' });
    }
  };

  /**
   * Get an artifact's saved lineage record.
   * GET /api/v1/notebooks/:id/lineage/artifact/:artifactId
   */
  getArtifactLineage = async (req: Request, res: Response) => {
    try {
      const { artifactId } = req.params;
      const record = await contentLineageService.getArtifactLineage(artifactId);
      if (!record) {
        return res.status(404).json({ error: `Artifact lineage record not found for ${artifactId}` });
      }
      return res.status(200).json(record);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch artifact lineage' });
    }
  };

  /**
   * Get document processing history and stage telemetry.
   * GET /api/v1/notebooks/:id/sources/:sourceId/history
   */
  getDocumentHistory = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid || (req as any).user?.id || 'anonymous';
      const { id: collectionId, sourceId } = req.params;

      const history = await contentExplorationService.getDocumentHistory(userId, collectionId, sourceId);
      return res.status(200).json(history);
    } catch (err: any) {
      const status = err.message?.includes('denied') || err.message?.includes('Authentication') ? 403 : 500;
      return res.status(status).json({ error: err.message || 'Failed to fetch processing history' });
    }
  };

  /**
   * Get comprehensive document quality & 10-invariant validation report.
   * GET /api/v1/notebooks/:id/sources/:sourceId/quality
   */
  getDocumentQuality = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid || (req as any).user?.id || 'anonymous';
      const { id: collectionId, sourceId } = req.params;

      const report = await qualityValidationService.evaluateDocumentQuality(collectionId, sourceId, {
        tenantId: userId,
      });

      return res.status(200).json(report);
    } catch (err: any) {
      const status = err.message?.includes('denied') || err.message?.includes('Authentication') ? 403 : 500;
      return res.status(status).json({ error: err.message || 'Failed to evaluate document quality' });
    }
  };

  /**
   * Force live re-validation of all 10 pre-READY invariants and return updated score.
   * POST /api/v1/notebooks/:id/sources/:sourceId/revalidate
   */
  revalidateDocumentQuality = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.uid || (req as any).user?.id || 'anonymous';
      const { id: collectionId, sourceId } = req.params;
      const { strictMode = false } = req.body || {};

      const report = await qualityValidationService.evaluateDocumentQuality(collectionId, sourceId, {
        tenantId: userId,
        strictMode,
      });

      return res.status(200).json({
        success: true,
        message: report.isReadyValid
          ? `Document quality verified: Health status ${report.healthStatus} (${report.overallScore}%)`
          : `Document quality failed: ${report.failures.length} critical invariants failed`,
        report,
      });
    } catch (err: any) {
      const status = err.message?.includes('denied') || err.message?.includes('Authentication') ? 403 : 500;
      return res.status(status).json({ error: err.message || 'Failed to revalidate document' });
    }
  };
}

export const qualityValidationService = new ContentQualityValidationService();
export const explorationController = new ExplorationController();
