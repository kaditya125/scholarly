/**
 * HydeService — Hypothetical Document Embeddings for colloquial doubts.
 * =====================================================================
 *
 * Textbooks do not say "why doesn't a moving cycle fall over"; they say "angular momentum" and
 * "gyroscopic stability". When a student's wording is far from the book's, embedding the question
 * finds the wrong neighbourhood. HyDE asks Gemini Flash for a short passage written the way the
 * BOOK would answer, and searches with that passage's embedding instead.
 *
 * It costs one LLM call, so it is gated: classifyHydeNeed() decides per query, and
 * referenceBooks.service additionally retries with HyDE when a plain search comes back weak.
 * The hypothetical passage is only ever used as a search key — it never reaches the student or
 * the answering model as if it were source material.
 */

import { GeminiProvider } from '../ai/gemini.provider';
import { GoogleEmbeddingProvider } from '../ai/providers/google-embedding.provider';
import { cacheService } from '../cache.service';
import { Telemetry } from '../../lib/telemetry';
import { logger } from '../../utils/logger';

export const HYDE_MODEL = 'gemini-2.5-flash';

export interface HydeResult {
  originalQuery: string;
  hypotheticalPassage: string;
  embedding: number[];
  domain: HydeDomain;
  latencyMs: number;
  /** true when generation failed and the raw query was embedded instead. */
  fallback: boolean;
}

export type HydeDomain =
  | 'physics' | 'chemistry' | 'mathematics' | 'biology'
  | 'quantitative_aptitude' | 'reasoning' | 'english' | 'general_knowledge'
  | 'computer_science' | 'general';

/** How each domain's reference prose reads — the prompt asks for THAT register. */
const DOMAIN_STYLE: Record<HydeDomain, { books: string; equations: boolean }> = {
  physics: { books: 'physics (NCERT Physics, H.C. Verma, I.E. Irodov)', equations: true },
  chemistry: { books: 'chemistry (NCERT Chemistry, J.D. Lee, O.P. Tandon)', equations: true },
  mathematics: { books: 'mathematics (NCERT Mathematics, S.L. Loney, Hall & Knight)', equations: true },
  biology: { books: 'biology (NCERT Biology, Trueman, Campbell)', equations: false },
  quantitative_aptitude: { books: 'quantitative aptitude (S. Chand, R.S. Aggarwal)', equations: true },
  reasoning: { books: 'logical and analytical reasoning (R.S. Aggarwal, Rakesh Yadav)', equations: false },
  english: { books: 'English grammar and usage (Wren & Martin, S.P. Bakshi)', equations: false },
  general_knowledge: { books: 'general studies (Lucent General Knowledge, Laxmikanth, NCERT)', equations: false },
  computer_science: { books: 'computer science (Cormen, Galvin, Tanenbaum, Korth)', equations: false },
  general: { books: 'the relevant subject, written as a standard reference book would', equations: false },
};

const DOMAIN_ALIASES: Array<[RegExp, HydeDomain]> = [
  [/^phys/, 'physics'],
  [/^chem/, 'chemistry'],
  [/^(math|maths|mathematics)/, 'mathematics'],
  [/^(bio|botany|zoology)/, 'biology'],
  [/(quant|aptitude|arithmetic)/, 'quantitative_aptitude'],
  [/reason/, 'reasoning'],
  [/^english/, 'english'],
  [/(general knowledge|^gk$|general studies|general awareness|polity|politic|history|geography|economy|economics|environment|art and culture|bihar|ethics|science and tech)/, 'general_knowledge'],
  [/(computer|^cs$|programming|dbms|operating system)/, 'computer_science'],
];

/** Map a subject label from routing/metadata ("Physics", "General Knowledge", "quant") to a HyDE domain. */
export function toHydeDomain(subject: string | undefined | null): HydeDomain {
  const s = String(subject || '').toLowerCase().replace(/_/g, ' ').trim();
  if (!s) return 'general';
  for (const [re, d] of DOMAIN_ALIASES) if (re.test(s)) return d;
  return 'general';
}

export type HydeDecision =
  | { use: true; reason: 'colloquial' | 'vague' }
  | { use: false; reason: 'formal' | 'exact_lookup' | 'factual' | 'too_short' };

