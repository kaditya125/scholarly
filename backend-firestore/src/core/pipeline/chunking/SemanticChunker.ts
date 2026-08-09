/**
 * SemanticChunker
 * Phase 3A: Structure-Aware Semantic Chunking Engine
 *
 * Implements non-destructive, structure-respecting semantic chunking.
 * Transforms an array of DocumentStructureBlocks and EducationalMetadata into
 * semantically cohesive, deterministic, searchable, and embedding-ready SemanticChunk[].
 */

import { BlockGroup, BlockGroupBuilder } from './BlockGroupBuilder';
import { BoundaryStrategyEngine } from './BoundaryStrategyEngine';
import {
  DocumentStructureBlock,
  DocumentUnderstandingResult,
  SemanticChunk,
  ChunkingOptions,
  ChunkingResult,
  ChunkContentType,
  ChunkBoundaryStrategy,
} from '../types';
import { generateChunkId } from '../idGenerator';

const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  maxTokensPerChunk: 512,
  minTokensPerChunk: 20,
  overlapTokens: 50,
  groupQaPairs: true,
  groupDefinitions: true,
  groupTables: true,
  respectSectionBoundaries: true,
  includeMetadataInEmbeddingText: true,
};

export class SemanticChunker {
  private groupBuilder: BlockGroupBuilder;
  private boundaryEngine: BoundaryStrategyEngine;

  constructor(
    groupBuilder?: BlockGroupBuilder,
    boundaryEngine?: BoundaryStrategyEngine
  ) {
    this.groupBuilder = groupBuilder || new BlockGroupBuilder();
    this.boundaryEngine = boundaryEngine || new BoundaryStrategyEngine();
  }

