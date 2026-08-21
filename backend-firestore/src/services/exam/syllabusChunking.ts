/**
 * J.9 — deterministic chunking of an extracted official document.
 *
 * WHY THIS EXISTS. Extraction previously refused any document whose text exceeded 50,000
 * characters, because the alternative at the time was `rawText.slice(0, 50000)` — a silent
 * truncation that would publish half a syllabus as if it were whole. Refusing was the right call
 * then, but it also means a real 60–100 page exam notice can never be ingested at all.
 *
 * This module removes the ceiling without reintroducing the guess. The rules it obeys:
 *
 *   · SAME BYTES → SAME CHUNKS. Nothing here reads a clock, a random source, or a model. Chunk
 *     boundaries are a pure function of the extracted blocks and the character budget, so a
 *     re-ingestion of the same document reproduces the same chunk set exactly — which is what makes
 *     the downstream canonical ids stable across re-ingestion.
 *   · PAGE-AWARE, NOT ARBITRARY. Boundaries fall on page boundaries wherever possible, then block
 *     boundaries, and only inside a single oversized block does it cut on characters. A syllabus
 *     table split mid-row loses meaning; a split between pages does not.
 *   · ORDER IS PRESERVED. Chunks are emitted in document order and carry their index, so the merge
 *     can reassemble the hierarchy exactly as the official document printed it.
 *   · NOTHING IS DROPPED. Every block reaches exactly one chunk. `assertNoTextLost` proves it
 *     rather than asserting it in a comment.
 *
 * The archived PDF remains the authoritative provenance artifact. Chunks are derived, transient,
 * and never persisted as a syllabus.
 */
import crypto from 'crypto';
import type { ExtractedBlock } from '../../core/pipeline/types';

/**
 * Character budget per chunk.
 *
 * Deliberately well under the model's context limit: the extraction prompt, the schema and the
 * response all have to fit alongside the chunk, and a chunk that only just fits on a good day
 * fails intermittently on a bad one. 40k leaves real headroom under the previous 50k ceiling that
 * was known to work for a single call.
 */
export const MAX_CHUNK_CHARS = 40_000;

/** Hard floor, so a pathological budget cannot produce single-character chunks. */
const MIN_CHUNK_CHARS = 1_000;

export interface SyllabusChunk {
  /** Position in document order, 0-based. Stable across re-runs. */
  chunkIndex: number;
  /** Inclusive page range this chunk covers, from the extractor's own page numbering. */
  pageStart: number;
  pageEnd: number;
  text: string;
  /** SHA-256 of the ARCHIVED DOCUMENT bytes. Ties every chunk back to real provenance. */
  documentHash: string;
  /** SHA-256 of this chunk's own text. Used for vector identity and change detection. */
  contentHash: string;
  /** True when this chunk is part of a block that had to be split on characters. */
  splitWithinBlock: boolean;
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Splits one oversized string on a deterministic boundary.
 *
 * Prefers the last paragraph break, then the last line break, then a hard cut — in that order, and
 * always the LAST such boundary inside the budget, so the result depends only on the input and the
 * budget. Never returns an empty piece, which would otherwise let a pathological input loop.
 */
function splitDeterministically(text: string, budget: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > budget) {
    const window = rest.slice(0, budget);
    let cut = window.lastIndexOf('\n\n');
    if (cut < budget * 0.5) cut = window.lastIndexOf('\n');
    if (cut < budget * 0.5) cut = budget;
    if (cut <= 0) cut = budget;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

/**
 * Groups extracted blocks into deterministic, page-aware chunks.
 *
 * `blocks` must be in document order — PdfExtractor emits them that way via `sequence`, and they
 * are re-sorted here so a caller that reorders them cannot silently change the chunking.
 */
export function chunkExtractedBlocks(
  blocks: ExtractedBlock[],
  documentHash: string,
  maxChars: number = MAX_CHUNK_CHARS,
): SyllabusChunk[] {
  const budget = Math.max(maxChars, MIN_CHUNK_CHARS);
  const ordered = [...(blocks ?? [])]
    .filter((b) => (b?.content ?? '').trim().length > 0)
    .sort((a, b) => a.sequence - b.sequence);

  if (ordered.length === 0) return [];

  type Pending = { text: string; pageStart: number; pageEnd: number; split: boolean };
  const chunks: SyllabusChunk[] = [];
  let pending: Pending | null = null;

  const flush = () => {
    if (!pending || pending.text.trim().length === 0) { pending = null; return; }
    const text = pending.text.trim();
    chunks.push({
      chunkIndex: chunks.length,
      pageStart: pending.pageStart,
      pageEnd: pending.pageEnd,
      text,
      documentHash,
      contentHash: sha256(text),
      splitWithinBlock: pending.split,
    });
    pending = null;
  };

  for (const block of ordered) {
    const page = block.pageNumber ?? 1;
    const content = block.content.trim();

    // A single block larger than the whole budget is split on its own deterministic boundaries.
    // Each piece becomes its own chunk so the split is visible downstream rather than smeared
    // across neighbouring pages.
    if (content.length > budget) {
      flush();
      for (const piece of splitDeterministically(content, budget)) {
        pending = { text: piece, pageStart: page, pageEnd: page, split: true };
        flush();
      }
      continue;
    }

    if (!pending) {
      pending = { text: content, pageStart: page, pageEnd: page, split: false };
      continue;
    }

    // +1 for the newline that will join them.
    if (pending.text.length + 1 + content.length > budget) {
      flush();
      pending = { text: content, pageStart: page, pageEnd: page, split: false };
    } else {
      pending.text += `\n${content}`;
      pending.pageEnd = page;
    }
  }
  flush();

  return chunks;
}

/**
 * Proves no extracted text was dropped by chunking.
 *
 * Compares with ALL whitespace removed, not merely collapsed. Chunking joins separate blocks with a
 * newline, but splits an oversized block at a character boundary with no separator at all — so any
 * comparison that inserts a delimiter between pieces miscounts one of the two cases. (Measured: a
 * 120,000-character single block split into three reported 120,002 "chunked" characters, purely
 * from the two spaces the comparison itself introduced.)
 *
 * Removing whitespace entirely is insensitive to how pieces were joined and still detects the
 * failure that matters — content going missing. A silently dropped page is precisely what this
 * module exists to prevent, so it is checked rather than assumed, and there is a test that removes
 * a chunk to prove this check can actually fail.
 */
export function assertNoTextLost(blocks: ExtractedBlock[], chunks: SyllabusChunk[]): void {
  const normalise = (s: string) => s.replace(/\s+/g, '');
  const source = normalise((blocks ?? []).map((b) => b.content ?? '').join(''));
  const chunked = normalise(chunks.map((c) => c.text).join(''));
  if (source !== chunked) {
    throw new Error(
      `[SyllabusChunking] chunking lost or altered text: ` +
      `${source.length} source characters vs ${chunked.length} chunked. Refusing to continue — ` +
      `a dropped section would be published as if the syllabus never contained it.`,
    );
  }
}
