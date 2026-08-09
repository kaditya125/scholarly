/**
 * BlockGroupBuilder
 * Phase 3A: Structure-Aware Semantic Chunking
 *
 * Groups related DocumentStructureBlocks into semantic units before chunking.
 * Prevents the chunker from splitting semantically coupled blocks:
 *
 *   - Definition + following paragraph(s) (explanation of the definition)
 *   - Question + Answer pairs
 *   - Table + surrounding caption/paragraph
 *   - Theorem + Proof/Example
 *   - Important Note (kept atomic)
 *   - Exercise block (kept atomic)
 *
 * A "BlockGroup" is a list of structurally related blocks that should
 * be treated as a single semantic unit for chunking purposes.
 */

import { DocumentStructureBlock, DocumentStructureType } from '../types';

export interface BlockGroup {
  blocks: DocumentStructureBlock[];
  primaryType: DocumentStructureType;
  /** Estimated token count for the whole group */
  estimatedTokens: number;
  /** Whether this group should be treated as atomic (never split internally) */
  atomic: boolean;
}

export class BlockGroupBuilder {
  /**
   * Groups an ordered list of DocumentStructureBlocks into semantic units.
   * Returns groups in the same order as the input.
   */
  buildGroups(
    blocks: DocumentStructureBlock[],
    opts: {
      groupQaPairs: boolean;
      groupDefinitions: boolean;
      groupTables: boolean;
    }
  ): BlockGroup[] {
    const groups: BlockGroup[] = [];
    let i = 0;

    while (i < blocks.length) {
      const block = blocks[i];

      // Q+A pair grouping
      if (opts.groupQaPairs && block.structureType === 'question') {
        const group = this.consumeQaPair(blocks, i);
        groups.push(group);
        i += group.blocks.length;
        continue;
      }

      // Definition + explanation grouping
      if (opts.groupDefinitions && block.structureType === 'definition') {
        const group = this.consumeDefinitionGroup(blocks, i);
        groups.push(group);
        i += group.blocks.length;
        continue;
      }

      // Theorem + following example/paragraph
      if (block.structureType === 'theorem') {
        const group = this.consumeTheoremGroup(blocks, i);
        groups.push(group);
        i += group.blocks.length;
        continue;
      }

      // Table + adjacent caption/paragraph
      if (opts.groupTables && block.structureType === 'unknown') {
        // Tables come through as 'unknown' after structure analysis of 'table' extraction type
        const group = this.consumeTableGroup(blocks, i);
        groups.push(group);
        i += group.blocks.length;
        continue;
      }

      // Important notes and exercises are always atomic single-block groups
      if (
        block.structureType === 'important_note' ||
        block.structureType === 'exercise' ||
        block.structureType === 'summary' ||
        block.structureType === 'reference'
      ) {
        groups.push(this.singleGroup(block, true));
        i++;
        continue;
      }

      // Example: keep with the following paragraph if it's short
      if (block.structureType === 'example') {
        const group = this.consumeExampleGroup(blocks, i);
        groups.push(group);
        i += group.blocks.length;
        continue;
      }

      // Structural delimiters (title, chapter, section, subsection, heading)
      // are kept as atomic single-block groups so the chunker can use them as
      // boundary signals
      if (
        block.structureType === 'title' ||
        block.structureType === 'chapter' ||
        block.structureType === 'section' ||
        block.structureType === 'subsection' ||
        block.structureType === 'heading'
      ) {
        groups.push(this.singleGroup(block, true));
        i++;
        continue;
      }

      // Default: standalone paragraph block
      groups.push(this.singleGroup(block, false));
      i++;
    }

    return groups;
  }

  // ------------------------------------------------------------------
  // Group consumers
  // ------------------------------------------------------------------

  private consumeQaPair(blocks: DocumentStructureBlock[], start: number): BlockGroup {
    const group: DocumentStructureBlock[] = [blocks[start]];
    let j = start + 1;

    // Consume consecutive answer blocks that follow this question
    while (
      j < blocks.length &&
      (blocks[j].structureType === 'answer' || blocks[j].structureType === 'paragraph') &&
      j - start < 4 // max 4 blocks in a Q+A pair to avoid run-ons
    ) {
      group.push(blocks[j]);
      if (blocks[j].structureType === 'answer') {
        j++;
        break; // Stop after the first answer block
      }
      j++;
    }

    return {
      blocks: group,
      primaryType: 'question_answer' as any,
      estimatedTokens: this.estimateTokens(group),
      atomic: true,
    };
  }

  private consumeDefinitionGroup(blocks: DocumentStructureBlock[], start: number): BlockGroup {
    const group: DocumentStructureBlock[] = [blocks[start]];
    let j = start + 1;

    // Consume the 1–2 paragraphs immediately following the definition (the explanation)
    let consumed = 0;
    while (j < blocks.length && consumed < 2) {
      const next = blocks[j];
      if (next.structureType === 'paragraph') {
        group.push(next);
        j++;
        consumed++;
      } else {
        break; // Stop at any non-paragraph block
      }
    }

    return {
      blocks: group,
      primaryType: 'definition',
      estimatedTokens: this.estimateTokens(group),
      atomic: true,
    };
  }

  private consumeTheoremGroup(blocks: DocumentStructureBlock[], start: number): BlockGroup {
    const group: DocumentStructureBlock[] = [blocks[start]];
    let j = start + 1;

    // Consume adjacent example or paragraph blocks (the proof or application)
    while (j < blocks.length && j - start < 3) {
      const next = blocks[j];
      if (next.structureType === 'example' || next.structureType === 'paragraph') {
        group.push(next);
        j++;
      } else {
        break;
      }
    }

    return {
      blocks: group,
      primaryType: 'theorem',
      estimatedTokens: this.estimateTokens(group),
      atomic: group.length === 1, // Atomic only if standalone; theorem+example can overflow split
    };
  }

  private consumeTableGroup(blocks: DocumentStructureBlock[], start: number): BlockGroup {
    const group: DocumentStructureBlock[] = [blocks[start]];
    let j = start + 1;

    // Consume a following paragraph/caption (table description)
    if (j < blocks.length && blocks[j].structureType === 'paragraph') {
      group.push(blocks[j]);
      j++;
    }

    return {
      blocks: group,
      primaryType: 'unknown',
      estimatedTokens: this.estimateTokens(group),
      atomic: false,
    };
  }

  private consumeExampleGroup(blocks: DocumentStructureBlock[], start: number): BlockGroup {
    const group: DocumentStructureBlock[] = [blocks[start]];
    let j = start + 1;

    // Consume a single following paragraph if it's short (likely solution/explanation)
    if (j < blocks.length && blocks[j].structureType === 'paragraph') {
      const candidate = blocks[j];
      const candidateTokens = Math.ceil(candidate.content.length / 4);
      if (candidateTokens < 150) {
        group.push(candidate);
      }
    }

    return {
      blocks: group,
      primaryType: 'example',
      estimatedTokens: this.estimateTokens(group),
      atomic: group.length === 1,
    };
  }

  private singleGroup(block: DocumentStructureBlock, atomic: boolean): BlockGroup {
    return {
      blocks: [block],
      primaryType: block.structureType,
      estimatedTokens: Math.ceil(block.content.length / 4),
      atomic,
    };
  }

  private estimateTokens(blocks: DocumentStructureBlock[]): number {
    return Math.ceil(blocks.reduce((sum, b) => sum + b.content.length, 0) / 4);
  }
}