const COLLOQUIAL = [
  /\bhow come\b/, /\bwhat happens (if|when)\b/, /\bi (don'?t|do not|cant|can'?t) (get|understand)\b/,
  /\b(confus|confused|stuck)\b/, /\bwhy (does|do|is|are|did|doesn'?t|don'?t|can'?t|won'?t)\b/,
  /\b(stuff|thing|things|basically|like when|kinda|sort of)\b/, /\b(yaar|bhai|bro)\b/,
  /\b(kaise|kyun|kyon|kya|samajh|matlab)\b/, /\bin simple (words|terms)\b/, /\bwhat'?s the deal\b/,
  /\b(my|me|i)\b.*\?/,
];
const EXACT_LOOKUP = [
  /["“].{8,}["”]/, /\(\s*[a-d1-4]\s*\)/i, /\b(19|20)\d{2}\b/, /\b(pyq|previous year|question paper|shift \d)\b/i,
  /\b(chapter|exercise|example|page)\s*\d+/i, /\bq(uestion)?\.?\s*no\.?\s*\d+/i,
];
const FACTUAL = [
  /^(who|when|where|which year|what year)\b/, /\b(full form|capital of|stands for|founded|invented by)\b/,
];

/**
 * Should this query be searched with HyDE? Cheap, deterministic, explainable.
 *   - exact lookups (quoted text, MCQ options, years, chapter/example numbers) → no: the literal
 *     words ARE the best key, and a rewrite would blur them.
 *   - factual one-liners (who/when/full form) → no: keyword + dense already nail these.
 *   - colloquial phrasing → yes.
 *   - vague: a question with no technical vocabulary at all (only short common words) → yes.
 *   - otherwise (already textbook-like) → no; the weak-result retry still catches misses.
 */
export function classifyHydeNeed(query: string): HydeDecision {
  const q = String(query || '').trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length < 3) return { use: false, reason: 'too_short' };
  if (EXACT_LOOKUP.some((re) => re.test(query))) return { use: false, reason: 'exact_lookup' };
  if (FACTUAL.some((re) => re.test(q))) return { use: false, reason: 'factual' };
  if (COLLOQUIAL.some((re) => re.test(q))) return { use: true, reason: 'colloquial' };
  const contentWords = words.map((w) => w.replace(/[^a-z]/g, '')).filter((w) => w.length > 3);
  const longest = Math.max(0, ...contentWords.map((w) => w.length));
  if (q.endsWith('?') && longest <= 6 && words.length >= 5) return { use: true, reason: 'vague' };
  return { use: false, reason: 'formal' };
}

export function buildHydePrompt(query: string, domain: HydeDomain): string {
  const style = DOMAIN_STYLE[domain];
  return [
    `You write passages in the style of standard reference books for ${style.books}.`,
    `Write a concise, formal excerpt from such a book that directly answers the student's question below.`,
    `Use the precise technical terms the book would use${style.equations ? ', and include the governing equations or formulas' : ''}.`,
    `Do not address the student, do not add an introduction, and keep it between 60 and 120 words.`,
    ``,
    `Student question: "${query.replace(/"/g, "'")}"`,
  ].join('\n');
}

export class HydeService {
  constructor(
    private gemini = new GeminiProvider(),
    private embedding = new GoogleEmbeddingProvider(),
  ) {}

  /** Generate the hypothetical passage and embed it. Never throws: on failure embeds the raw query. */
  async generateAndEmbed(query: string, domain: HydeDomain = 'general'): Promise<HydeResult> {
    const t0 = performance.now();
    const cacheKey = `hyde:v2:${domain}:${query.trim().toLowerCase()}`;

    const cached = await cacheService.get<HydeResult>(cacheKey);
    if (cached) {
      Telemetry.logLatency('hyde_cache_hit', performance.now() - t0, { domain });
      return cached;
    }

    try {
      const aiResponse = await this.gemini.generateResponse(
        [{ role: 'user', content: buildHydePrompt(query, domain), timestamp: Date.now() }],
        undefined,
        { temperature: 0.2, model: HYDE_MODEL },
      );
      const hypotheticalPassage = String(aiResponse?.reply || '').trim();
      if (!hypotheticalPassage) throw new Error('empty HyDE passage');

      const embedding = await this.embedding.generateEmbedding(hypotheticalPassage);
      const latencyMs = performance.now() - t0;
      Telemetry.logLatency('hyde_generation', latencyMs, { domain });
      logger.info('[HyDE] passage generated', { domain, words: hypotheticalPassage.split(/\s+/).length, latencyMs: Math.round(latencyMs) });

      const result: HydeResult = { originalQuery: query, hypotheticalPassage, embedding, domain, latencyMs, fallback: false };
      await cacheService.set(cacheKey, result, 3600);
      return result;
    } catch (err: any) {
      logger.warn('[HyDE] generation failed; searching with the raw query embedding', { domain, error: err?.message || String(err) });
      const embedding = await this.embedding.generateEmbedding(query);
      // Not cached: a transient Gemini failure should not pin the fallback for an hour.
      return { originalQuery: query, hypotheticalPassage: query, embedding, domain, latencyMs: performance.now() - t0, fallback: true };
    }
  }
}

export const hydeService = new HydeService();
