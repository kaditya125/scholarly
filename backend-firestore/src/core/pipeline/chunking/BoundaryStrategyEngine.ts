/**
 * BoundaryStrategyEngine
 * Phase 3A: Structure-Aware Semantic Chunking
 *
 * Determines whether the current accumulating chunk should break before a new BlockGroup,
 * or if the group can be safely merged into the current chunk.
 *
 * Rules:
 * 1. Hard Boundaries: Major structural transitions (e.g. Chapter heading) MUST trigger a boundary.
 * 2. Section Boundaries: If `respectSectionBoundaries` is true, moving to a new section triggers a boundary if the current chunk is above `minTokens`.
 * 3. Size Caps: If adding the next group exceeds `maxTokensPerChunk`, trigger a boundary.
 * 4. Micro-Chunk Prevention: If the current chunk is smaller than `minTokensPerChunk`, attempt to merge unless a hard boundary forbids it.
 * 5. Semantic Unity: Q&A groups, Definition+Explanation groups, and Tables prefer cohesive chunking.
 */

import { BlockGroup } from './BlockGroupBuilder';
import { ChunkBoundaryStrategy, ChunkingOptions } from '../types';

export interface BoundaryDecision {
  shouldSplit: boolean;
  strategy: ChunkBoundaryStrategy;
  reason?: string;
}

export class BoundaryStrategyEngine {
  /**
   * Evaluates whether a boundary should be placed before `nextGroup`.
   *
   * @param currentGroupList  The block groups accumulated so far in the active chunk
   * @param currentTokens     Total estimated tokens in the active chunk
   * @param nextGroup         The candidate block group to append
   * @param currentChapter    Current chapter tracking in the accumulator
   * @param currentSection    Current section tracking in the accumulator
   * @param opts              Chunking configuration options
   */
  evaluateBoundary(
    currentGroupList: BlockGroup[],
    currentTokens: number,
    nextGroup: BlockGroup,
    currentChapter: string | undefined,
    currentSection: string | undefined,
    opts: Required<ChunkingOptions>
  ): BoundaryDecision {
    if (currentGroupList.length === 0) {
      return { shouldSplit: false, strategy: 'single_block' };
    }

    const nextFirstBlock = nextGroup.blocks[0];
    const nextType = nextGroup.primaryType;
    const nextChapter = nextFirstBlock.chapterTitle;
    const nextSection = nextFirstBlock.section;

    // 1. Chapter Hard Boundary
    if (nextType === 'chapter' || (nextChapter && currentChapter && nextChapter !== currentChapter)) {
      return {
        shouldSplit: true,
        strategy: 'chapter_boundary',
        reason: `Chapter change: '${currentChapter}' -> '${nextChapter || nextFirstBlock.content}'`,
      };
    }

    // 2. Token Limit Check: will adding nextGroup exceed maxTokensPerChunk?
    if (currentTokens + nextGroup.estimatedTokens > opts.maxTokensPerChunk) {
      // If current chunk is already non-empty, we MUST split
      return {
        shouldSplit: true,
        strategy: 'paragraph_boundary',
        reason: `Max tokens exceeded: ${currentTokens} + ${nextGroup.estimatedTokens} > ${opts.maxTokensPerChunk}`,
      };
    }

    // 3. Section Boundary Check
    if (opts.respectSectionBoundaries) {
      if (nextType === 'section' || (nextSection && currentSection && nextSection !== currentSection)) {
        // If current chunk has reached reasonable minimum size, break cleanly on section
        if (currentTokens >= opts.minTokensPerChunk) {
          return {
            shouldSplit: true,
            strategy: 'section_boundary',
            reason: `Section change: '${currentSection}' -> '${nextSection || nextFirstBlock.content}'`,
          };
        }
      }
    }

    // 4. Special Block Group Boundaries
    // If next group is a dedicated Q&A pair and current chunk already has sufficient content
    if (nextType === ('question_answer' as any) && currentTokens >= opts.minTokensPerChunk) {
      return {
        shouldSplit: true,
        strategy: 'qa_pair_group',
        reason: 'Start new chunk for cohesive Q&A pair',
      };
    }

    // If next group is a formal Definition + Explanation and current chunk has sufficient content
    if (nextType === 'definition' && currentTokens >= opts.minTokensPerChunk) {
      return {
        shouldSplit: true,
        strategy: 'definition_explanation_group',
        reason: 'Start new chunk for formal Definition unit',
      };
    }

    // If next group is a Table and current chunk is non-trivial
    if (nextType === 'unknown' && nextFirstBlock.content.includes('|') && currentTokens >= opts.minTokensPerChunk) {
      return {
        shouldSplit: true,
        strategy: 'table_group',
        reason: 'Start new chunk for Table structure',
      };
    }

    // Otherwise, accumulate into current chunk
    return {
      shouldSplit: false,
      strategy: 'paragraph_boundary',
    };
  }

  /**
   * Maps a primary group type or structure event into a ChunkBoundaryStrategy
   */
  resolveStrategyFromGroups(groups: BlockGroup[]): ChunkBoundaryStrategy {
    if (groups.length === 0) return 'single_block';
    if (groups.length === 1) {
      const type = groups[0].primaryType;
      if (type === 'chapter') return 'chapter_boundary';
      if (type === 'section' || type === 'subsection' || type === 'heading') return 'heading_boundary';
      if (type === ('question_answer' as any) || type === 'question') return 'qa_pair_group';
      if (type === 'definition') return 'definition_explanation_group';
      if (type === 'unknown' && groups[0].blocks[0]?.content.includes('|')) return 'table_group';
      return 'single_block';
    }

    // Multi-group chunk: determine dominant semantic flavor
    const hasQa = groups.some(g => g.primaryType === ('question_answer' as any) || g.primaryType === 'question');
    if (hasQa) return 'qa_pair_group';

    const hasDef = groups.some(g => g.primaryType === 'definition');
    if (hasDef) return 'definition_explanation_group';

    const hasTable = groups.some(g => g.blocks.some(b => b.content.includes('|')));
    if (hasTable) return 'table_group';

    const hasSection = groups.some(g => g.primaryType === 'section' || g.primaryType === 'heading');
    if (hasSection) return 'section_boundary';

    return 'paragraph_boundary';
  }
}
