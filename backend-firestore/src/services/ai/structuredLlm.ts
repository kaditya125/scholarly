import { GeminiProvider } from './gemini.provider';
import { safeJsonParse } from '../../utils/safeJson';
import { withRetry } from '../../utils/retry';
import { geminiLimiter } from '../../utils/rateLimiter';

/**
 * Result of a structured-LLM call. Never throws for parse/validation problems — inspect
 * `ok` and degrade gracefully. `usage` lets callers roll up per-source token cost.
 */
export interface StructuredResult<T> {
  ok: boolean;
  data: T | null;
  error?: string;
  /** repair/salvage was needed to parse the JSON. */
  repaired: boolean;
  /** a temperature-0 retry was performed. */
  retried: boolean;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface StructuredOptions<T> {
  ai?: GeminiProvider;
  prompt: string;
  system?: string;
  context?: { userId?: string; notebookId?: string; operation?: string };
  model?: string;
  /** Optional validator (e.g. a Zod `safeParse` wrapper). Return ok=false to force retry/fail. */
  validate?: (data: any) => { ok: boolean; error?: string };
  label?: string;
}

/**
 * callStructuredLLM — the single, robust path for LLM → typed JSON.
 *
 * Pipeline:  rate-limit → generate (JSON mode) → extract/repair/salvage → validate.
 * On parse/validation failure it retries ONCE at temperature 0 with a stricter system
 * instruction. Transient errors (429/5xx/network) are retried with backoff via withRetry.
 * It NEVER throws on malformed output — returns { ok:false } so ingestion continues.
 */
export async function callStructuredLLM<T = any>(opts: StructuredOptions<T>): Promise<StructuredResult<T>> {
  const ai = opts.ai || new GeminiProvider();
  const baseSystem = opts.system
    || 'You are a strict JSON generator. Output ONLY valid JSON — no markdown fences, no prose, no trailing commas.';

  const generate = async (temperature: number, system: string) => {
    await geminiLimiter.acquire();
    return withRetry(
      () => ai.generateResponse(
        [{ role: 'user', content: opts.prompt, timestamp: Date.now() }],
        system,
        { ...(opts.context || {}), temperature, responseJson: true, model: opts.model }
      ),
      { retries: 3, label: opts.label || 'structuredLLM' }
    );
  };

  const tryParse = (raw: string) => {
    const parsed = safeJsonParse<T>(raw);
    if (!parsed.ok) return { ok: false as const, data: null, repaired: parsed.repaired, error: parsed.error };
    if (opts.validate) {
      const v = opts.validate(parsed.data);
      if (!v.ok) return { ok: false as const, data: null, repaired: parsed.repaired, error: v.error || 'validation failed' };
    }
    return { ok: true as const, data: parsed.data, repaired: parsed.repaired };
  };

  // Attempt 1 — low temperature for determinism while keeping some quality.
  try {
    const r1 = await generate(0.2, baseSystem);
    const p1 = tryParse(r1.reply);
    if (p1.ok) {
      return { ok: true, data: p1.data, repaired: p1.repaired, retried: false, usage: r1.usage };
    }
  } catch (e: any) {
    // transient failure after retries — fall through to the temperature-0 attempt
    void e;
  }

  // Attempt 2 — temperature 0 + stricter instruction.
  try {
    const strict = `${baseSystem} Return strictly parseable JSON only.`;
    const r2 = await generate(0, strict);
    const p2 = tryParse(r2.reply);
    if (p2.ok) {
      return { ok: true, data: p2.data, repaired: p2.repaired, retried: true, usage: r2.usage };
    }
    return { ok: false, data: null, error: p2.error || 'parse/validation failed', repaired: p2.repaired, retried: true, usage: r2.usage };
  } catch (e: any) {
    return { ok: false, data: null, error: e?.message || String(e), repaired: false, retried: true };
  }
}
