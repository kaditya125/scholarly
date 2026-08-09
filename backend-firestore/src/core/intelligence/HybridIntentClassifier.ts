import { intentAnalyzer, IntentAnalyzer } from './IntentAnalyzer';
import { QueryCategory, IntelligenceInput } from './types';
import { featureFlags } from '../../config/featureFlags';
import { cacheService, CacheService } from '../../services/cache.service';

export interface HybridResult {
  category: QueryCategory;
  confidence: number;
  signals: string[];
  source: 'heuristic' | 'llm' | 'merged';
}

/** Pluggable LLM classifier used ONLY for the ambiguous tail. Returns null to fall back safely. */
export interface LLMIntentClassifier {
  classify(query: string, history: Array<{ role: string; content: string }>): Promise<{ category: QueryCategory; confidence: number } | null>;
}

export interface ClassifierStats {
  total: number;
  heuristicResolved: number;
  llmInvoked: number;
  llmAgreed: number;
  llmOverrode: number;
  cacheHits: number;
  /** Agreement rate between heuristic and LLM on the ambiguous tail (accuracy proxy). */
  agreementRate: number;
}

const VALID_CATEGORIES: Set<string> = new Set<QueryCategory>([
  'greeting', 'casual_conversation', 'definition', 'concept_explanation', 'comparison',
  'problem_solving', 'numerical', 'revision', 'quiz_generation', 'homework_help', 'assignment_help',
  'coding', 'debugging', 'research', 'summary', 'translation', 'planning', 'career_guidance',
  'image_explanation', 'notebook_search', 'document_question', 'follow_up', 'multi_topic',
  'general_chat', 'unknown',
]);

/** Confidence at/above which the fast heuristic result is trusted outright. */
const CONFIDENCE_THRESHOLD = 0.7;
const CACHE_TTL_SECONDS = 86_400;

/**
 * Default LLM classifier (guarded). Lazily uses the base Gemini provider to label ambiguous
 * queries. Any error → null → the heuristic stands. Kept out of the constructor so importing this
 * module never initializes a provider.
 */
class GeminiIntentClassifier implements LLMIntentClassifier {
  async classify(query: string, _history: Array<{ role: string; content: string }>): Promise<{ category: QueryCategory; confidence: number } | null> {
    try {
      const { GeminiProvider } = require('../../services/ai/gemini.provider');
      const provider = new GeminiProvider();
      const cats = Array.from(VALID_CATEGORIES).join(', ');
      const prompt = `Classify the student's query into EXACTLY ONE category from: ${cats}.
Reply with ONLY the category token, nothing else.
Query: "${query.slice(0, 500)}"`;
      const res = await provider.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }]);
      const token = (res?.reply || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
      if (VALID_CATEGORIES.has(token)) return { category: token as QueryCategory, confidence: 0.8 };
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * HybridIntentClassifier (Task 1) — keeps the deterministic heuristic as the PRIMARY path and only
 * escalates to an LLM classifier for the ambiguous tail (heuristic confidence < threshold), behind
 * the `hybridIntent` flag. Results are cached (KV) and merged; classifier behavior is tracked for
 * accuracy monitoring. Fully fail-open: if the flag is off, the query is confident, the cache/LLM
 * errors, or no classifier is available, it returns the heuristic result unchanged.
 */
export class HybridIntentClassifier {
  private stats: Omit<ClassifierStats, 'agreementRate'> = {
    total: 0, heuristicResolved: 0, llmInvoked: 0, llmAgreed: 0, llmOverrode: 0, cacheHits: 0,
  };

  constructor(
    private readonly heuristic: IntentAnalyzer = intentAnalyzer,
    private readonly llm: LLMIntentClassifier = new GeminiIntentClassifier(),
    private readonly cache: CacheService = cacheService,
  ) {}

  async classify(input: IntelligenceInput): Promise<HybridResult> {
    this.stats.total++;
    const h = this.heuristic.analyze(input);

    // Fast path: confident heuristic OR flag off → no LLM, no cache, zero added latency.
    if (!featureFlags.hybridIntent || h.confidence >= CONFIDENCE_THRESHOLD) {
      this.stats.heuristicResolved++;
      return { ...h, source: 'heuristic' };
    }

    // Ambiguous tail — consult cache first.
    const key = this.cacheKey(input.query);
    try {
      const cached = await this.cache.get<{ category: QueryCategory; confidence: number }>(key);
      if (cached && VALID_CATEGORIES.has(cached.category)) {
        this.stats.cacheHits++;
        return this.merge(h, cached, ['cache']);
      }
    } catch { /* cache miss / error → continue */ }

    // LLM fallback (guarded).
    let llmResult: { category: QueryCategory; confidence: number } | null = null;
    try {
      this.stats.llmInvoked++;
      llmResult = await this.llm.classify(input.query || '', input.history || []);
    } catch { llmResult = null; }

    if (!llmResult) {
      // Fail-open — heuristic stands.
      return { ...h, source: 'heuristic' };
    }

    if (llmResult.category === h.category) this.stats.llmAgreed++;
    else this.stats.llmOverrode++;

    try { await this.cache.set(key, llmResult, CACHE_TTL_SECONDS); } catch { /* non-fatal */ }
    return this.merge(h, llmResult, ['llm']);
  }

  getStats(): ClassifierStats {
    const denom = this.stats.llmAgreed + this.stats.llmOverrode;
    return { ...this.stats, agreementRate: denom === 0 ? 0 : this.stats.llmAgreed / denom };
  }

  resetStats(): void {
    this.stats = { total: 0, heuristicResolved: 0, llmInvoked: 0, llmAgreed: 0, llmOverrode: 0, cacheHits: 0 };
  }

  /** Merge heuristic + LLM/cache result. Agreement boosts confidence; disagreement trusts the LLM. */
  private merge(
    h: { category: QueryCategory; confidence: number; signals: string[] },
    other: { category: QueryCategory; confidence: number },
    extraSignals: string[],
  ): HybridResult {
    if (other.category === h.category) {
      return {
        category: h.category,
        confidence: Math.min(1, Math.max(h.confidence, other.confidence) + 0.1),
        signals: [...h.signals, ...extraSignals, 'agreement'],
        source: 'merged',
      };
    }
    return {
      category: other.category,
      confidence: other.confidence,
      signals: [`heuristic:${h.category}`, ...extraSignals, 'llm-override'],
      source: 'llm',
    };
  }

  private cacheKey(query: string): string {
    const norm = (query || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
    return `intent:v1:${norm}`;
  }
}

export const hybridIntentClassifier = new HybridIntentClassifier();