  /**
   * Main chunking method: converts DocumentUnderstandingResult into SemanticChunk[].
   */
  chunk(
    understanding: DocumentUnderstandingResult,
    collectionId: string,
    userOpts: ChunkingOptions = {}
  ): ChunkingResult {
    const startTime = Date.now();
    const opts: Required<ChunkingOptions> = { ...DEFAULT_OPTIONS, ...userOpts };

    const blocks = understanding.structuredBlocks;
    const metadata = understanding.resolvedMetadata;

    // 1. Build cohesive block groups
    const groups = this.groupBuilder.buildGroups(blocks, {
      groupQaPairs: opts.groupQaPairs,
      groupDefinitions: opts.groupDefinitions,
      groupTables: opts.groupTables,
    });

    // 2. Accumulate groups into raw chunk units
    const rawChunks: { groups: BlockGroup[]; strategy: ChunkBoundaryStrategy }[] = [];
    let currentAccumulator: BlockGroup[] = [];
    let currentTokens = 0;
    let activeChapter: string | undefined;
    let activeSection: string | undefined;

    for (const group of groups) {
      // Check for oversized single group that exceeds maxTokensPerChunk
      if (group.estimatedTokens > opts.maxTokensPerChunk) {
        // Flush any accumulated groups first
        if (currentAccumulator.length > 0) {
          rawChunks.push({
            groups: [...currentAccumulator],
            strategy: this.boundaryEngine.resolveStrategyFromGroups(currentAccumulator),
          });
          currentAccumulator = [];
          currentTokens = 0;
        }

        // Perform overflow split for oversized group
        const splitUnits = this.overflowSplitGroup(group, opts);
        for (const unit of splitUnits) {
          rawChunks.push({
            groups: [unit],
            strategy: 'overflow_split',
          });
        }
        continue;
      }

      // Check boundary decision
      const decision = this.boundaryEngine.evaluateBoundary(
        currentAccumulator,
        currentTokens,
        group,
        activeChapter,
        activeSection,
        opts
      );

      if (decision.shouldSplit && currentAccumulator.length > 0) {
        rawChunks.push({
          groups: [...currentAccumulator],
          strategy: decision.strategy || this.boundaryEngine.resolveStrategyFromGroups(currentAccumulator),
        });
        currentAccumulator = [];
        currentTokens = 0;
      }

      currentAccumulator.push(group);
      currentTokens += group.estimatedTokens;

      const firstBlk = group.blocks[0];
      if (firstBlk.chapterTitle) activeChapter = firstBlk.chapterTitle;
      if (firstBlk.section) activeSection = firstBlk.section;
    }

    // Flush remaining accumulator
    if (currentAccumulator.length > 0) {
      rawChunks.push({
        groups: [...currentAccumulator],
        strategy: this.boundaryEngine.resolveStrategyFromGroups(currentAccumulator),
      });
    }

    // 3. Assemble and decorate SemanticChunk objects
    const subject = typeof metadata['subject']?.value === 'string' ? metadata['subject'].value : undefined;
    const classLevel = typeof metadata['class']?.value === 'string' ? metadata['class'].value : undefined;
    const language = typeof metadata['language']?.value === 'string' ? metadata['language'].value : undefined;
    const board = typeof metadata['board']?.value === 'string' ? metadata['board'].value : undefined;
    const exam = typeof metadata['exam']?.value === 'string' ? metadata['exam'].value : undefined;
    const topic = typeof metadata['topic']?.value === 'string' ? metadata['topic'].value : undefined;
    const difficulty = typeof metadata['difficulty']?.value === 'string' ? metadata['difficulty'].value : undefined;

    const chunks: SemanticChunk[] = [];
    const strategyCounts: Partial<Record<ChunkBoundaryStrategy, number>> = {};

    for (let seq = 0; seq < rawChunks.length; seq++) {
      const raw = rawChunks[seq];
      const chunkId = generateChunkId(understanding.documentId, seq);
      const allBlocksInChunk: DocumentStructureBlock[] = raw.groups.flatMap(g => g.blocks);

      const combinedText = allBlocksInChunk.map(b => b.content).join('\n\n');
      const charCount = combinedText.length;
      const tokenCount = Math.ceil(charCount / 4);

      // Derive location properties
      const pageNumbers = allBlocksInChunk.map(b => b.pageNumber).filter((p): p is number => p !== undefined);
      const pageNumber = pageNumbers.length > 0 ? Math.min(...pageNumbers) : undefined;
      const pageEnd = pageNumbers.length > 0 ? Math.max(...pageNumbers) : undefined;

      const chapter = allBlocksInChunk.find(b => b.chapterTitle)?.chapterTitle;
      const section = allBlocksInChunk.find(b => b.section)?.section;

      const contentType = this.determineChunkContentType(allBlocksInChunk, raw.strategy);

      // Build embedding text with context enrichment if enabled
      let embeddingText = combinedText;
      if (opts.includeMetadataInEmbeddingText) {
        const headerParts: string[] = [];
        if (subject) headerParts.push(`Subject: ${subject}`);
        if (chapter) headerParts.push(`Chapter: ${chapter}`);
        if (section) headerParts.push(`Section: ${section}`);
        if (headerParts.length > 0) {
          embeddingText = `[${headerParts.join(' | ')}]\n${combinedText}`;
        }
      }

      const chunk: SemanticChunk = {
        chunkId,
        documentId: understanding.documentId,
        documentVersionId: understanding.documentVersionId,
        collectionId,
        text: combinedText,
        sequence: seq,
        contentType,
        pageNumber,
        pageEnd,
        chapter,
        section,
        subject,
        classLevel,
        language,
        board,
        exam,
        topic,
        difficulty,
        sourceLocation: {
          blockIds: allBlocksInChunk.map(b => b.blockId),
          pageStart: pageNumber,
          pageEnd,
          charStart: 0,
          charEnd: charCount,
        },
        boundaryStrategy: raw.strategy,
        tokenCount,
        charCount,
        previousChunkId: seq > 0 ? generateChunkId(understanding.documentId, seq - 1) : undefined,
        nextChunkId: seq < rawChunks.length - 1 ? generateChunkId(understanding.documentId, seq + 1) : undefined,
        conceptIds: [],
        entityIds: [],
        embeddingText,
      };

      chunks.push(chunk);
      strategyCounts[raw.strategy] = (strategyCounts[raw.strategy] || 0) + 1;
    }

    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    const averageChunkTokens = chunks.length > 0 ? Math.round(totalTokens / chunks.length) : 0;

    return {
      documentId: understanding.documentId,
      documentVersionId: understanding.documentVersionId,
      collectionId,
      chunks,
      totalChunks: chunks.length,
      totalTokens,
      averageChunkTokens,
      boundaryStrategyDistribution: strategyCounts as Record<ChunkBoundaryStrategy, number>,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Splits an oversized block group across sentence/paragraph boundaries with overlap.
   */
  private overflowSplitGroup(group: BlockGroup, opts: Required<ChunkingOptions>): BlockGroup[] {
    const combinedText = group.blocks.map(b => b.content).join('\n\n');
    const firstBlock = group.blocks[0];

    const maxChars = opts.maxTokensPerChunk * 4;
    const overlapChars = opts.overlapTokens * 4;

    // Split text by paragraphs or sentences
    const paragraphs = combinedText.split(/\n\n+/);
    const splitGroups: BlockGroup[] = [];

    let currentSegment = '';

    for (const para of paragraphs) {
      if ((currentSegment + '\n\n' + para).length <= maxChars) {
        currentSegment = currentSegment ? `${currentSegment}\n\n${para}` : para;
      } else {
        if (currentSegment) {
          splitGroups.push(this.createSyntheticGroup(currentSegment, firstBlock, group.primaryType));
          // Take overlap from end of currentSegment
          const overlapText = currentSegment.slice(Math.max(0, currentSegment.length - overlapChars));
          currentSegment = overlapText ? `${overlapText}\n\n${para}` : para;
        } else {
          // Paragraph itself exceeds maxChars: slice hard by sentence / character
          let remaining = para;
          while (remaining.length > 0) {
            const slice = remaining.slice(0, maxChars);
            splitGroups.push(this.createSyntheticGroup(slice, firstBlock, group.primaryType));
            if (remaining.length <= maxChars) break;
            remaining = remaining.slice(maxChars - overlapChars);
          }
          currentSegment = '';
        }
      }
    }

    if (currentSegment.trim().length > 0) {
      splitGroups.push(this.createSyntheticGroup(currentSegment, firstBlock, group.primaryType));
    }

    return splitGroups.length > 0 ? splitGroups : [group];
  }

  private createSyntheticGroup(
    text: string,
    sourceBlock: DocumentStructureBlock,
    primaryType: BlockGroup['primaryType']
  ): BlockGroup {
    const syntheticBlock: DocumentStructureBlock = {
      blockId: sourceBlock.blockId,
      structureType: sourceBlock.structureType,
      content: text,
      pageNumber: sourceBlock.pageNumber,
      sequence: sourceBlock.sequence,
      confidence: sourceBlock.confidence,
      heading: sourceBlock.heading,
      section: sourceBlock.section,
      chapterTitle: sourceBlock.chapterTitle,
    };

    return {
      blocks: [syntheticBlock],
      primaryType,
      estimatedTokens: Math.ceil(text.length / 4),
      atomic: false,
    };
  }

  /**
   * Determines the primary ChunkContentType based on constituent blocks.
   */
  private determineChunkContentType(
    blocks: DocumentStructureBlock[],
    strategy: ChunkBoundaryStrategy
  ): ChunkContentType {
    if (strategy === 'qa_pair_group') return 'question_answer';
    if (strategy === 'definition_explanation_group') return 'definition';
    if (strategy === 'table_group') return 'table';

    if (blocks.some(b => b.content.includes('|') && b.content.includes('-|-'))) return 'table';
    if (blocks.some(b => b.structureType === 'theorem')) return 'theorem';
    if (blocks.some(b => b.structureType === 'example')) return 'example';
    if (blocks.some(b => b.structureType === 'exercise')) return 'exercise';
    if (blocks.some(b => b.structureType === 'important_note')) return 'important_note';
    if (blocks.some(b => b.structureType === 'summary')) return 'summary';
    if (blocks.some(b => b.structureType === 'reference')) return 'reference';
    if (blocks.some(b => b.structureType === 'heading' || b.structureType === 'title')) return 'heading';

    return 'text';
  }
}
