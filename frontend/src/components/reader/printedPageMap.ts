/**
 * Maps a PRINTED textbook page number to an index in a chapter PDF.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  WHY. Measured in production on NCERT Class 12 Biology Ch.12:
 *
 *    the PDF          11 pages, indexed 1..11
 *    article anchors  ncertPageRef 206..214 — the printed folio, and correct:
 *                     PDF page 2 literally begins "206 BIOLOGY 12.1 ECOSYSTEM – STRUCTURE…"
 *    gotoPage(206)    Math.min(numPages, 206) -> 11
 *
 *  Every anchored jump landed on the last page of the chapter — the same wrong page for all 24
 *  generated questions, and for every TOC entry, since scrollToSection has always passed
 *  section.ncertPageRef straight into gotoPage. The two numbers were never the same unit.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

export interface PrintedPageMap {
  /** printed folio -> 1-based PDF index. Empty when no reliable numbering was found. */
  map: Map<number, number>;
  /** printed - pdfIndex. 0 when undetermined. */
  offset: number;
  /** How many pages carried a folio consistent with `offset`. */
  agree: number;
}

/** The folio sits at the very start or very end of a page's text stream. */
function folioFrom(items: string[]): number | null {
  const edges = [...items.slice(0, 3), ...items.slice(-3)];
  for (const raw of edges) {
    const m = raw.match(/^(\d{1,4})$/) || raw.match(/^(\d{1,4})\s+\D/) || raw.match(/\D\s+(\d{1,4})$/);
    const n = m ? Number(m[1]) : NaN;
    if (Number.isFinite(n) && n > 0 && n < 2000) return n;
  }
  return null;
}

/**
 * Reads the folio each page prints and derives the constant offset between printed numbering and
 * PDF index.
 *
 * Only an offset that most pages agree on is accepted. A figure number or a year caught by the
 * edge heuristic would otherwise define the mapping from a single page — so the offset is chosen
 * by majority, not by the first page that yields a number.
 */
export async function buildPrintedPageMap(
  pdf: { getPage: (i: number) => Promise<any> },
  numPages: number,
  opts: { maxScan?: number; onCancel?: () => boolean } = {},
): Promise<PrintedPageMap> {
  const limit = Math.min(numPages, opts.maxScan ?? 60);
  const found = new Map<number, number>(); // pdfIndex -> printed

  for (let i = 1; i <= limit; i++) {
    if (opts.onCancel?.()) break;
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = (content.items || [])
        .map((it: any) => String(it.str || '').trim())
        .filter(Boolean);
      const folio = folioFrom(items);
      if (folio !== null) found.set(i, folio);
    } catch {
      /* a page that will not yield text simply has no folio */
    }
  }

  // Majority vote on (printed - index).
  const tally = new Map<number, number>();
  for (const [idx, printed] of found) {
    const o = printed - idx;
    tally.set(o, (tally.get(o) || 0) + 1);
  }
  let offset = 0;
  let agree = 0;
  for (const [o, count] of tally) {
    if (count > agree) { offset = o; agree = count; }
  }

  // Two pages agreeing is the minimum that distinguishes real numbering from a stray match.
  if (agree < 2) return { map: new Map(), offset: 0, agree };

  const map = new Map<number, number>();
  for (let i = 1; i <= numPages; i++) map.set(i + offset, i);
  return { map, offset, agree };
}
