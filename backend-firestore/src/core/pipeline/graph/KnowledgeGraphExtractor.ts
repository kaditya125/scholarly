/**
 * KnowledgeGraphExtractor
 * Phase 4: Knowledge Graph Integration
 *
 * Extracts Concepts, Entities, and Typed Relationships from
 * DocumentUnderstandingResult and SemanticChunk[] with full lineage
 * (documentId, documentVersionId, chunkId, collectionId, sourceLocation, confidence).
 */

import {
  DocumentUnderstandingResult,
  SemanticChunk,
  PipelineKGNode,
  PipelineKGEdge,
  KGNodeType,
  KGRelationshipType,
  KGExtractionOptions,
} from '../types';

export interface ExtractedConceptRaw {
  label: string;
  type: KGNodeType;
  definition: string;
  importance: number;
  confidence: number;
  chunkId?: string;
  blockIds: string[];
  pageStart?: number;
  pageEnd?: number;
}

export interface ExtractedRelationshipRaw {
  sourceConceptLabel: string;
  targetConceptLabel: string;
  relationshipType: KGRelationshipType;
  confidence: number;
  chunkId?: string;
}

export class KnowledgeGraphExtractor {
  /**
   * Generates a deterministic node ID for a concept within a collection.
   */
  public generateNodeId(collectionId: string, type: KGNodeType, label: string): string {
    const cleanCol = collectionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanLabel = label.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `kg_${cleanCol}_${type.toLowerCase()}_${cleanLabel}`;
  }

  /**
   * Generates a deterministic edge ID between two concept nodes.
   */
  public generateEdgeId(sourceNodeId: string, targetNodeId: string, relType: KGRelationshipType): string {
    return `edge_${sourceNodeId}_${targetNodeId}_${relType}`;
  }

  /**
   * Extracts raw concepts and entities from DocumentUnderstandingResult and chunks.
   */
  public extractConceptsAndEntities(
    understanding: DocumentUnderstandingResult,
    chunks: SemanticChunk[],
    opts: KGExtractionOptions = {}
  ): ExtractedConceptRaw[] {
    const minConfidence = opts.minConceptConfidence ?? 0.7;
    const rawConcepts: ExtractedConceptRaw[] = [];

    // 1. Extract from Structured Blocks (Phase 2D)
    for (const block of understanding.structuredBlocks) {
      if (block.structureType === 'definition') {
        const parsed = this.parseDefinitionBlock(block.content);
        if (parsed && (block.confidence || 0.9) >= minConfidence) {
          rawConcepts.push({
            label: parsed.term,
            type: 'CONCEPT',
            definition: parsed.definition,
            importance: 0.85,
            confidence: block.confidence || 0.9,
            blockIds: [block.blockId],
            pageStart: block.pageNumber,
            pageEnd: block.pageNumber,
          });
        }
      } else if (block.structureType === 'theorem') {
        const title = block.content.split(/[:\n]/)[0].trim() || 'Theorem';
        rawConcepts.push({
          label: title,
          type: 'THEOREM',
          definition: block.content,
          importance: 0.8,
          confidence: block.confidence || 0.85,
          blockIds: [block.blockId],
          pageStart: block.pageNumber,
          pageEnd: block.pageNumber,
        });
      } else if (block.structureType === 'chapter' && block.chapterTitle) {
        rawConcepts.push({
          label: block.chapterTitle,
          type: 'CONCEPT',
          definition: `Core curriculum chapter: ${block.chapterTitle}`,
          importance: 0.95,
          confidence: 0.95,
          blockIds: [block.blockId],
          pageStart: block.pageNumber,
          pageEnd: block.pageNumber,
        });
      }
    }

    // 2. Extract from Semantic Chunks (Phase 3A)
    for (const chunk of chunks) {
      if (chunk.contentType === 'definition') {
        const parsed = this.parseDefinitionBlock(chunk.text);
        if (parsed) {
          rawConcepts.push({
            label: parsed.term,
            type: 'CONCEPT',
            definition: parsed.definition,
            importance: 0.85,
            confidence: 0.9,
            chunkId: chunk.chunkId,
            blockIds: chunk.sourceLocation.blockIds,
            pageStart: chunk.pageNumber,
            pageEnd: chunk.pageEnd,
          });
        }
      }

      // Detect formula entities (explicit "Formula: ..." prefix or equations with =, >=, <=)
      const explicitFormula = chunk.text.match(/(?:Formula|समीकरण|सूत्र)\s*:\s*([^.\n]+)/i);
      const mathEqMatch = chunk.text.match(/([A-Za-zΔ\u0394][A-Za-z0-9_\s]*\s*(?:>=|<=|=|≈)\s*[^.\n]{2,40})/);

      const detectedFormula = explicitFormula ? explicitFormula[1].trim() : (mathEqMatch ? mathEqMatch[1].trim() : null);

      if (detectedFormula && detectedFormula.length > 2 && detectedFormula.length < 60) {
        rawConcepts.push({
          label: detectedFormula,
          type: 'FORMULA',
          definition: `Formula: ${detectedFormula}`,
          importance: 0.75,
          confidence: 0.85,
          chunkId: chunk.chunkId,
          blockIds: chunk.sourceLocation.blockIds,
          pageStart: chunk.pageNumber,
          pageEnd: chunk.pageEnd,
        });
      }

      // Keyword / Topic concepts from metadata
      if (chunk.topic && chunk.topic.trim().length > 1) {
        rawConcepts.push({
          label: chunk.topic.trim(),
          type: 'CONCEPT',
          definition: `Topic: ${chunk.topic}`,
          importance: 0.7,
          confidence: 0.8,
          chunkId: chunk.chunkId,
          blockIds: chunk.sourceLocation.blockIds,
          pageStart: chunk.pageNumber,
          pageEnd: chunk.pageEnd,
        });
      }
    }

    // Deduplicate within this extraction run
    return this.deduplicateRawConcepts(rawConcepts);
  }

