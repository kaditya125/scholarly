/**
 * KnowledgeGraphService
 * Phase 4: Knowledge Graph Integration Orchestrator
 *
 * Coordinates:
 *   DocumentUnderstandingResult + SemanticChunk[]
 *              ↓
 *      KnowledgeGraphExtractor (Concepts, Entities, Relationships)
 *              ↓
 *      Lineage Tracking (documentId, documentVersionId, chunkId, sourceLocation)
 *              ↓
 *      Idempotent Merging & Conflict Reconciliation
 *              ↓
 *      Edge Filtering (min confidence threshold) & Validation Invariants
 *              ↓
 *      Persistence via notebookRepository (`kg_nodes`, `kg_edges`)
 */

import { KnowledgeGraphExtractor } from './KnowledgeGraphExtractor';
import { notebookRepository } from '../../../repositories/notebook.repository';
import {
  DocumentUnderstandingResult,
  SemanticChunk,
  PipelineKGNode,
  PipelineKGEdge,
  KGExtractionOptions,
  KGExtractionResult,
  KGValidationResult,
} from '../types';
import { db } from '../../../config/firebase';

const DEFAULT_OPTIONS: Required<KGExtractionOptions> = {
  minConceptConfidence: 0.7,
  minEdgeConfidence: 0.6,
  maxRelationshipsPerNode: 5,
  enableIntraDocumentLinking: true,
  enableCrossDocumentLinking: true,
  tenantId: '',
};

export class KnowledgeGraphService {
  private extractor: KnowledgeGraphExtractor;

  constructor(extractor?: KnowledgeGraphExtractor) {
    this.extractor = extractor || new KnowledgeGraphExtractor();
  }

