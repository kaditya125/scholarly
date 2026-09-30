/**
 * Clean display label for a curriculum chapter. Mirrors chapterLabel() in
 * frontend/src/lib/api/documents.ts — keep the two in step.
 *
 * Ingested chapter names are inconsistent ("Unit 7 Alcohols…", "CHAPTER TWELVE: KINETIC THEORY",
 * "11 ― Grassroots Democracy", "9", "Unit 6"), and some chapters have none, leaving only the raw
 * source title ("NCERT Class 11 Political Science (Part 1) - Chapter 4"). Search indexes this label
 * rather than the raw title: the raw title contains the book's subject and class, so indexing it
 * made "physics" or "class 10" match every chapter of those books.
 */

const NUMBER_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';
// "Unit 7", "Chapter 3:", "CHAPTER TWELVE:", "Unit III -" …
const UNIT_PREFIX = new RegExp(`^\\s*(?:unit|chapter)\\s*[-.]?\\s*(?:\\d+|[ivxlc]+|${NUMBER_WORDS})\\b\\s*[:.\\-\\u2013\\u2014\\u2015]?\\s*`, 'i');
// "11 ― Grassroots…", "6 Control and Coordination", "3. Motion"
const NUMBER_PREFIX = /^\s*\d{1,2}\s*[.)\-–—―:]?\s+/;
// "I. AMINES", "II) …"
const ROMAN_PREFIX = /^\s*[IVXLC]+\s*[.)\-]\s+/;

export function cleanChapterName(name: string): string {
  let s = (name || '').replace(UNIT_PREFIX, '').replace(NUMBER_PREFIX, '').replace(ROMAN_PREFIX, '').trim();
  // Nothing name-like left ("Unit 6", "9") — signal empty so the caller falls back to the title.
  if ((s.match(/\p{L}/gu) || []).length < 2) return '';
  // De-SHOUT all-caps names ("KINETIC THEORY" -> "Kinetic Theory"); leave mixed case alone.
  if (s === s.toUpperCase() && /[A-Z]{2,}/.test(s)) {
    s = s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return s;
}

/** Compact "Chapter N · Part M" from a raw source title, never the noisy book-prefixed title. */
export function titleFallbackLabel(title: string): string {
  const t = (title || '').replace(/\.pdf$/i, '').trim();
  const part = (t.match(/Part\s*(\d+)/i) || [])[1];
  const chap = (t.match(/Chapter\s*(\d+)/i) || [])[1];
  if (chap) return part ? `Chapter ${chap} · Part ${part}` : `Chapter ${chap}`;
  const stripped = t.replace(/^NCERT\s+Class\s+\d+\s+[A-Za-z]+\s*/i, '').replace(/^[-–—\s(]+/, '').trim();
  return stripped || t;
}

export function chapterLabel(chapterName: string | undefined, title: string): string {
  return cleanChapterName(chapterName || '') || titleFallbackLabel(title);
}
