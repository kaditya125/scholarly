/**
 * Deterministic matching for the curriculum resolver.
 *
 * Chapter files are named only by number ("NCERT Class 11 Physics (Part 1) - Chapter 4.pdf"), and
 * that number is the FILE's index, not the book's chapter number — Class 11 Physics Part 2
 * "Chapter 6.pdf" is really chapter 13, Oscillations. So a chapter can only be identified by the
 * names ingestion extracted into its metadata (`chapters`, `headings`, keywords, concepts).
 *
 * The matching is pure and deterministic — no embeddings. That matters twice over: the Vertex
 * embedding quota is ~5 calls/minute and shared with live student retrieval, and a resolver that
 * silently picks the wrong chapter is worse than one that asks. Everything here is scoring and
 * ranking only; the adapter supplies the data and applies the security boundary.
 */

/** Words that carry no topic meaning in a curriculum query. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'for', 'to', 'and', 'or', 'with', 'from', 'about', 'into',
  'chapter', 'chapters', 'class', 'grade', 'std', 'standard', 'ncert', 'book', 'textbook', 'part',
  'topic', 'lesson', 'unit', 'please', 'give', 'me', 'my', 'i', 'want', 'need', 'make', 'create',
  'formula', 'formulae', 'formulas', 'chart', 'notes', 'summary', 'revision', 'study', 'prepare',
  'pdf', 'sheet', 'all', 'key', 'important', 'is', 'are', 'what', 'how', 'explain',
  // Lead-ins students put in front of the topic ("Brief me on ...", "Tell me about ..."). Left in,
  // they count as unmatched words and drag the confidence down on an otherwise exact match.
  'brief', 'briefing', 'overview', 'tell', 'about', 'walk', 'through', 'over', 'cover', 'covers',
  'on', 'an', 'go', 'show', 'summarise', 'summarize',
]);

/** Roman/word numerals that appear in extracted chapter labels like "CHAPTER THIRTEEN OSCILLATIONS". */
const NUMBER_WORDS =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';

export function normalise(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  return normalise(text)
    .split(' ')
    .filter((w) => w && w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * The name a student would recognise. Ingestion sometimes captured only "CHAPTER FIVE", in which
 * case the first real heading ("WORK, ENERGY AND POWER") is the actual chapter name.
 */
export function displayChapterName(chapterName: string | undefined, headings: string[] = [], fallbackTitle = ''): string {
  const stripped = String(chapterName ?? '')
    .replace(new RegExp(`^\\s*chapter\\s+(${NUMBER_WORDS}|\\d+)\\s*[:.\\-]?\\s*`, 'i'), '')
    .trim();
  if (stripped) return stripped;
  const heading = headings.find((h) => {
    const t = String(h ?? '').trim();
    return t && !/^\d+(\.\d+)*\s*$/.test(t) && !/^(\d+(\.\d+)*\s+)?introduction$/i.test(t);
  });
  if (heading) return String(heading).replace(/^\d+(\.\d+)*\s+/, '').trim();
  return fallbackTitle.replace(/\.pdf$/i, '').trim();
}

const TITLE_MINOR_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'by', 'at', 'with']);

