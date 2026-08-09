import { ParsedPage } from '../services/fileParser.service';

/**
 * Structure-aware chunking (Phase B, Part 5).
 *
 * The v1 `TextChunker` splits blindly by character count, cutting mid-sentence and mid-concept
 * and emitting one chunk per paragraph. This v2 chunker:
 *   - splits on paragraph/heading boundaries (never mid-block, so definitions / formulae /
 *     tables / lists / examples stay intact),
 *   - detects headings to (a) force clean section boundaries and (b) tag each chunk with its
 *     section / subsection / heading,
 *   - accumulates blocks up to a target size (fewer, better-sized chunks),
 *   - carries a small textual overlap across non-heading boundaries for retrieval continuity,
 *   - falls back to sentence splitting only for a single block that exceeds a hard cap.
 *
 * Backward compatible: this is additive. v1 chunks remain valid; v2 chunks are stamped
 * `chunkVersion: 2` in their vector metadata and carry the extra section fields.
 */

export interface SemanticChunk {
  text: string;
  pageNumber: number;
  paragraphIndex: number;
  section: string;
  subsection: string;
  heading: string;
}

export interface SemanticChunkOptions {
  targetChars?: number; // preferred chunk size
  maxChars?: number;    // hard cap; a single oversize block is sentence-split beyond this
  overlapChars?: number;
}

type Block =
  | { kind: 'heading'; text: string; level: number; pageNumber: number }
  | { kind: 'body'; text: string; pageNumber: number };

// ── Heading detection ───────────────────────────────────────────────────

// Named sections common in NCERT/textbook chapters (treated as a heading, level 2).
const KEYWORD_HEADING = /^(EXERCISES?|SUMMARY|INTEXT QUESTIONS?|QUESTIONS?|ACTIVITY|ACTIVITIES|EXAMPLE\s*\d*|GLOSSARY|WHAT (YOU )?HAVE LEARNT|KEY ?WORDS?|POINTS TO REMEMBER|DO YOU KNOW|THINK AND (ACT|DISCUSS))\b/i;
// Numbered heading like "5", "5.2", "5.2.1  Newton's Second Law".
const NUMBERED_HEADING = /^\s*(\d+(?:\.\d+){0,3})\s+\S/;

function isProbablyHeading(line: string): { level: number } | null {
  const t = line.trim();
  if (!t || t.length > 80) return null;

  const numbered = t.match(NUMBERED_HEADING);
  if (numbered) {
    const dots = (numbered[1].match(/\./g) || []).length;
    return { level: Math.min(4, dots + 1) };
  }
  if (KEYWORD_HEADING.test(t)) return { level: 2 };

  // Short line, no terminal punctuation, mostly uppercase => a heading.
  if (t.length <= 60 && !/[.:;,]$/.test(t)) {
    const letters = t.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 3) {
      const upper = t.replace(/[^A-Z]/g, '').length;
      if (upper / letters.length >= 0.7) return { level: 1 };
    }
  }
  return null;
}

// ── Block extraction ────────────────────────────────────────────────────

/**
 * Break pages into ordered blocks. A heading line becomes its own heading block; consecutive
 * non-heading lines are grouped into body blocks, further split on blank lines so paragraphs /
 * lists / tables stay as coherent units.
 */
function toBlocks(pages: ParsedPage[]): Block[] {
  const blocks: Block[] = [];
  for (const page of pages) {
    const rawParas = page.text.split(/\n\s*\n/); // blank-line separated paragraphs
    for (const para of rawParas) {
      const lines = para.split('\n');
      let buffer: string[] = [];
      const flush = () => {
        const text = buffer.join('\n').trim();
        if (text) blocks.push({ kind: 'body', text, pageNumber: page.pageNumber });
        buffer = [];
      };
      for (const line of lines) {
        const h = isProbablyHeading(line);
        if (h) {
          flush();
          blocks.push({ kind: 'heading', text: line.trim(), level: h.level, pageNumber: page.pageNumber });
        } else if (line.trim()) {
          buffer.push(line);
        } else {
          flush();
        }
      }
      flush();
    }
  }
  return blocks;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function sentenceSplit(text: string, maxChars: number, overlapChars: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + maxChars, text.length);
    let splitPos = end;
    if (end < text.length) {
      const lastStop = Math.max(text.lastIndexOf('. ', end), text.lastIndexOf('\n', end));
      if (lastStop > i + maxChars / 2) splitPos = lastStop + 1;
    }
    out.push(text.slice(i, splitPos).trim());
    if (splitPos >= text.length) break;
    i = Math.max(splitPos - overlapChars, i + 1);
  }
  return out.filter(Boolean);
}

function tail(text: string, chars: number): string {
  if (chars <= 0 || text.length <= chars) return text;
  const slice = text.slice(text.length - chars);
  const nl = slice.indexOf('\n');
  return nl >= 0 ? slice.slice(nl + 1) : slice; // start at a clean line where possible
}

// ── Main ────────────────────────────────────────────────────────────────

export function chunkPagesStructured(pages: ParsedPage[], opts: SemanticChunkOptions = {}): SemanticChunk[] {
  const targetChars = opts.targetChars ?? 1600;
  const maxChars = opts.maxChars ?? 2400;
  const overlapChars = opts.overlapChars ?? 200;

  const blocks = toBlocks(pages);
  const chunks: SemanticChunk[] = [];

  let section = '';
  let subsection = '';
  let heading = '';
  let cur = '';
  let curPage = pages[0]?.pageNumber ?? 1;
  let paragraphIndex = 0;
  // Whether `cur` holds real body content vs. only carried-over overlap context. Used so a
  // chunk is attributed to its first REAL block's page (not the overlap's origin page), and so
  // overlap alone never triggers a size-based flush.
  let curHasRealContent = false;

  const flush = (carryOverlap: boolean) => {
    const text = cur.trim();
    if (text) {
      chunks.push({ text, pageNumber: curPage, paragraphIndex: paragraphIndex++, section, subsection, heading });
      cur = carryOverlap ? tail(text, overlapChars) : '';
    } else {
      cur = '';
    }
    curHasRealContent = false;
  };

  const applyHeading = (b: Extract<Block, { kind: 'heading' }>) => {
    // A heading starts a clean section boundary (no overlap across it).
    flush(false);
    if (b.level <= 1) { section = b.text; subsection = ''; heading = b.text; }
    else if (b.level === 2) { subsection = b.text; heading = b.text; }
    else { heading = b.text; }
  };

  for (const b of blocks) {
    if (b.kind === 'heading') { applyHeading(b); continue; }

    // A single oversize block is sentence-split (kept as its own chunks) so we never emit a
    // 10k-char monster, but we still avoid cutting normal-sized definitions/lists.
    if (b.text.length > maxChars) {
      flush(false);
      for (const piece of sentenceSplit(b.text, maxChars, overlapChars)) {
        chunks.push({ text: piece, pageNumber: b.pageNumber, paragraphIndex: paragraphIndex++, section, subsection, heading });
      }
      continue;
    }

    const candidateLen = (cur ? cur.length + 2 : 0) + b.text.length;
    if (curHasRealContent && candidateLen > targetChars) {
      flush(true); // size-based boundary keeps a little context overlap
    }
    if (!curHasRealContent) curPage = b.pageNumber; // first real block sets the chunk's page
    cur = cur ? `${cur}\n\n${b.text}` : b.text;
    curHasRealContent = true;
  }
  flush(false);

  return chunks;
}
