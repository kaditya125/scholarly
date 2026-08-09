/**
 * Adaptive extraction windows (Part 7).
 *
 * Concept/metadata extraction runs the LLM over fixed-size text windows. The previous logic took
 * only the first N contiguous windows from the START of the document, so a long chapter's back
 * half never contributed concepts to the knowledge graph.
 *
 * This helper is adaptive and cost-bounded:
 *   - if the whole document fits within the window budget, it is scanned end-to-end,
 *   - if it exceeds the budget, `cap` windows are spread EVENLY across the document (start …
 *     middle … end) so coverage spans the entire chapter instead of just the front.
 * Window COUNT is unchanged for a given cap, so cost is neutral — only the coverage improves.
 * Pure / unit-testable.
 */
export function buildExtractionWindows(text: string, windowChars = 18000, hardCap = 3): string[] {
  const clean = (text || '').trim();
  if (!clean) return [];

  const win = Math.max(1, windowChars);
  const cap = Math.max(1, hardCap);
  const needed = Math.max(1, Math.ceil(clean.length / win));
  const count = Math.min(needed, cap);

  const windows: string[] = [];

  if (count >= needed) {
    // Whole document fits within the budget — scan contiguously, end to end.
    for (let i = 0; i < clean.length; i += win) windows.push(clean.slice(i, i + win));
    return windows;
  }

  if (count === 1) {
    // Only one window allowed but the doc is larger — take the front.
    return [clean.slice(0, win)];
  }

  // Document exceeds the budget — sample `count` windows evenly across the whole document.
  const lastStart = clean.length - win; // > 0 here (clean.length > cap*win >= win)
  const stride = Math.floor(lastStart / (count - 1));
  const seen = new Set<number>();
  for (let k = 0; k < count; k++) {
    const start = Math.min(k * stride, lastStart);
    if (!seen.has(start)) { seen.add(start); windows.push(clean.slice(start, start + win)); }
  }
  return windows;
}

/**
 * Build a single representative text sample that spans the WHOLE chapter for asset
 * generation (summary / flashcards / quiz / rich assets).
 *
 * Previously assets were generated from only the first ~12k characters (the document
 * START), so questions/notes never reflected the back half of a chapter. This instead:
 *   - returns the entire text when it fits within `budgetChars` (small chapters are
 *     covered end-to-end), otherwise
 *   - stitches `segments` evenly-spread slices (start … middle … end) joined with a
 *     gap marker, so the sample represents the whole chapter at a bounded token cost.
 *
 * Cost is capped by `budgetChars` regardless of chapter length. Pure / unit-testable.
 */
export function buildRepresentativeSample(text: string, budgetChars = 18000, segments = 3): string {
  const clean = (text || '').trim();
  if (!clean) return '';
  if (clean.length <= budgetChars) return clean; // whole chapter fits within budget

  const segs = Math.max(2, segments); // need at least 2 slices to spread across the document
  const segLen = Math.max(1, Math.floor(budgetChars / segs));
  const lastStart = clean.length - segLen; // > 0 here (clean.length > budgetChars >= segLen)
  const stride = Math.floor(lastStart / (segs - 1));

  const parts: string[] = [];
  const seen = new Set<number>();
  for (let k = 0; k < segs; k++) {
    const start = Math.min(k * stride, lastStart);
    if (seen.has(start)) continue; // avoid duplicate slices on tiny strides
    seen.add(start);
    parts.push(clean.slice(start, start + segLen));
  }
  return parts.join('\n\n[\u2026]\n\n');
}