/** A chapter name in title case: "CELL: THE UNIT OF LIFE" → "Cell: The Unit of Life". */
export function titleCase(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((w, i, all) => (i > 0 && TITLE_MINOR_WORDS.has(w) && !/:$/.test(all[i - 1]) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function parseClassNumber(query: string): number | undefined {
  const m = normalise(query).match(/\b(?:class|grade|std|standard)\s*(\d{1,2})\b/) || normalise(query).match(/\b(\d{1,2})th\b/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined;
}

const SUBJECTS = [
  'physics', 'chemistry', 'biology', 'science', 'mathematics', 'maths', 'math', 'english', 'hindi',
  'history', 'geography', 'economics', 'political science', 'sanskrit', 'accountancy', 'business studies',
];

export function parseSubject(query: string): string | undefined {
  const n = normalise(query);
  const hit = SUBJECTS.find((s) => n.includes(s));
  if (!hit) return undefined;
  return hit === 'maths' || hit === 'math' ? 'mathematics' : hit;
}

/**
 * The topic part of a query, with the book-level words removed. "Laws of Motion, Class 11 Physics"
 * is about the chapter "Laws of Motion" — leaving "physics" in would count against every chapter
 * in the physics book equally and blur the ranking.
 */
export function topicPhrase(query: string): string {
  let text = normalise(query)
    .replace(/\b(class|grade|std|standard)\s*\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}(st|nd|rd|th)\b/g, ' ')
    .replace(/\bncert\b/g, ' ');
  for (const subject of SUBJECTS) text = text.replace(new RegExp(`\\b${subject}\\b`, 'g'), ' ');
  return text.replace(/\s+/g, ' ').trim();
}

export interface BookLike {
  notebookId: string;
  title: string;
  subject?: string;
  className?: string;
  readyChapterCount?: number;
}

/** Books are few (68) and their titles are regular, so exact class + subject beats fuzzy scoring. */
export function scoreBook(book: BookLike, grade: number | undefined, subject: string | undefined): number {
  const title = normalise(book.title);
  const bookClass = parseClassNumber(book.className || book.title);
  let score = 0;
  if (grade !== undefined) {
    if (bookClass === grade) score += 2;
    else if (bookClass !== undefined) return 0; // a different class is never the answer
  }
  if (subject) {
    const subjectText = normalise(`${book.subject ?? ''} ${book.title}`);
    if (subjectText.includes(subject)) score += 2;
    else if (subject === 'mathematics' && /\bmaths?\b/.test(subjectText)) score += 2;
    else return 0; // wrong subject
  }
  if (!grade && !subject) score += title.includes('ncert') ? 0.1 : 0;
  return score;
}

export interface ChapterLike {
  sourceId: string;
  title: string;
  chapterName?: string;
  headings?: string[];
  keywords?: string[];
  keyConcepts?: { term: string; definition?: string }[];
  learningObjectives?: string[];
  status?: string;
}

export interface ChapterMatch {
  sourceId: string;
  chapterName: string;
  chapterTitle: string;
  score: number;
  matchedOn: string[];
}

/** Weight by where a query word appears: the chapter's name is far stronger evidence than a keyword. */
const FIELD_WEIGHTS = { name: 1, heading: 0.5, keyword: 0.3 } as const;

/** Above this many distinct words a query is a description (a syllabus entry), not a chapter name. */
const LONG_QUERY = 8;

export function scoreChapter(allQueryTokens: string[], chapter: ChapterLike): { score: number; matchedOn: string[] } {
  // Each word counts once: "cell" six times in a syllabus entry must not weigh six times.
  const queryTokens = [...new Set(allQueryTokens)];
  if (queryTokens.length === 0) return { score: 0, matchedOn: [] };
  const name = displayChapterName(chapter.chapterName, chapter.headings, chapter.title);
  const nameTokens = new Set(tokenize(name));
  const headingTokens = new Set((chapter.headings ?? []).flatMap((h) => tokenize(h)));
  const keywordTokens = new Set([
    ...(chapter.keywords ?? []).flatMap((k) => tokenize(k)),
    ...(chapter.keyConcepts ?? []).flatMap((c) => tokenize(c?.term ?? '')),
    ...(chapter.learningObjectives ?? []).flatMap((o) => tokenize(o)),
  ]);

  const matchedOn = new Set<string>();
  let earned = 0;
  for (const token of queryTokens) {
    if (nameTokens.has(token)) {
      earned += FIELD_WEIGHTS.name;
      matchedOn.add('chapter name');
    } else if (headingTokens.has(token)) {
      earned += FIELD_WEIGHTS.heading;
      matchedOn.add('section headings');
    } else if (keywordTokens.has(token)) {
      earned += FIELD_WEIGHTS.keyword;
      matchedOn.add('keywords and concepts');
    }
  }
  let score = earned / queryTokens.length;

  // The whole topic phrase appearing in the name is decisive ("laws of motion" -> "Laws of Motion").
  const phrase = queryTokens.join(' ');
  if (normalise(name).includes(phrase)) {
    score = Math.max(score, 0.95);
    matchedOn.add('chapter name');
  }

  // A long query — a syllabus entry listing a chapter's contents — is judged the other way round:
  // how much of the chapter's own name and headings it covers. Averaging over the query's forty
  // words would dilute every chapter alike.
  if (queryTokens.length > LONG_QUERY) {
    const chapterTokens = new Set([...nameTokens, ...headingTokens]);
    if (chapterTokens.size >= 4) {
      const asked = new Set(queryTokens);
      let covered = 0;
      for (const t of chapterTokens) if (asked.has(t)) covered++;
      const coverage = covered / chapterTokens.size;
      if (coverage > score) {
        score = coverage;
        matchedOn.add('section headings');
      }
    }
  }
  return { score: Math.min(score, 1), matchedOn: [...matchedOn] };
}

export interface RankedChapters {
  best?: ChapterMatch;
  alternatives: ChapterMatch[];
  confident: boolean;
  /** Why the resolver is not confident — surfaced to the student instead of a guess. */
  reason?: 'no_match' | 'ambiguous' | 'empty_query';
}

/** A chapter must clear this to count as found at all. */
export const MIN_SCORE = 0.34;
/** ...and must beat the runner-up by this much, or the two are treated as ambiguous. */
export const MIN_MARGIN = 0.15;

export function rankChapters(query: string, chapters: ChapterLike[]): RankedChapters {
  const tokens = tokenize(topicPhrase(query));
  if (tokens.length === 0) return { alternatives: [], confident: false, reason: 'empty_query' };

  const ranked: ChapterMatch[] = chapters
    .map((c) => {
      const { score, matchedOn } = scoreChapter(tokens, c);
      return {
        sourceId: c.sourceId,
        chapterName: displayChapterName(c.chapterName, c.headings, c.title),
        chapterTitle: c.title,
        score: Number(score.toFixed(3)),
        matchedOn,
      };
    })
    .sort((a, b) => b.score - a.score || a.chapterTitle.localeCompare(b.chapterTitle));

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < MIN_SCORE) {
    return { alternatives: ranked.filter((r) => r.score > 0).slice(0, 3), confident: false, reason: 'no_match' };
  }
  if (second && best.score - second.score < MIN_MARGIN) {
    return { best, alternatives: ranked.slice(0, 3), confident: false, reason: 'ambiguous' };
  }
  return { best, alternatives: ranked.slice(1, 3).filter((r) => r.score > 0), confident: true };
}