  /**
   * Extracts typed relationships between concepts with confidence scores.
   */
  public extractRelationships(
    concepts: PipelineKGNode[],
    chunks: SemanticChunk[],
    opts: KGExtractionOptions = {}
  ): ExtractedRelationshipRaw[] {
    const minEdgeConfidence = opts.minEdgeConfidence ?? 0.6;
    const maxRelPerNode = opts.maxRelationshipsPerNode ?? 5;
    const relationships: ExtractedRelationshipRaw[] = [];

    // Map labels to concept nodes
    const labelMap = new Map<string, PipelineKGNode>();
    for (const c of concepts) {
      labelMap.set(c.label.toLowerCase(), c);
    }

    // 1. Structural hierarchy relationships (Chapter -> Section/Definition: PART_OF)
    for (const concept of concepts) {
      if (concept.chapter && labelMap.has(concept.chapter.toLowerCase())) {
        const parent = labelMap.get(concept.chapter.toLowerCase())!;
        if (parent.id !== concept.id) {
          relationships.push({
            sourceConceptLabel: concept.label,
            targetConceptLabel: parent.label,
            relationshipType: 'PART_OF',
            confidence: 0.95,
          });
        }
      }
    }

    // 2. Intra-chunk co-occurrence and dependency extraction
    for (const chunk of chunks) {
      const lowerChunk = chunk.text.toLowerCase();
      const presentConcepts: PipelineKGNode[] = [];

      for (const concept of concepts) {
        if (lowerChunk.includes(concept.label.toLowerCase())) {
          presentConcepts.push(concept);
        }
      }

      if (presentConcepts.length >= 2) {
        for (let i = 0; i < presentConcepts.length; i++) {
          for (let j = i + 1; j < presentConcepts.length; j++) {
            const cA = presentConcepts[i];
            const cB = presentConcepts[j];
            if (cA.id === cB.id) continue;

            let relType: KGRelationshipType = 'RELATED_TO';
            let confidence = 0.8;

            if (cA.type === 'FORMULA' || cB.type === 'FORMULA') {
              relType = 'USES';
              confidence = 0.85;
            } else if (cA.type === 'THEOREM' || cB.type === 'THEOREM') {
              relType = 'EXPLAINS';
              confidence = 0.82;
            }

            relationships.push({
              sourceConceptLabel: cA.label,
              targetConceptLabel: cB.label,
              relationshipType: relType,
              confidence,
              chunkId: chunk.chunkId,
            });
          }
        }
      }
    }

    // Filter by confidence threshold
    return relationships.filter(r => r.confidence >= minEdgeConfidence);
  }

  private parseDefinitionBlock(text: string): { term: string; definition: string } | null {
    const cleaned = text.trim();

    // 1. Definition/Principle/Law prefix: "Definition: Uncertainty Principle states that ..." or "Definition: Wave Particle Duality: matter..."
    const prefixMatch = cleaned.match(/^(?:Definition|परिभाषा|Principle|Law|Theorem)\s*:\s*(.+)$/i);
    if (prefixMatch) {
      const rest = prefixMatch[1].trim();
      const splitMatch = rest.match(/^([^:–—\n]+?)(?:\s+(?:is|means|states\s+that|states|refers\s+to|वह)\s+|[:–—\n])\s*(.+)$/i);
      if (splitMatch && splitMatch[1].trim().length > 1 && splitMatch[2].trim().length > 3) {
        return {
          term: splitMatch[1].trim(),
          definition: splitMatch[2].trim(),
        };
      }
      // If no explicit separator, if rest has a colon
      const colonIdx = rest.indexOf(':');
      if (colonIdx > 0) {
        return {
          term: rest.substring(0, colonIdx).trim(),
          definition: rest.substring(colonIdx + 1).trim(),
        };
      }
    }

    // 2. Direct term definition: "Wave Particle Duality: matter exhibits..."
    const colonMatch = cleaned.match(/^([A-Za-z0-9\s]{3,50}):\s*(.{10,})/);
    if (colonMatch && !/^(?:note|important|example|chapter|section|definition|figure|table)$/i.test(colonMatch[1].trim())) {
      return {
        term: colonMatch[1].trim(),
        definition: colonMatch[2].trim(),
      };
    }

    return null;
  }

  private deduplicateRawConcepts(concepts: ExtractedConceptRaw[]): ExtractedConceptRaw[] {
    const map = new Map<string, ExtractedConceptRaw>();

    for (const c of concepts) {
      const key = `${c.type}_${c.label.trim().toLowerCase()}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, c);
      } else {
        // Keep the one with longer/more detailed definition and higher confidence
        const bestDef = (c.definition.length > existing.definition.length) ? c.definition : existing.definition;
        const bestConf = Math.max(c.confidence, existing.confidence);
        const bestImportance = Math.max(c.importance, existing.importance);
        const mergedBlockIds = Array.from(new Set([...existing.blockIds, ...c.blockIds]));

        map.set(key, {
          ...existing,
          definition: bestDef,
          confidence: bestConf,
          importance: bestImportance,
          blockIds: mergedBlockIds,
          chunkId: existing.chunkId || c.chunkId,
        });
      }
    }

    return Array.from(map.values());
  }
}