  /**
   * Extracts and validates Knowledge Graph nodes and edges in memory.
   */
  async extractGraph(
    understanding: DocumentUnderstandingResult,
    chunks: SemanticChunk[],
    userId: string,
    collectionId: string,
    userOpts: KGExtractionOptions = {}
  ): Promise<KGExtractionResult> {
    const startTime = Date.now();
    const opts: Required<KGExtractionOptions> = { ...DEFAULT_OPTIONS, ...userOpts };
    const warnings: string[] = [];

    const documentId = understanding.documentId;
    const documentVersionId = understanding.documentVersionId;

    // 1. Extract Raw Concepts & Entities
    const rawConcepts = this.extractor.extractConceptsAndEntities(understanding, chunks, opts);

    // 2. Build PipelineKGNode Objects with full Lineage
    const newNodes: PipelineKGNode[] = rawConcepts.map(raw => {
      const nodeId = this.extractor.generateNodeId(collectionId, raw.type, raw.label);
      const subject = typeof understanding.resolvedMetadata['subject']?.value === 'string'
        ? understanding.resolvedMetadata['subject'].value
        : undefined;

      return {
        id: nodeId,
        notebookId: collectionId,
        collectionId,
        tenantId: opts.tenantId || userId,
        label: raw.label,
        type: raw.type,
        definition: raw.definition,
        importance: raw.importance,
        difficulty: 'Medium',
        estimatedStudyTime: 10,
        masteryPercentage: 0,
        confidenceScore: raw.confidence,
        prerequisites: [],
        relatedConcepts: [],
        sourceDocIds: [documentId],
        lineage: [
          {
            documentId,
            documentVersionId,
            chunkIds: raw.chunkId ? [raw.chunkId] : [],
            collectionId,
            pageStart: raw.pageStart,
            pageEnd: raw.pageEnd,
            blockIds: raw.blockIds,
          },
        ],
        subject,
        chapter: chunks[0]?.chapter,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    // 3. Extract Relationships
    const rawRelationships = this.extractor.extractRelationships(newNodes, chunks, opts);

    // 4. Construct PipelineKGEdge Objects with Deterministic IDs
    const edges: PipelineKGEdge[] = [];
    const edgeMap = new Map<string, PipelineKGEdge>();

    for (const rel of rawRelationships) {
      if (rel.confidence < opts.minEdgeConfidence) {
        // Filter out low confidence relationships
        continue;
      }

      const sourceNode = newNodes.find(n => n.label.toLowerCase() === rel.sourceConceptLabel.toLowerCase());
      const targetNode = newNodes.find(n => n.label.toLowerCase() === rel.targetConceptLabel.toLowerCase());

      if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) {
        continue;
      }

      const edgeId = this.extractor.generateEdgeId(sourceNode.id, targetNode.id, rel.relationshipType);

      if (!edgeMap.has(edgeId)) {
        const edge: PipelineKGEdge = {
          id: edgeId,
          notebookId: collectionId,
          collectionId,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          relationshipType: rel.relationshipType,
          confidence: rel.confidence,
          documentId,
          documentVersionId,
          chunkId: rel.chunkId,
          layer: 'structural',
          createdAt: new Date().toISOString(),
        };

        edgeMap.set(edgeId, edge);
        edges.push(edge);

        // Update node connection pointers
        if (rel.relationshipType === 'PREREQUISITE_OF' && !targetNode.prerequisites.includes(sourceNode.id)) {
          targetNode.prerequisites.push(sourceNode.id);
        } else if (!sourceNode.relatedConcepts.includes(targetNode.id)) {
          sourceNode.relatedConcepts.push(targetNode.id);
        }
      }
    }

    // 5. Validate Graph Invariants
    const validation = this.validateGraph(newNodes, edges, collectionId, documentId);

    return {
      documentId,
      documentVersionId,
      collectionId,
      userId,
      nodes: newNodes,
      edges,
      nodesCount: newNodes.length,
      edgesCount: edges.length,
      validation,
      durationMs: Date.now() - startTime,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Processes extraction, merges with existing notebook knowledge graph idempotently, and persists.
   */
  async processAndPersist(
    understanding: DocumentUnderstandingResult,
    chunks: SemanticChunk[],
    userId: string,
    collectionId: string,
    sourceId: string,
    opts: KGExtractionOptions = {}
  ): Promise<KGExtractionResult> {
    const result = await this.extractGraph(understanding, chunks, userId, collectionId, opts);

    if (!result.validation.isValid) {
      const sourceRef = db.collection('notebooks').doc(collectionId).collection('sources').doc(sourceId);
      await sourceRef.update({
        processingError: result.validation.error || 'Knowledge Graph validation failed.',
        updatedAt: new Date().toISOString(),
      });
      return result;
    }

    // 1. Fetch Existing Graph Nodes for Idempotent Merging
    let existingNodes: any[] = [];
    try {
      existingNodes = await notebookRepository.getKGNodes(collectionId);
    } catch {
      existingNodes = [];
    }

    const mergedNodes = this.mergeWithExistingNodes(existingNodes, result.nodes);

    // 2. Persist Nodes & Edges via Existing Repository
    if (mergedNodes.length > 0) {
      await notebookRepository.addKGNodes(collectionId, mergedNodes as any);
    }

    if (result.edges.length > 0) {
      await notebookRepository.addKGEdges(collectionId, result.edges as any);
    }

    // 3. Update Pipeline State
    const sourceRef = db.collection('notebooks').doc(collectionId).collection('sources').doc(sourceId);
    await sourceRef.update({
      kgNodesExtracted: result.nodesCount,
      kgEdgesExtracted: result.edgesCount,
      currentStage: 'GRAPH',
      updatedAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Merges extracted nodes into existing graph nodes, resolving conflicts and updating lineage.
   */
  public mergeWithExistingNodes(
    existingNodes: PipelineKGNode[],
    newNodes: PipelineKGNode[]
  ): PipelineKGNode[] {
    const nodeMap = new Map<string, PipelineKGNode>();

    // Index existing nodes
    for (const node of existingNodes) {
      nodeMap.set(node.id, { ...node });
    }

    // Merge new nodes
    for (const incoming of newNodes) {
      const existing = nodeMap.get(incoming.id);
      if (!existing) {
        nodeMap.set(incoming.id, incoming);
      } else {
        // Concept already exists: merge lineage, sourceDocIds, and reconcile definition
        const mergedDocIds = Array.from(new Set([...(existing.sourceDocIds || []), ...(incoming.sourceDocIds || [])]));
        const mergedLineage = [...(existing.lineage || []), ...(incoming.lineage || [])];
        const mergedPrereqs = Array.from(new Set([...(existing.prerequisites || []), ...(incoming.prerequisites || [])]));
        const mergedRelated = Array.from(new Set([...(existing.relatedConcepts || []), ...(incoming.relatedConcepts || [])]));

        // Reconcile definition: keep longer/higher confidence definition
        const bestDef = incoming.definition.length > (existing.definition?.length || 0)
          ? incoming.definition
          : existing.definition;

        const bestConfidence = Math.max(existing.confidenceScore || 0.8, incoming.confidenceScore);
        const bestImportance = Math.max(existing.importance || 0.5, incoming.importance);

        nodeMap.set(incoming.id, {
          ...existing,
          definition: bestDef,
          sourceDocIds: mergedDocIds,
          lineage: mergedLineage,
          prerequisites: mergedPrereqs,
          relatedConcepts: mergedRelated,
          confidenceScore: bestConfidence,
          importance: bestImportance,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return Array.from(nodeMap.values());
  }

  /**
   * Validates Knowledge Graph integrity and isolation.
   */
  private validateGraph(
    nodes: PipelineKGNode[],
    edges: PipelineKGEdge[],
    collectionId: string,
    documentId: string
  ): KGValidationResult {
    const nodeIds = new Set(nodes.map(n => n.id));
    let orphanedEdges = 0;
    const warnings: string[] = [];

    // Check isolation
    const tenantIsolationVerified = nodes.every(n => n.notebookId === collectionId && n.collectionId === collectionId)
      && edges.every(e => e.notebookId === collectionId && e.collectionId === collectionId);

    // Check source references
    const validSourceReferences = nodes.every(n => n.sourceDocIds.includes(documentId))
      && edges.every(e => e.documentId === documentId);

    // Check orphaned edges
    for (const edge of edges) {
      if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
        orphanedEdges++;
        warnings.push(`Edge ${edge.id} references missing node (${edge.sourceNodeId} -> ${edge.targetNodeId})`);
      }
    }

    const isValid = tenantIsolationVerified && validSourceReferences && orphanedEdges === 0;

    return {
      isValid,
      nodesExtracted: nodes.length,
      edgesExtracted: edges.length,
      validSourceReferences,
      tenantIsolationVerified,
      orphanedEdgeCount: orphanedEdges,
      warnings: warnings.length > 0 ? warnings : undefined,
      error: isValid ? undefined : 'Knowledge graph validation invariants violated.',
    };
  }
}
